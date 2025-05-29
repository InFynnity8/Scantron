import { Stack } from "expo-router";
import "./globals.css";
import { ToastProvider } from 'react-native-toast-notifications';


export default function RootLayout() {
  return <ToastProvider
      placement="top"
      duration={4000}
      animationType="slide-in"
    ><Stack>
    <Stack.Screen
      name="(tabs)"
      options={{ headerShown: false }}
    />
  </Stack>
    </ToastProvider>;
}
