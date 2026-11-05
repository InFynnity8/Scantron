import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { loadStore } from '@/lib/store';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

function Root() {
  const { ready: authReady } = useAuth();
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadStore()])
      .catch((e) => console.warn('startup', e))
      .finally(() => setDataReady(true));
  }, []);

  const ready = authReady && dataReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Root />
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
