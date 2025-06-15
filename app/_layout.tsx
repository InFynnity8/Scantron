import "./globals.css";
import { ToastProvider } from 'react-native-toast-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';

export default function RootLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  // const navigationState = useRootNavigationState();

  // Check if token exists
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        setIsAuthenticated(!!token);
      } catch (error) {
        console.error("Auth check failed", error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (isAuthenticated === false ) {
      router.replace('/login');
    }
  }, [isAuthenticated]);

  // Wait for auth + navigationState to resolve
  if (isAuthenticated === null ) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider placement="top" duration={4000} animationType="slide-in">
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
