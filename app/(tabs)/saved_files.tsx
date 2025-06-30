import React, { useState } from "react";
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { WebView } from "react-native-webview";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

export default function SavedFilesScreen() {
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

  listFiles();

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

  if (htmlContent) {
    return (
      <View style={{ flex: 1, marginVertical: 20 }}>
        <TouchableOpacity onPress={() => setHtmlContent(null)} className="bg-slate-300 w-full flex items-center py-3">
          <Text className="text-black text-[20px]">
            Back to File
          </Text>
        </TouchableOpacity>
        <WebView originWhitelist={["*"]} source={{ html: htmlContent }} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <SafeAreaView>
      <View className="w-full flex items-center py-3 bg-[rgb(31,36,85)]">
        <Text style={{ fontSize: 20 }} className="text-white">Saved Files</Text>
      </View>
      <ScrollView  contentContainerStyle={{ minHeight: "100%"}}>
        {savedFiles.map((file, index) => (
          <View className={`${index % 2 === 0 && 'bg-slate-300'} border-b-[1px] border-slate-300  p-4  flex items-center justify-between flex-row`} key={file.uri}>
            <Text >{file.name}</Text>
            {/* <Button title="View"  /> */}
            <View className="flex flex-row items-center justify-center gap-5">
              <Ionicons name="open-outline" size={24} color="[rgb(31,36,85)]" onPress={() => viewFile(file.uri)} />
              <MaterialIcons name="share" size={24} color="[rgb(31,36,85)]" onPress={() => shareFile(file.uri)} />
            </View>
            {/* <Button title="Share"  /> */}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
