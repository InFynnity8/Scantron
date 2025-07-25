/* eslint-disable import/no-named-as-default-member */
import RadioButtonCustom from '@/components/RadioButtonCustom';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Zoomable } from '@likashefqet/react-native-image-zoom';
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { router } from "expo-router"; // Add this import at the top if not present
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, Dimensions, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useToast } from 'react-native-toast-notifications';
import XLSX from 'xlsx';
import LiveCameraView from '../../components/SmartCamera';

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
  const webViewRef = useRef(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const toast = useToast();
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number | undefined }>({});
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [captureMode, setCaptureMode] = useState<boolean>(false)
  const [jsonResponses, setJsonResponses] = useState<any[]>([]);
  const [formattedChoices, setFormattedChoices] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [isCameraVisible, setIsCameraVisible] = useState(true);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // 1. Add new state for export modal and filename:
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportFileName, setExportFileName] = useState("");

  // 1. Add a new state to track upload error:
  const [uploadError, setUploadError] = useState(false);

  const liveCamRef = useRef<any>(null);
  const carouselScrollRef = useRef<ScrollView>(null);

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
      return {
        ID: item.ID,
        Score: item.score,
        OverHundred: `${item.score_percentage}%`,
        Total: item.total_questions,
        ...flattenedChoices
      };
    });
  };

  // 2. Update exportToExcel to accept a filename:
  const exportToExcel = async (fileName: string) => {
    await ensureResultsFolderExists();
    const worksheet = XLSX.utils.json_to_sheet(prepareDataForExcel(jsonResponses));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const wbout = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
    const safeName = fileName.replace(/[^a-zA-Z0-9-_]/g, "_") || "Results";
    const filename = `${safeName}.xlsx`;
    const fileUri = resultsDir + filename;
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });
    Alert.alert(`Saved to ${fileUri}`);
    await Sharing.shareAsync(fileUri);

    // Clear the array and route to saved files
    setJsonResponses([]);
    router.push("/saved_files");
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
      
    console.log("boys:", formattedChoices, choicesArray);
    }
  }, [result?.choices]);

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // const takePicture = async () => {
  //   if (cameraRef.current) {
  //     const photo = await cameraRef.current.takePictureAsync();
  //     setImage(photo.uri);
  //   }
  // };

  const handleScan = (image: string) => {
    setImage(image);
  };

  // 2. Update uploadImage to set uploadError accordingly:
  const uploadImage = async (uri: any) => {
    setResult(null);
    setUploadError(false);
    const isAnswerKeyComplete = Object.keys(selectedAnswers).length === totalQuestions;
    if (!isAnswerKeyComplete) {
      toast.show("Please enter answers for all questions before uploading.", { type: "danger" });
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/png',
      name: 'image.png',
    } as any);
    formData.append('answer_key', JSON.stringify(selectedAnswers));
    try {
      const res = await fetch('https://bubble-sheet-marker-backend.onrender.com/scan', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      setResult(json);
      setUploadError(false);
      toast.show("Marked Successfully!", { type: "success" });
    } catch (err) {
      setUploadError(true);
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: "#181A20" }}>
        <Text className="text-text-main">No camera access</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  // Carousel images array
  const carouselImages = [
    { label: "Original", uri: image, border: "border-blue-600" },
    { label: "Final", uri: result?.annotated_image, border: "border-green-600" },
    { label: "Marked sheet", uri: result?.annotated_image_marked, border: "border-rose-600" },
    { label: "ID notation", uri: result?.annotated_image_id, border: "border-violet-950" },
  ];

  return (
    <View className='flex-1 bg-primary-bg'>
      {image && !isCameraVisible
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
                        <Text className='font-medium text-[30px] text-center text-accent'>Marking Scheme</Text>
                      </View>
                      <View className='w-full flex flex-row items-start justify-between'>
                        <View>
                          <Text className="text-text-main">Total number of questions:</Text>
                          <TextInput
                            keyboardType='numeric'
                            maxLength={3}
                            value={totalQuestions.toString()}
                            onChangeText={(text) => handleTotalChange(text)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#FFD600',
                              margin: 5,
                              padding: 6,
                              width: 60,
                              borderRadius: 8,
                              color: "#fff",
                              backgroundColor: "#232634"
                            }} />
                        </View>
                        <Button title="Reset" onPress={() => { setTotalQuestions(0); setSelectedAnswers({}) }} color="#FFD600" />
                      </View>
                      <ScrollView
                        contentContainerStyle={styles.grid}
                        style={{ backgroundColor: "#232634", borderRadius: 8, marginTop: 10 }}
                      >
                        {[...Array(totalQuestions || 0)].map((_, index) => (
                          <View key={index} className={`flex-row flex w-full p-3 justify-center ${index % 2 ? "bg-card-bg" : "bg-primary-bg"}`}>
                            <Text className="text-text-main">Question {index + 1}: </Text>
                            <RadioButtonCustom key={index}
                              questionIndex={index}
                              selectedOption={selectedAnswers[index] || -1}
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
                      style={[styles.button, styles.buttonClose, { backgroundColor: "#FFD600" }]}
                      onPress={() => setModalVisible(!modalVisible)}>
                      <Text style={[styles.textStyle, { color: "#232634" }]}>Finish</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 8 , paddingHorizontal: 16 }}>
                <Pressable
                  style={{
                    backgroundColor: loading ? 'gray' : '#FFD600',
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    marginTop: 10,
                  }}
                  onPress={() => setModalVisible(true)}
                  disabled={loading}
                >
                  <MaterialIcons name="edit" size={20} color="#232634" style={{ marginRight: 6 }} />
                  <Text style={[styles.textStyle, { color: "#232634", fontWeight: "bold" }]}>Edit Marking Scheme</Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 12 }}>
                  <MaterialIcons name="description" size={20} color="#FFD600" style={{ marginRight: 4 }} />
                  <Text style={{ color: "#FFD600", fontWeight: "bold", fontSize: 15 }}>
                    {jsonResponses.length} marked
                  </Text>
                </View>
              </View>
            </SafeAreaView>

            {/* Carousel for images */}
            <View className='flex-1 px-0'>
              <ScrollView horizontal={false} showsHorizontalScrollIndicator={false}>
                <View className='flex justify-center w-full items-center gap-2 py-10'>
                  {/* Carousel */}
                  <View className="w-full items-center mt-2">
                    <ScrollView
                      ref={carouselScrollRef}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      style={{ width: '100%' }}
                      contentContainerStyle={{ alignItems: "center" }}
                      onScroll={e => {
                        const screenWidth = Dimensions.get('window').width;
                        const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                        setCarouselIndex(idx);
                      }}
                      scrollEventThrottle={16}
                    >
                      {carouselImages.map((img, idx) => (
                        <View
                          key={img.label}
                          className={`mx-0 ${img.border} rounded-theme bg-card-bg items-center`}
                          style={{
                            width: Dimensions.get('window').width,
                            height: 340,
                            justifyContent: "flex-start",
                            paddingVertical: 16,
                          }}
                        >
                          <Text className="text-text-secondary mt-2 mb-1 text-lg">{img.label}</Text>
                          {loading && idx !== 0 ? (
                            <ActivityIndicator size="large" color="#FFD600" style={{ flex: 1 }} />
                          ) : img.uri ? (
                            <Zoomable isDoubleTapEnabled>
                              <Image
                                source={{ uri: img.uri }}
                                style={{
                                  width: Dimensions.get('window').width - 48,
                                  height: 260,
                                  borderRadius: 12,
                                  borderColor: "#FFD600",
                                  borderWidth: 0.5,
                                  resizeMode: "contain",
                                  alignSelf: "center",
                                }}
                              />
                            </Zoomable>
                          ) : (
                            <View
                              style={{
                                width: Dimensions.get('window').width - 48,
                                height: 260,
                                borderRadius: 12,
                                borderColor: "#FFD600",
                                borderWidth: 0.5,
                                backgroundColor: "#232634",
                                alignItems: "center",
                                justifyContent: "center",
                                alignSelf: "center",
                              }}
                            >
                              <MaterialIcons name="info-outline" size={40} color="#FFD600" style={{ marginBottom: 8 }} />
                              <Text style={{ color: "#FFD600", textAlign: "center", fontSize: 16 }}>
                                {img.label} not available yet
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                    {/* Dots indicator */}
                    <View className="flex-row justify-center mt-3">
                      {[0, 1, 2, 3].map(i => (
                        <View
                          key={i}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            marginHorizontal: 6,
                            backgroundColor: "#FFD600",
                            opacity: carouselIndex === i ? 1 : 0.3,
                          }}
                        />
                      ))}
                    </View>
                  </View>
                </View>
                {/* info results */}
                {loading ? (
                  <ActivityIndicator size="large" color="#FFD600" />
                ) : uploadError ? (
                  <View className="bg-card-bg rounded-theme p-4 mt-4 flex items-center justify-center">
                    <Text style={{ color: "#FFD600", fontWeight: "bold", fontSize: 16, marginBottom: 12 }}>
                      Error occurred during upload. Please try again.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setImage(null);
                        setResult(null);
                        setIsCameraVisible(true);
                        setUploadError(false);
                      }}
                      style={{
                        backgroundColor: "#FFD600",
                        borderRadius: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 24,
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 6,
                      }}
                    >
                      <MaterialIcons name="refresh" size={20} color="#232634" style={{ marginRight: 8 }} />
                      <Text style={{ color: "#232634", fontWeight: "bold", fontSize: 16 }}>Rescan</Text>
                    </TouchableOpacity>
                  </View>
                ) : result && (
                  <View className="bg-card-bg rounded-theme p-4 mt-4">
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <Text className='font-medium text-xl text-accent'>Info on this paper:</Text>
                      {result && (
                        <TouchableOpacity
                          onPress={() => {
                            // Only add if not already present (by ID)
                            const filteredJson = Object.fromEntries(
                              Object.entries(result).filter(([key]) => allowedFields.includes(key))
                            );
                            const alreadyExists = jsonResponses.some(
                              r => r.ID === filteredJson.ID
                            );
                            if (!alreadyExists) {
                              setJsonResponses(prev => [...prev, filteredJson]);
                              toast.show("Result added to saved responses!", { type: "success" });
                            } else {
                              toast.show("This result is already saved.", { type: "warning" });
                            }
                          }}
                          style={{
                            backgroundColor: "#FFD600",
                            borderRadius: 8,
                            paddingVertical: 6,
                            paddingHorizontal: 14,
                            flexDirection: "row",
                            alignItems: "center",
                            marginLeft: 8,
                          }}
                        >
                          <MaterialIcons name="add-circle-outline" size={20} color="#232634" style={{ marginRight: 6 }} />
                          <Text style={{ color: "#232634", fontWeight: "bold", fontSize: 14 }}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text className="text-text-main">Student Score: <Text className="text-accent">{result?.score_percentage}%</Text> ({result?.score} out of {result?.total_questions})</Text>
                    <Text className="text-text-main">Student ID: <Text className="text-accent">{result.ID}</Text></Text>
                    <Text className="text-text-main">
                      Student Choices:{" "}
                      {formattedChoices.length === 0 ? (
                        <Text className="text-accent">None</Text>
                      ) : (
                        formattedChoices.map((choice, idx) => {
                          // choice is in the form "1:A"
                          const [num, letter] = choice.split(":");
                          return (
                            <Text key={idx}>
                              <Text style={{ color: "#FFD600" }}>{num}</Text>
                              <Text style={{ color: "#fff" }}>: {letter}</Text>
                              {idx !== formattedChoices.length - 1 && <Text style={{ color: "#FFD600" }}>, </Text>}
                            </Text>
                          );
                        })
                      )}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View className='flex justify-around flex-row items-center mt-4 pb-8'>
                <TouchableOpacity
                  onPress={() => { setImage(null); setResult(null); setIsCameraVisible(true); setUploadError(false); }}
                  className="bg-accent rounded-theme px-4 py-2 mx-1 flex-row items-center"
                  disabled={!result}
                  style={{
                    opacity: !result ? 0.5 : 1,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#FFD600",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <MaterialIcons name="camera-alt" size={20} color="#232634" style={{ marginRight: 6 }} />
                  <Text className="text-card-bg font-bold">Next scan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setExportModalVisible(true)}
                  className={`bg-accent rounded-theme px-4 py-2 mx-1 flex-row items-center ${result === null ? 'opacity-50' : ''}`}
                  disabled={jsonResponses.length === 0}
                >
                  <MaterialIcons name="file-download" size={20} color="#232634" style={{ marginRight: 6 }} />
                  <Text className="text-card-bg font-bold">Export</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    await uploadImage(image);
                    // After upload, scroll to the "Final" image (index 1)
                    setTimeout(() => {
                      carouselScrollRef.current?.scrollTo({ x: Dimensions.get('window').width * 1, animated: true });
                      setCarouselIndex(1);
                    }, 400); // slight delay to ensure result is set
                  }}
                  className="bg-accent rounded-theme px-4 py-2 mx-1 flex-row items-center"
                >
                  <Ionicons name="cloud-upload-outline" size={20} color="#232634" style={{ marginRight: 6 }} />
                  <Text className="text-card-bg font-bold">Upload</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        ) : (
          <SafeAreaView className='h-full flex items-center justify-end w-full relative bg-primary-bg'>
            <LiveCameraView
              ref={liveCamRef}
              camRef={cameraRef}
              style={{ width: '100%', height: '100%', position: 'absolute' }}
              flash="auto"
              facing="back"
              onScan={handleScan}
              setIsCameraVisible={setIsCameraVisible}
            />
            <View className='gap-2 flex items-center justify-around w-full flex-row bg-[rgba(0,0,0,0.32)] py-3'>
              <TouchableOpacity onPress={toggleFlash} className='flex items-center justify-center'>
                {flash === "on" ? <Ionicons name="flash" size={24} color="#FFD600" /> :
                  <Ionicons name="flash-off" size={30} color="#FFD600" />}
              </TouchableOpacity>
              <View className='p-[3px] rounded-full bg-[rgba(255,255,255,0.44)]'>
                <TouchableOpacity onPress={() => liveCamRef.current?.captureFrame?.()} className='bg-accent rounded-full w-20 h-20 flex items-center justify-center'>
                  <MaterialIcons name="document-scanner" size={30} color="#232634" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={toggleCameraFacing} className='flex items-center justify-center'>
                <MaterialIcons name="cameraswitch" size={30} color="#FFD600" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}

      {/* 3. Add the export modal UI just before your main return's closing </View> (after the main content): */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center"
        }}>
          <View style={{
            backgroundColor: "#232634",
            borderRadius: 18,
            padding: 24,
            width: "85%",
            alignItems: "center"
          }}>
            <MaterialIcons name="drive-file-rename-outline" size={36} color="#FFD600" style={{ marginBottom: 12 }} />
            <Text style={{ color: "#FFD600", fontWeight: "bold", fontSize: 18, marginBottom: 10 }}>
              Export Results
            </Text>
            <Text style={{ color: "#fff", marginBottom: 12, textAlign: "center" }}>
              Enter a name for your exported file:
            </Text>
            <TextInput
              value={exportFileName}
              onChangeText={setExportFileName}
              placeholder="e.g. Math_Test_1"
              placeholderTextColor="#888"
              style={{
                backgroundColor: "#181A20",
                color: "#FFD600",
                borderColor: "#FFD600",
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 8,
                fontSize: 16,
                width: "100%",
                marginBottom: 18,
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
              <TouchableOpacity
                onPress={() => setExportModalVisible(false)}
                style={{
                  backgroundColor: "#393B44",
                  paddingVertical: 10,
                  paddingHorizontal: 24,
                  borderRadius: 10,
                  marginRight: 10,
                }}
              >
                <Text style={{ color: "#FFD600", fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!exportFileName.trim()) {
                    Alert.alert("Please enter a file name.");
                    return;
                  }
                  setExportModalVisible(false);
                  await exportToExcel(exportFileName.trim());
                  setExportFileName("");
                }}
                style={{
                  backgroundColor: "#FFD600",
                  paddingVertical: 10,
                  paddingHorizontal: 24,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: "#232634", fontWeight: "bold" }}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: "100%",
    borderWidth: 0,
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
    backgroundColor: '#232634',
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
    borderRadius: 8,
    padding: 10,
    elevation: 2,
  },
  buttonOpen: {
    marginTop: 30
  },
  buttonClose: {
    backgroundColor: '#FFD600',
  },
  textStyle: {
    color: '#232634',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  },
});