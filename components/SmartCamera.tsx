// CameraScanner.js
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Dimensions, Image, Modal, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle, } from 'react-native';
import { useToast } from 'react-native-toast-notifications';
import type { WebView as WebViewType } from 'react-native-webview';
import { WebView } from 'react-native-webview';





const { width, height } = Dimensions.get('window');

type LiveCameraViewProps = {
  style?: StyleProp<ViewStyle>;
  flash?: FlashMode;
  facing?: CameraType;
  camRef: React.RefObject<any>;
  onScan?: (image: string) => void;
  setIsCameraVisible?: React.Dispatch<React.SetStateAction<boolean>>;
};



const LiveCameraView = forwardRef<any, LiveCameraViewProps>((props, ref) => {
  const { style, flash, facing, camRef, onScan, setIsCameraVisible } = props;
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const webviewRef = useRef<WebViewType>(null);
  const [corners, setCorners] = useState<{ x: number; y: number }[] | null>(null);
  const appState = useRef(AppState.currentState);
  const toast = useToast();
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(5);




  useImperativeHandle(ref, () => ({
    captureFrame
  }));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isWebViewReady) {
      toast.show("📦 Scanner loading...", { type: "info" });
    }
  }, [isWebViewReady]);


  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }

    // const interval = setInterval(() => {
    //   if (camRef.current && !modalVisible) {
    //     captureFrame();
    //   }
    //   setCountdown(10);
    // }, 10000); 

    // const countdownInterval = setInterval(() => {
    //   setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    // }, 1000);
    // return () => {
    //   clearInterval(interval);
    //   clearInterval(countdownInterval);
    // };
  }, [permission, modalVisible]);



  const edgeDetectorHTML = `<!DOCTYPE html>
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

    function orderPoints(pts) {
      const rect = new Array(4);
      const s = pts.map(p => p.x + p.y);
      const diff = pts.map(p => p.y - p.x);
      rect[0] = pts[s.indexOf(Math.min(...s))]; // top-left
      rect[2] = pts[s.indexOf(Math.max(...s))]; // bottom-right
      rect[1] = pts[diff.indexOf(Math.min(...diff))]; // top-right
      rect[3] = pts[diff.indexOf(Math.max(...diff))]; // bottom-left
      return rect;
    }

    function findDocumentContour(contours) {
      let maxArea = 0;
      let screenCnt = null;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const peri = cv.arcLength(c, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          const area = cv.contourArea(approx);
          if (area > maxArea) {
            maxArea = area;
            screenCnt = approx.clone();
          }
        }
        approx.delete();
      }
      return screenCnt;
    }

    function drawLiveContours(contours) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        ctx.beginPath();
        for (let j = 0; j < contour.data32S.length / 2; j++) {
          const x = contour.data32S[j * 2];
          const y = contour.data32S[j * 2 + 1];
          const scaleX = canvas.width / 600;
          const scaleY = canvas.height / 800;
          if (j === 0) {
            ctx.moveTo(x * scaleX, y * scaleY);
          } else {
            ctx.lineTo(x * scaleX, y * scaleY);
          }
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

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

        const ratio = src.rows / 500.0;
        const resized = new cv.Mat();
        const dsize = new cv.Size(Math.floor(src.cols / ratio), 500);
        cv.resize(src, resized, dsize, 0, 0, cv.INTER_AREA);

        let rgb = new cv.Mat();
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edged = new cv.Mat();

        cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
        cv.Canny(blurred, edged, 50, 200);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        drawLiveContours(contours);

        const screenCnt = findDocumentContour(contours);

        if (screenCnt) {
          const points = [];
          for (let i = 0; i < 4; i++) {
            const p = screenCnt.intPtr(i, 0);
            points.push({ x: p[0] * ratio, y: p[1] * ratio });
          }

          log("✅ Sending detected corners");
          window.ReactNativeWebView?.postMessage(JSON.stringify(points));

          const ordered = orderPoints(points);
          const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(...ordered.map(p => [p.x, p.y])));
          const maxWidth = 2480;
          const maxHeight = 3508;
          const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            maxWidth, 0,
            maxWidth, maxHeight,
            0, maxHeight
          ]);

          const M = cv.getPerspectiveTransform(srcTri, dstTri);
          const warped = new cv.Mat();
          cv.warpPerspective(src, warped, M, new cv.Size(maxWidth, maxHeight));

          const canvas2 = document.createElement('canvas');
          canvas2.width = maxWidth;
          canvas2.height = maxHeight;
          const ctx2 = canvas2.getContext('2d');
          const imageData = new ImageData(new Uint8ClampedArray(warped.data), warped.cols, warped.rows);
          ctx2.putImageData(imageData, 0, 0);

          const base64Scan = canvas2.toDataURL('image/jpeg', 1);
          log("📸 Scanned image ready");
          window.ReactNativeWebView?.postMessage(JSON.stringify({ scan: base64Scan }));

          rgb.delete(); gray.delete(); blurred.delete(); edged.delete();
          contours.delete(); hierarchy.delete();
          screenCnt.delete(); warped.delete(); srcTri.delete(); dstTri.delete(); M.delete();
        } else {
          log("❌ No document contour found");
        }

        src.delete(); resized.delete();
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
    if (captureInProgress.current || appState.current !== 'active') return;
    if (modalVisible) return;
    console.log("Triggered by someone0")
    const ref = camRef?.current;
    if (!ref || typeof ref.takePictureAsync !== 'function') {
      console.warn('⛔ camRef not ready or takePictureAsync is unavailable');
      toast.show("⛔ camRef not ready or takePictureAsync is unavailable", { type: "warning" })
      return;
    }

    if (!camRef.current) return;


    captureInProgress.current = true;

    try {
      setProcessing(true);
      const photo = await ref.takePictureAsync({
        base64: true,
        quality: 1,
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
      setProcessing(false);
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
      {processing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFD600" />
        </View>
      )}
      {/* <View style={{
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
      }}>
        <Text style={{ color: 'white', fontSize: 16 }}>
          Next scan in: {countdown}s
        </Text>
      </View> */}

      {/* 🟢 SVG Overlay */}
      {/* <Svg style={StyleSheet.absoluteFill}>
          {corners && corners.length === 4 && (
            <Polygon
              points={corners.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="lime"
              strokeWidth="3"
            />
          )}
        </Svg> */}


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
              toast.show(data.debug, { type: "info" })
              if (data.debug.includes("✅ OpenCV loaded")) {
                setIsWebViewReady(true);
              }
            } else if (Array.isArray(data)) {
              const scaled = data.map(p => ({
                x: (p.x / 600) * width,  // 600 = maxWidth in WebView
                y: (p.y / 800) * height, // 800 = maxHeight in WebView
              }));
              setCorners(scaled);
              console.log(scaled)
            } else if (data.scan) {
              setScannedImage(data.scan);
              setModalVisible(true);
              console.log("Modal showing")
              onScan?.(data.scan);
            }
          } catch (e) {
            console.error("Failed to parse WebView message:", e);
          }
        }}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View className='w-full flex items-center'>
              <Text className='text-[#FFD600] font-semibold text-[18px]'>Preview</Text>
            </View>
            <Image
              source={{ uri: scannedImage! }}
              style={styles.scannedImage}
              resizeMode="contain"
            />
            <View className='w-full flex flex-row items-center justify-between'>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setIsCameraVisible?.(false); // <-- hide camera after confirming
                }}
                style={[styles.closeButton, { backgroundColor: 'green', marginTop: 10 }]}
              >
                <Text style={styles.closeText}>Use This Image</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </>
  );
});


const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(24, 26, 32, 0.9)', // Dark background matching your app theme
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: '#232634', // Dark card background matching your app theme
    borderRadius: 12,
    padding: 20,
    elevation: 10,
  },
  scannedImage: {
    width: '100%',
    height: '85%',
    marginVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD600', // Yellow border for scanned image
  },
  closeButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFD600', // Yellow button background
    borderRadius: 8,
    alignItems: 'center',
    width: "45%",
  },
  closeText: {
    color: '#232634', // Dark text color for contrast
    fontWeight: 'bold',
  },
});

LiveCameraView.displayName = "LiveCameraView";

export default LiveCameraView;
