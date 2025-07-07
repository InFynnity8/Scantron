// CameraScanner.js
import React, { useRef, useEffect, forwardRef, useState } from 'react';
import { View, StyleSheet, Text, StyleProp, ViewStyle, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions, CameraCapturedPicture, CameraType, FlashMode } from 'expo-camera';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import Svg, { Polygon } from 'react-native-svg';
import { useToast } from 'react-native-toast-notifications';
import { AppState } from 'react-native';





const { width, height } = Dimensions.get('window');

type LiveCameraViewProps = {
    style?: StyleProp<ViewStyle>;
    flash?: FlashMode;
    facing?: CameraType;
    camRef: React.RefObject<any>;
};



const LiveCameraView: React.FC<LiveCameraViewProps> = ({ style, flash, facing, camRef }) => {
    const [permission, requestPermission] = useCameraPermissions();
    const webviewRef = useRef<WebViewType>(null);
    const [corners, setCorners] = useState<{ x: number; y: number }[] | null>(null);
    const appState = useRef(AppState.currentState);
    const toast = useToast();


    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, []);


    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
            return;
        }

        const interval = setInterval(() => {
            if (camRef.current) {
                captureFrame();
            }
        }, 10500); // slow it down for stability

        return () => clearInterval(interval);
    }, [permission]);



    const edgeDetectorHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; overflow: hidden; }
    canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    const log = (msg) => {
      window.ReactNativeWebView?.postMessage(JSON.stringify({ debug: msg }));
    };

    log("📦 Loading OpenCV...");
  </script>
  <script src="https://docs.opencv.org/4.x/opencv.js" onload="onOpenCvReady()" async></script>
  <script>
    let cvReady = false;

    function onOpenCvReady() {
      cvReady = true;
      log("✅ OpenCV loaded");
    }

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('message', function (e) {
      if (!cvReady) {
        log("❌ OpenCV not ready yet");
        return;
      }

      log("📷 Frame received");

      let base64 = e.data;
      let img = new Image();
      img.onload = () => {
        log("🖼 Image loaded");

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        let imageData = tempCtx.getImageData(0, 0, img.width, img.height);
        let src = cv.matFromImageData(imageData);
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edged = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edged, 75, 200);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let biggest = null;
        let maxArea = 0;
        for (let i = 0; i < contours.size(); i++) {
          let cnt = contours.get(i);
          let peri = cv.arcLength(cnt, true);
          let approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
          if (approx.rows === 4) {
            let area = cv.contourArea(approx);
            if (area > maxArea) {
              biggest = approx;
              maxArea = area;
            }
          }
        }

        if (biggest) {
          let points = [];
          for (let i = 0; i < 4; i++) {
            let p = biggest.intPtr(i, 0);
            points.push({ x: p[0], y: p[1] });
          }

          log("✅ Sending detected corners");
          window.ReactNativeWebView?.postMessage(JSON.stringify(points));
        } else {
          log("❌ No document contour found");
        }

        src.delete(); gray.delete(); blurred.delete(); edged.delete();
        contours.delete(); hierarchy.delete();
      };
      img.onerror = () => log("❌ Error loading image");
      img.src = 'data:image/jpeg;base64,' + base64;
    });
  </script>
</body>
</html>
`;
    const captureInProgress = useRef(false);


    const captureFrame = async () => {
        if (captureInProgress.current) return;
        if (appState.current !== 'active') return;

        const ref = camRef?.current;
        if (!ref || typeof ref.takePictureAsync !== 'function') {
            console.warn('⛔ camRef not ready or takePictureAsync is unavailable');
            return;
        }

        if (!camRef.current) return;


        captureInProgress.current = true;

        try {
            const photo = await ref.takePictureAsync({
                base64: true,
                quality: 0.3,
                skipProcessing: true,
            });

            if (!photo.base64) {
                console.warn("⚠️ No base64 data returned");
                return;
            }

            // Confirm we're posting
            console.log("📤 Sending frame to WebView");
            webviewRef.current?.postMessage(photo.base64);
        } catch (err) {
            console.warn("❌ Capture error:", err);
        } finally {
            captureInProgress.current = false;
        }
    };


    if (!permission?.granted) {
        return <Text>Camera permission not granted</Text>;
    }

    return (
        <>
            <CameraView
                ref={camRef}
                style={style}
                flash={flash}
                facing={facing}
            />
            {/* 🟢 SVG Overlay */}
            <Svg style={StyleSheet.absoluteFill} >
                {corners && corners.length === 4 && (
                    <Polygon
                        points={corners.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="lime"
                        strokeWidth="3"
                    />
                )}
            </Svg>
            <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: edgeDetectorHTML }}
                javaScriptEnabled
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'transparent',
                }}
                onMessage={(event) => {
                    try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.debug) {
                            console.log("[WebView DEBUG]:", data.debug);
                        } else if (Array.isArray(data)) {
                            console.log("🔷 Corners received:", data);
                            toast.show("Read to take", { type: "info" });
                            setCorners(data); // <- set live contours here
                        }
                    } catch (e) {
                        console.error("Failed to parse WebView message:", e);
                    }
                }}
            />
        </>
    );
}



export default LiveCameraView;
