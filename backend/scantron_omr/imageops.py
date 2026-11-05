"""Low-level image helpers: decoding, illumination normalisation, quality checks."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

MAX_INPUT_SIDE = 3200


class ImageDecodeError(ValueError):
    pass


def decode_image(data: bytes) -> np.ndarray:
    """Decode bytes to BGR. EXIF orientation is honoured by OpenCV."""
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ImageDecodeError("Could not decode image. Upload a JPEG or PNG photo.")
    return limit_size(img, MAX_INPUT_SIDE)


def limit_size(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


def to_gray(img: np.ndarray) -> np.ndarray:
    return img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ink_image(img: np.ndarray, channel: str) -> np.ndarray:
    """Channel used to read marks. Coloured drop-out print (e.g. red/pink OMR
    sheets) disappears in its own colour channel while pencil stays dark."""
    if img.ndim == 2 or channel == "gray":
        return to_gray(img)
    return img[:, :, {"blue": 0, "green": 1, "red": 2}[channel]].copy()


def darkness_map(gray: np.ndarray, bubble_radius: float) -> np.ndarray:
    """Return float32 'ink' map in [0,1], robust to shadows and uneven light.

    The paper background is estimated with a grey-level closing (max filter)
    larger than any bubble, so ink is removed and only the illumination remains.
    Dividing by it flattens gradients, shadows and coloured paper tints.
    """
    k = int(bubble_radius * 3.2) | 1
    small = gray
    f = 1.0
    if max(gray.shape) > 1400:  # background is smooth; estimate it cheaply
        f = 0.5
        small = cv2.resize(gray, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        k = max(3, int(k * f) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    bg = cv2.morphologyEx(small, cv2.MORPH_CLOSE, kernel)
    bg = cv2.GaussianBlur(bg, (0, 0), k / 2)
    if f != 1.0:
        bg = cv2.resize(bg, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_LINEAR)
    bg = np.maximum(bg.astype(np.float32), 1.0)
    norm = gray.astype(np.float32) / bg
    return np.clip(1.0 - norm, 0.0, 1.0) * (1.0 / 0.85)  # ~black ink -> ~1.0


@dataclass
class Quality:
    sharpness: float
    brightness: float
    glare: float
    warnings: list[str]

    def as_dict(self) -> dict:
        return {
            "sharpness": round(self.sharpness, 1),
            "brightness": round(self.brightness, 1),
            "glare": round(self.glare, 4),
            "warnings": self.warnings,
        }


def assess_quality(sheet_gray: np.ndarray) -> Quality:
    """Quality metrics on the *aligned* sheet (so the background doesn't count)."""
    g = sheet_gray
    sharp = float(cv2.Laplacian(g, cv2.CV_64F).var())
    bright = float(np.mean(g))
    glare = float(np.mean(g >= 252))
    warnings: list[str] = []
    if sharp < 40:
        warnings.append("Image looks blurry - hold the phone steady and let it focus.")
    if bright < 90:
        warnings.append("Image is dark - move to better light or enable the flash.")
    if glare > 0.08:
        warnings.append("Strong glare detected - tilt the sheet away from direct light.")
    return Quality(sharp, bright, glare, warnings)
