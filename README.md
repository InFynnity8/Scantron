# Scantron — Mobile OMR Grading for MCQ Exams

Scantron grades multiple-choice answer sheets with a smartphone camera. Point
the phone at a sheet: it finds the page, reads every bubble and the student's
index number, grades against your answer key and shows the result on screen.
Results build up into a class report that you can export to Excel.

Scantron began as a third-year Computer Science project. **v2** rebuilds it
for real classroom use: a new computer-vision engine, an on-device engine
that works offline in real time, and a redesigned app.

https://github.com/user-attachments/assets/8ef3b510-b5ad-4006-b09d-d317b916a328

---

## Highlights

| | |
|---|---|
| 🎯 **Accurate** | 100% of answers and index numbers read correctly on 3,150 benchmark questions (60 photos with random rotation, perspective, shadows, blur, pencil/pen/faint marks) |
| ⚡ **Live and offline** | Printed Scantron sheets are graded **on the phone**: marks and score are drawn over the camera view, and the photo is captured automatically once the reading is stable. No internet, no upload |
| 🏫 **Institution sheets (KNUST)** | Calibrate any existing answer sheet from one blank scan, plus an optional mask. After a one-time download, these sheets are graded **on the phone, offline and live** too. No special markers needed; red drop-out print is removed automatically |
| 🆔 **Codes, not just answers** | Index numbers, course codes and other bubbled fields are read with a confidence for each character. Handwritten areas are cropped for review |
| 🧐 **Human in the loop** | Every answer has a confidence score. Blanks, multiple marks, erasures and unclear marks are flagged, and you can correct them with one tap |
| 📊 **Reports** | Excel export with **Results**, **Answer Key**, **Item Analysis** (difficulty and discrimination) and **Summary** sheets |
| 🔁 **Re-grade instantly** | Results are stored on the phone. Fixing a key entry re-scores every sheet without rescanning |

---

## How it works

```text
          ┌────────────────────────────── phone (React Native / Expo) ─────────────────────────────┐
 camera → │ frame ─► ArUco markers ─► homography ─► bubble fill ─► adaptive thresholds ─► grade  │ ← printed Scantron sheets
          │         (lib/omr, pure TypeScript, offline, ~0.5–1 s per frame)                      │   (live overlay + auto-capture)
          └───────────────┬─────────────────────────────────────────────────────────────────────┘
                          │ other sheet types (KNUST, auto)
                          ▼
          ┌────────────────────────── OMR API (FastAPI + OpenCV, backend/) ───────────────────────┐
          │ decode ─► align: ArUco │ SIFT feature registration │ page edges                       │
          │        ─► per-block shift refinement ─► illumination-normalised ink map               │
          │        ─► fills ─► adaptive thresholds + confidence ─► codes / answers ─► grade        │
          │        ─► annotated image + handwriting crops                                         │
          └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Why it is accurate**

1. **Exact geometry, not guesswork.** Each sheet type is a *template*: the
   exact centre of every bubble. Built-in sheets carry four ArUco fiducials,
   which give a sub-pixel perspective transform that works at any rotation.
   The marker IDs also identify which sheet it is. Institutional sheets are
   registered against a reference image with SIFT and a MAGSAC homography.
2. **Lighting-independent ink.** The paper background is estimated with a
   grey-level closing and divided out, which removes shadows, gradients and
   paper tint.
3. **Marks, not letters.** A bubble's fill score blends its mean ink with a
   low percentile. Printed letters inside bubbles cover a minority of the area
   and are ignored; a real mark covers most of it.
4. **Adaptive decisions.** Thresholds come from each sheet's own empty/filled
   separation, so pencil and pen both work. A per-question fallback catches
   faint but deliberate marks, and lone erasure smudges are excluded and
   flagged.
5. **Confidence and review flags** instead of silent guesses.

---

## Repository layout

```text
app/                    Expo Router screens
  (auth)/               login / register (auth service) or continue offline
  (app)/                exams, answer key, live scanner, sheet review, settings, printable sheets
components/             UI kit, live overlay, sheet viewer
lib/
  omr/                  on-device OMR engine (TypeScript) - generated.ts holds marker bits and templates
  scanner.ts            chooses the device or server engine, normalises results
  grading.ts            scoring, class statistics, item analysis
  excel.ts              XLSX report
  store.ts              local-first persistence (AsyncStorage + files)
backend/
  scantron_omr/         Python OMR engine (template, align, reader, grading, render, calibrate)
  server/main.py        FastAPI service
  templates/            external sheet templates (e.g. KNUST) - see templates/README.md
  tests/                end-to-end accuracy tests on synthetic and real photos
  scripts/              benchmark, mobile asset export, device fixtures
scripts/test-device-engine.mjs   accuracy test for the TypeScript engine
```

---

## Running it

### 1. Grading API (backend)

```bash
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn server.main:app --reload --port 8000      # docs at http://localhost:8000/docs
pytest -q                                         # 24 end-to-end tests
python scripts/benchmark.py --sheets 60           # accuracy benchmark
```

**Deploy:** `render.yaml` is a Render Blueprint (Docker, free plan). In Render,
choose *New → Blueprint*, pick this repo, and it creates the `scantron-omr`
service. Any Docker host works too: `docker build -t scantron-omr backend`.

| Env var | Purpose |
|---|---|
| `SCANTRON_JWT_SECRET` | Optional. Set it to the auth service's `JWT_SECRET` to require signed-in users |
| `SCANTRON_TEMPLATES_DIR` | Extra folder of template JSONs |
| `SCANTRON_MAX_UPLOAD_MB` | Upload limit (default 15) |
| `WEB_CONCURRENCY` | Uvicorn workers |

### 2. Mobile app

```bash
npm install
npx expo start            # needs a dev build (expo-dev-client); Expo Go lacks some modules
npm run typecheck && npm run lint
npm run test:engine       # on-device engine accuracy (uses the backend venv for fixtures)
```

The server URLs default to `EXPO_PUBLIC_OMR_API_URL` and
`EXPO_PUBLIC_AUTH_API_URL`, set per build profile in `eas.json`. You can change
them at runtime under **Settings → Servers**.

**Builds:** `.eas/workflows/create-builds.yml` builds an Android APK on every
push to `main`. You can also run `npx eas-cli build -p android --profile preview`.

### 3. Print sheets

Open **Printable sheets** in the app, or
`GET /v1/templates/std-60/sheet?format=pdf`. Print on A4 at 100% scale.

---

## Using KNUST / institutional sheets

The **KNUST IDL answer sheet** (`knust-idl-200`) is built in. It reads 200
questions, the candidate number, the course code (for example `BIT466`), the
department code, the academic year, the year of student and the semester. Pick
*KNUST IDL answer sheet (200)* when you create an exam.

For other sheet designs, run calibration once per sheet design, from one blank scan. The full guide is
in [backend/templates/README.md](backend/templates/README.md).

```bash
python -m scantron_omr.calibrate blank_knust.jpg --out templates/knust-60 \
    --id knust-60 --name "KNUST answer sheet (60)" --field index_number:digits:7
```

Commit the generated folder and redeploy. The sheet then appears in the app,
which downloads its template and blank reference once. From then on it is
graded on the phone with no internet. The phone finds the paper edges, then
locks onto the printed blocks by correlating them with the reference and
refits the perspective from all of them. The server still uses SIFT
registration, and both are verified against the reference before reading.

---

## API

| Method | Path | |
|---|---|---|
| `GET` | `/health` | liveness |
| `GET` | `/v1/templates` | available sheet types |
| `GET` | `/v1/templates/{id}` | geometry and spec |
| `GET` | `/v1/templates/{id}/sheet?format=pdf\|png` | printable sheet |
| `POST` | `/v1/scan` | multipart: `image`, `template` (`detect` \| id \| `auto`), `answer_key` (`"BEADB"` or JSON), `scoring`, `include_images` |

The `POST /v1/scan` response, abridged:

```jsonc
{
  "template": { "id": "std-60", ... },
  "student_id": { "value": "3392022", "confidence": 0.97, "issues": [] },
  "fields": { "index_number": { "value": "3392022", "characters": [ ... ] } },
  "questions": [ { "label": "1", "marked": ["B"], "status": "answered", "confidence": 1.0,
                   "flags": [], "key": ["B"], "result": "correct", "points": 1 } ],
  "score": 52, "max_score": 60, "percentage": 86.67,
  "review": { "needed": true, "questions": ["17"], "reasons": ["1 question(s) have unclear marks"] },
  "alignment": { "method": "markers", "reprojection_error_px": 0.3 },
  "quality": { "sharpness": 112.9, "warnings": [] },
  "images": { "annotated": "data:image/jpeg;base64,...", "regions": { "name": { ... } } }
}
```

---

## Evaluation

| Test | Result |
|---|---|
| Server engine, 60 random synthetic phone photos (rotation 0–360°, perspective, shadows, blur, JPEG 60–95, pencil/pen/faint) | **100% of 3,150 answers, 100% of index numbers**, median 262–318 ms |
| On-device engine, same conditions at 760 px live-frame resolution | **100% of 1,720 answers, 100% of index numbers**, ~50 ms grading (Node) |
| Feature-registered "institutional" sheet (no markers), calibrated from one blank photo | 6/6 sheets exact, including 90° and 180° rotation |
| Simulated KNUST-style sheet (200 Q, `<A>` options, pink drop-out ink), server | 5/5 sheets exact, including 90° and 180° rotation |
| Same, **on-device** (paper edges + reference block registration) | 10/10 sheets, 2,000/2,000 answers, 100% candidate numbers |
| **Real KNUST IDL sheet**: 3 phone photos (upright, tilted, landscape) and 1 low-res scan of one filled sheet, server and phone | candidate number, year and semester correct on all 4; answers identical on all 4 except Q120 (a mark offset left of its cell), which is read or flagged for review; course code `BIT466`, with one faint digit flagged `?` |
| Real KNUST IDL template, synthetic filled copies (dark and wood desks, shadows, 180°), server 4/4 and phone 10/10 | every answer and every header field exact |
| Mask-based calibration of the KNUST-style sheet | every option recovered within 1.5 px; graded sheets exact at 0° and 180° |
| Previous v1 backend on a simple 5-question sheet | 1/5 correct, phantom 6th question, ID `0` |

> Synthetic benchmarks are no substitute for a field study. The next step is a
> labelled set of real KNUST sheets across phones and lighting; the
> `scripts/benchmark.py` tooling is built for it.

---

## Limitations and roadmap

- **Live-frame rate:** the overlay updates about 1–2× per second using Expo's
  camera. A 30 fps overlay needs `react-native-vision-camera` frame processors;
  the engine is pure TypeScript and was written so it can move there.
- **KNUST on-device registration** works best with the whole sheet in frame on
  a surface darker than the paper. Wooden desks and uneven light are handled;
  a flat scan with no background also works.
- **Handwriting** (names, written index numbers) is cropped for human review,
  not recognised.
- Planned next: LMS/CSV import of class lists, multi-page exams, cloud sync of results.

---

## Research context

Scantron explores mobile Optical Mark Recognition as a low-cost alternative to
dedicated OMR hardware. Topics include classical computer vision for document
registration, robust mark detection, human-in-the-loop verification, and
low-cost educational technology.

<img width="2550" height="3300" alt="Emmanuel Fynn-Sackey(3392022)-2_page-0001" src="https://github.com/user-attachments/assets/c30fa6ab-ff3a-4344-8d5c-0f941ae29642" />

### References

1. Kulkarni, S. et al. (2024). *A Survey on OMR Automated Grading System*. IJRTI.
2. Shivapur, S. et al. (2022). *OMR Sheet Scanner using Image Processing in Android*. Zenodo.
3. Siregar, M. et al. (2023). *Efficient Camera-Based MCQ Grading System*. IJISAE.
4. Garrido-Jurado, S. et al. (2014). *Automatic generation and detection of highly reliable fiducial markers under occlusion* (ArUco). Pattern Recognition 47(6).
5. Lowe, D. (2004). *Distinctive Image Features from Scale-Invariant Keypoints* (SIFT). IJCV 60(2).
