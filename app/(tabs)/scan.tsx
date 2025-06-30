/* eslint-disable import/no-named-as-default-member */
import React, { useEffect, useRef, useState } from 'react';
import { View, Button, Image, ActivityIndicator, Text, SafeAreaView, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, Pressable } from 'react-native';
import { CameraView, useCameraPermissions, CameraType, FlashMode } from 'expo-camera';
import { useToast } from 'react-native-toast-notifications';
import { Zoomable } from '@likashefqet/react-native-image-zoom';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import RadioButtonCustom from '@/components/RadioButtonCustom';


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

const allowedFields = [
  "score",
  "ID",
  "score_percentage",
  "total_questions",
  "choices"
];


export default function Scan() {
  const [hasPermission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResponseType | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const toast = useToast();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  // const [answers, setAnswers] = useState<{ [key: number]: number | undefined }>({});
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number | undefined }>({});
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [captureMode, setCaptureMode] = useState<boolean>(false)
  const [jsonResponses, setJsonResponses] = useState<any[]>([]);
  const [formattedChoices, setFormattedChoices] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);


  const resultsDir = FileSystem.documentDirectory + "Scanned_results/";


  const ensureResultsFolderExists = async () => {
    const dirInfo = await FileSystem.getInfoAsync(resultsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(resultsDir, { intermediates: true });
    }
  };

  const prepareDataForExcel = (data: any[]) => {
    return data.map(item => {
      const flattenedChoices = formattedChoices.reduce((acc, entry) => {
        const [qNum, answer] = entry.split(":");
        acc[`Q${qNum}`] = answer;
        return acc;
      }, {} as Record<string, string>);

      console.log(flattenedChoices, "choices")
      return {
        ID: item.ID,
        Score: item.score,
        OverHundred: `${item.score_percentage}%`,
        Total: item.total_questions,
        ...flattenedChoices
      };
    });
  };

  const exportToExcel = async () => {

    await ensureResultsFolderExists();

    // Flatten or normalize data if needed
    const worksheet = XLSX.utils.json_to_sheet(prepareDataForExcel(jsonResponses));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const wbout = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

    // Generate a unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `Results_${timestamp}.xlsx`;
    const fileUri = resultsDir + filename;

    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    Alert.alert(`Saved to ${fileUri}`);

    // Share the file
    await Sharing.shareAsync(fileUri);
  };

  const toggleFlash = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };


  const handleTotalChange = (text: string) => {
    const parsed = parseInt(text);
    if (!isNaN(parsed) && parsed > 0) {
      setTotalQuestions(parsed);
    } else {
      setTotalQuestions(0);
    }
  }





  useEffect(() => {
    if (result?.choices) {
      const handleChoices = (choices: any[]) => {
        const letterOptions = ["A", "B", "C", "D", "E"];
        const mapped = choices.map((choice, question_num) => {
          const letter = letterOptions[choice] ?? "None";
          return `${question_num + 1}:${letter}`;
        });
        return mapped
      }

      const choicesArray = handleChoices(Object.values(result.choices));
      setFormattedChoices(choicesArray);
    }
  }, [result?.choices]);

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
    const isAnswerKeyComplete = Object.keys(selectedAnswers).length === totalQuestions;
    if (!isAnswerKeyComplete) {
      toast.show("Please enter answers for all questions before uploading.", { type: "danger" });
      return;
    }

    setLoading(true);
    console.log(selectedAnswers)
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/png',
      name: 'image.png',
    } as any);
    formData.append('answer_key', JSON.stringify(selectedAnswers));
    console.log('Uploading image:', uri);
    console.log('Form data:', formData.getAll('file'));
    try {
      const res = await fetch('https://bubble-sheet-marker-backend.onrender.com/scan', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      setResult(json);// Filter to include only allowed fields
      const filteredJson = Object.fromEntries(
        Object.entries(json).filter(([key]) => allowedFields.includes(key))
      );

      setJsonResponses(prev => [...prev, filteredJson]);
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
      {image
        ? (
          <SafeAreaView style={{ height: "100%" }}>
            <SafeAreaView style={styles.centeredView}>
              <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => {
                  Alert.alert('Modal has been closed.');
                  setModalVisible(!modalVisible);
                }}>
                <View style={{ height: "100%" }}>
                  <View style={styles.modalView}>
                    <View className='pt-10 pb-2' style={{ height: "90%" }}>
                      <View className='mb-5'>
                        <Text className='font-medium text-[30px] text-center'>Marking Scheme</Text>
                      </View>
                      <View className='w-full flex flex-row items-start justify-between'>
                        <View>
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
                        </View>
                        <Button title="Reset" onPress={() => { setTotalQuestions(0); setSelectedAnswers({}) }} />
                      </View>
                      <ScrollView
                        contentContainerStyle={styles.grid}
                      >
                        {[...Array(totalQuestions || 0)].map((_, index) => (
                          <View key={index} className={`${index % 2 ? "bg-slate-300" : "bg-white"}  flex-row flex w-full p-3 justify-center`}>
                            <Text>Question {index + 1}: </Text>
                            <RadioButtonCustom key={index}
                              questionIndex={index}
                              selectedOption={selectedAnswers[index] || ''}
                              onSelect={(qIndex: number, value: number) => {
                                setSelectedAnswers(prev => ({
                                  ...prev,
                                  [qIndex]: value
                                }));
                              }} />
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                    <Pressable
                      style={[styles.button, styles.buttonClose]}
                      onPress={() => setModalVisible(!modalVisible)}>
                      <Text style={styles.textStyle}>Finish</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
              <Pressable
                style={[styles.button, styles.buttonOpen]}
                onPress={() => setModalVisible(true)}>
                <Text style={styles.textStyle}>Edit Marking Scheme</Text>
              </Pressable>
            </SafeAreaView>

            {/* images */}
            <View className='flex-1 px-3'>
              <ScrollView horizontal={false} showsHorizontalScrollIndicator={false}>
                <View className='flex justify-center w-full items-center gap-2 py-10'>
                  {/* original and final image */}
                  <View className='flex flex-row gap-2 min-w-[150px]'>
                    <View className='border border-blue-600' style={{ width: 150, height: 220, }}>
                      <Text>Original:</Text>
                      <Zoomable isDoubleTapEnabled>
                        <Image
                          source={{ uri: image ?? undefined }}
                          style={{ width: 150, height: 200, objectFit: "contain" }}
                        />
                      </Zoomable>
                    </View>
                    <View className='border border-green-600' style={{ width: 150, height: 220, }}>
                      <Text>Final:</Text>
                      {loading ? (
                        <ActivityIndicator size="small" className='h-full' />
                      ) : <Zoomable isDoubleTapEnabled>
                        <Image
                          source={{ uri: result?.annotated_image }}
                          style={{ width: 150, height: 200, objectFit: 'contain' }}
                        />
                      </Zoomable>
                      }
                    </View>
                  </View>
                  {/* marked and ID annotated images */}
                  <View className='flex flex-row gap-2'>
                    <View className='border border-rose-600' style={{ width: 150, height: 220, }}>
                      <Text>Marked sheet:</Text>
                      {loading ? (
                        <ActivityIndicator size="small" className='h-full' />
                      ) : <Zoomable isDoubleTapEnabled><Image
                        source={{ uri: result?.annotated_image_marked }}
                        style={{ width: 150, height: 200, objectFit: 'contain' }}
                      /></Zoomable>}
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
                  <Text>Student Choices: {formattedChoices.join(", ")}</Text>

                </View>)}

              </ScrollView>

              <View className='flex justify-around flex-row items-center'>
                <Button title="Capture" onPress={() => { setImage(null); setResult(null); setCaptureMode(true) }} />
                <Button title="Export" onPress={exportToExcel} disabled={result === null} />
                <Button title="Upload" onPress={() => uploadImage(image)} />
              </View>

            </View>
          </SafeAreaView>
        ) : (
          <SafeAreaView className=' h-full flex items-center justify-end w-full relative' >
            <CameraView flash={flash}
              style={{ width: "100%", height: "100%", position: "absolute" }} ref={cameraRef} facing={facing}>
            </CameraView>
            <View className='gap-2 flex items-center justify-around w-full flex-row bg-[rgba(0,0,0,0.32)] py-3'>
              <TouchableOpacity onPress={toggleFlash} className=' flex items-center justify-center'>
                {flash === "on" ? <Ionicons name="flash" size={24} color="white" /> :
                  <Ionicons name="flash-off" size={30} color="white" />}
              </TouchableOpacity>
              <View className='p-[3px] rounded-full bg-[rgba(255,255,255,0.44)]'>
                <TouchableOpacity onPress={takePicture} className='bg-[rgb(31,36,85)] rounded-full w-20 h-20 flex items-center justify-center'>
                  <MaterialIcons name="document-scanner" size={30} color="white" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={toggleCameraFacing} className='  flex items-center justify-center'>
                <MaterialIcons name="cameraswitch" size={30} color="white" />
              </TouchableOpacity>
            </View>

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
    width: "100%",
    borderWidth: 1,
    borderColor: "#2196F3"
  },
  centeredView: {
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 5
  },
  modalView: {
    marginVertical: 20,
    display: "flex",
    justifyContent: "center",
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    height: "100%",
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  buttonOpen: {
    backgroundColor: 'rgb(31,36,85)',
    marginTop: 30
  },
  buttonClose: {
    backgroundColor: '#2196F3',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  },
});
