import React, { useRef, useState } from 'react';
import { View, Button, Image, ActivityIndicator, Text, SafeAreaView, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { useToast } from 'react-native-toast-notifications';

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
  const toast = useToast();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [answers, setAnswers] = useState<{ [key: number]: number | undefined }>({});
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [captureMode, setCaptureMode] = useState<boolean>(false)



  const handleTotalChange = (text: string) => {
    const parsed = parseInt(text);
    if (!isNaN(parsed) && parsed > 0) {
      setTotalQuestions(parsed);
    } else {
      setTotalQuestions(0);
    }
  }

  const handleChange = (index: number, value: string) => {
    console.log(answers, index)
    const intValue = parseInt(value);
    if (value === '' || (intValue >= 0 && intValue <= 4)) {
      setAnswers((prev) => ({
        ...prev,
        [index]: value === '' ? undefined : intValue,
      }))
    };
    if (value.length === 1 && index < totalQuestions - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChoices = (choices: any[]) => {
    let formatedChoices: any[] = []
    choices.map((choice, quesion_num) => {
      switch (choice) {
        case 0:
          formatedChoices.push(`${quesion_num + 1}:A`)
          break;
        case 1:
          formatedChoices.push(`${quesion_num + 1}:B`)
          break;
        case 2:
          formatedChoices.push(`${quesion_num + 1}:C`)
          break;
        case 3:
          formatedChoices.push(`${quesion_num + 1}:D`)
          break;
        case 4:
          formatedChoices.push(`${quesion_num + 1}:E`)
          break;

        default:
          formatedChoices.push(`${quesion_num + 1}:None`)
          break;
      }
    })
    // setFormatedChoices(formatedChoices)
    return formatedChoices
  }


  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setImage(photo.uri);
      setCaptureMode(false)
    }
  };

  const uploadImage = async (uri: any) => {
    const isAnswerKeyComplete = Object.keys(answers).length === totalQuestions;
    if (!isAnswerKeyComplete) {
      toast.show("Please enter answers for all questions before uploading.", { type: "danger" });
      return;
    }

    setLoading(true);
    console.log(answers)
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/png',
      name: 'image.png',
    } as any);
    formData.append('answer_key', JSON.stringify(answers));
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
      toast.show("Something went wrong. Please position the camera and retake", { type: "danger" });
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
    <View className='flex-1'>

      {image || !captureMode
        ? (
          <>
            <View className='pt-10 pb-2' style={{ height: 220 }}
            >
              <Text>Enter Answers (0-4) i.e A=0, B=1, C=2, D=3, E=4:</Text>
              <View className='flex flex-row items-center'>
                <Text>Total number of questions:</Text>
                <TextInput
                  keyboardType='numeric'
                  maxLength={3}
                  value={totalQuestions.toString()}
                  onChangeText={(text) => handleTotalChange(text)}
                  style={{
                    borderWidth: 1,
                    borderColor: 'gray',
                    margin: 5,
                    padding: 2,
                    width: 50
                  }} />
                <Button title="Clear all" onPress={() => {setTotalQuestions(0); setAnswers({})}} />
              </View>
              <ScrollView
                contentContainerStyle={styles.grid}
              >
                {[...Array(totalQuestions || 0)].map((_, index) => (
                  <>
                    {/* <Text> {index + 1}. </Text> */}
                    <TextInput
                      key={index}
                      ref={(ref) => { inputRefs.current[index] = ref }}
                      keyboardType="numeric"
                      placeholder={`Answer ${index + 1}`}
                      maxLength={1}
                      placeholderTextColor="gray"
                      value={answers[index] !== undefined ? answers[index]?.toString() : ''}
                      onChangeText={(text) => handleChange(index, text)}
                      style={{
                        borderWidth: 1,
                        borderColor: 'gray',
                        margin: 5,
                        padding: 2,
                        width: 80
                      }}
                    />
                  </>
                ))}
              </ScrollView>
            </View>

            <View className='flex-1 px-3'>
              <ScrollView horizontal={false} showsHorizontalScrollIndicator={false}>
                <View className='flex justify-center w-full items-center gap-2 py-10'>
                  {/* original and final image */}
                  <View className='flex flex-row gap-2 min-w-[150px]'>
                    <View className='border border-blue-600' style={{ width: 150, height: 220, }}>
                      <Text>Original:</Text>
                      <Image
                        source={{ uri: image }}
                        style={{ width: 150, height: 200, objectFit: "contain" }}
                      />
                    </View>
                    <View className='border border-green-600' style={{ width: 150, height: 220, }}>
                      <Text>Final:</Text>
                      {loading ? (
                        <ActivityIndicator size="small" className='h-full' />
                      ) : <Image
                        source={{ uri: result?.annotated_image }}
                        style={{ width: 150, height: 200, objectFit: 'contain' }}
                      />}
                    </View>
                  </View>
                  {/* marked and ID annotated images */}
                  <View className='flex flex-row gap-2'>
                    <View className='border border-rose-600' style={{ width: 150, height: 220, }}>
                      <Text>Marked sheet:</Text>
                      {loading ? (
                        <ActivityIndicator size="small" className='h-full' />
                      ) : <Image
                        source={{ uri: result?.annotated_image_marked }}
                        style={{ width: 150, height: 200, objectFit: 'contain' }}
                      />}
                    </View>
                    <View className='border border-violet-950' style={{ width: 150, height: 220, }}>
                      <Text>ID notation:</Text>
                      {loading ? (
                        <ActivityIndicator size="small" className='h-full' />
                      ) : <Image
                        source={{ uri: result?.annotated_image_id }}
                        style={{ width: 150, height: 200, objectFit: 'contain' }}
                      />}
                    </View>
                  </View>
                </View>
                {/* info results */}
                {loading ? (
                  <ActivityIndicator size="large" />
                ) : result && (<View className="">
                  <Text className='font-medium text-xl text-blue-500'>Info on this paper:</Text>
                  <Text>Student Score: {result?.score_percentage}% ( {result?.score} out of {result?.total_questions} )</Text>
                  <Text>Student ID: {result.ID}</Text>
                  <Text>Student Choices: {handleChoices(Object.values(result.choices))}</Text>
                </View>)}
              </ScrollView>

              <Button title="Capture" onPress={() => {setImage(null); setResult(null); setCaptureMode(true)}} />
              <Button title="Upload" onPress={() => uploadImage(image)} />
            </View>
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


const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
