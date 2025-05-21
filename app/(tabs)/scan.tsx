import React, { useRef, useState } from 'react';
import { View, Button, Image, ActivityIndicator, Text, SafeAreaView, Touchable, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';

interface ResponseType {
    score: number,
    ID: number,
    score_percentage: number,
    total_questions: number,
    choices: object,
    annotated_image: string,
    annotated_image_id: string,
    annotated_image_marked: string
}

export default function Scan() {
  const [hasPermission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResponseType | null>(null);
  const cameraRef = useRef<CameraView>(null);


  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setImage(photo.uri);
      uploadImage(photo.uri);
    }
  };

  const uploadImage = async (uri: any) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/png',
      name: 'image.png',
    } as any);
    console.log('Uploading image:', uri);
    console.log('Form data:', formData.getAll('file'));
    try {
      const res = await fetch('https://bubble-sheet-marker-backend.onrender.com/scan', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      setResult(json);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!hasPermission) {
    return <Text>Requesting permissions...</Text>;
  }

  if (!hasPermission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No camera access</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {image ? (
        <>
          <Image source={{ uri: image }} style={{ flex: 1 }} />
          <Image
            source={{ uri: result?.annotated_image }}
            style={{ width: 200, height: 270, objectFit: 'contain' }}
          />
          {loading ? (
            <ActivityIndicator size="large" />
          ) : result ? (
            <Text style={{ padding: 10 }}>Score: {result.score}</Text>
          ) : null}
          <Button title="Retake" onPress={() => setImage(null)} />
        </>
      ) : (
        <SafeAreaView className=' h-full flex items-center justify-center w-full' >
          <CameraView style={{ width: "100%", height: "100%" }} ref={cameraRef} facing={facing}>
            <View className='bg-[rgba(0,0,0,0.38)] text-white flex items-center justify-center'>
              <Text style={{ padding: 10, color: "white" }}>Camera is {facing}</Text>
            </View>
            <View className='gap-2 flex items-center justify-center flex-row w-full h-full'>
              <TouchableOpacity onPress={takePicture} className='bg-[rgba(0,0,0,0.38)] text-white flex items-center justify-center'>
                <Text style={{ padding: 10, color: "white" }}>Capture Bubble Sheet</Text>  
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleCameraFacing} className='bg-[rgba(0,0,0,0.38)] text-white flex items-center justify-center'>
                <Text style={{ padding: 10, color: "white" }}>Toggle Camera</Text>  
              </TouchableOpacity>
            </View>
          </CameraView>

        </SafeAreaView>
      )}
    </View>
  );
}
