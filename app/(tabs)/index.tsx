import { SafeAreaView, Text, View } from "react-native";

export default function Index() {
  return (
    <SafeAreaView className="flex-1 justify-center items-center bg-white">
      <View className="w-32 h-32 bg-blue-500 rounded-full justify-center items-center">
        <Text className="text-white text-2xl font-bold">ScanTron</Text>
      </View>
      <Text className="text-3xl font-bold text-center mt-10">
        Welcome to ScanTron, start marking yor bubble sheets!
      </Text>
    </SafeAreaView>
  );
}
