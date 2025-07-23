import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import * as XLSX from "xlsx";

export default function SavedFilesScreen() {
  const router = useRouter();
  const resultsDir = FileSystem.documentDirectory + "Scanned_results/";
  const [savedFiles, setSavedFiles] = useState<{ name: string; uri: string }[]>([]);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  const listFiles = async () => {
    const files = await FileSystem.readDirectoryAsync(resultsDir);
    const formatted = files.map((name) => ({
      name,
      uri: resultsDir + name,
    }));
    setSavedFiles(formatted);
  };

  React.useEffect(() => {
    listFiles();
  }, []);

  const shareFile = async (uri: string) => {
    await Sharing.shareAsync(uri);
  };

  const viewFile = async (uri: string) => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(base64, { type: "base64" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const html = `
      <html><body>
        <table border="1" style="width:100%; border-collapse: collapse;">
          ${jsonData
            .map(
              (row: any) =>
                `<tr>${row
                  .map((cell: any) => `<td style="padding: 8px;">${cell ?? ""}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </table>
      </body></html>
    `;

    setHtmlContent(html);
  };

  const deleteFile = async (uri: string, name: string) => {
    Alert.alert(
      "Delete File",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            listFiles();
          },
        },
      ]
    );
  };

  if (htmlContent) {
    return (
      <View className="flex-1 bg-primary-bg pt-6">
        <TouchableOpacity onPress={() => setHtmlContent(null)} className="bg-accent w-full flex items-center py-3">
          <Text className="text-card-bg text-lg font-bold">
            Back to Files
          </Text>
        </TouchableOpacity>
        <WebView originWhitelist={["*"]} source={{ html: htmlContent }} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-bg">
      <View className="w-full flex-row items-center justify-between py-4 px-4 bg-card-bg mb-2">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1">
            <Ionicons name="chevron-back" size={26} color="#FFD600" />
          </TouchableOpacity>
          <Text className="text-accent text-xl font-bold"> Recent scans</Text>
        </View>
        <TouchableOpacity onPress={listFiles} className="p-2 rounded-theme bg-accent">
          <Feather name="refresh-cw" size={20} color="#232634" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ minHeight: "100%" }}>
        {savedFiles.length === 0 && (
          <View className="flex-1 items-center justify-center py-10">
            <Text className="text-text-secondary text-base">No saved files found.</Text>
          </View>
        )}
        <View className="px-2">
          {savedFiles.map((file, index) => (
            <View
              key={file.uri}
              className={`flex-row items-center justify-between px-3 py-3 my-2 rounded-theme bg-card-bg shadow`}
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 2,
                elevation: 1,
              }}
            >
              <View className="flex-1">
                <Text className="text-text-main font-medium" numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
              <View className="flex-row items-center ml-2">
                <TouchableOpacity
                  onPress={() => viewFile(file.uri)}
                  className="p-2 rounded-theme bg-accent mx-1"
                >
                  <Ionicons name="open-outline" size={20} color="#232634" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shareFile(file.uri)}
                  className="p-2 rounded-theme bg-accent mx-1"
                >
                  <MaterialIcons name="share" size={20} color="#232634" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteFile(file.uri, file.name)}
                  className="p-2 rounded-theme bg-red-600 mx-1"
                >
                  <MaterialIcons name="delete" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
