import {  router } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { useEffect } from "react";
import { Button, SafeAreaView, Text, View } from "react-native";

export default function Index() {
  useEffect(() => {
  const verify = async () => {
    const token = await SecureStore.getItemAsync('token');
    if (!token) router.replace('/login');
  };
  verify();
}, []);

const handleLogout = async () => {
  await SecureStore.deleteItemAsync("token");
  router.replace("/login"); // redirect to login screen
};

  return (
    <SafeAreaView className="flex-1 justify-center items-center bg-white" >
      <View className="w-32 h-32 bg-[rgb(31,36,85)] rounded-full justify-center items-center">
        <Text className="text-white text-2xl font-bold">ScanTron</Text>
      </View>
      <Text className="text-3xl font-bold text-center mt-10">
        Welcome to ScanTron, start marking yor bubble sheets!
      </Text>
      <Button title="Logout" onPress={handleLogout}/>
    </SafeAreaView>
  );
}
