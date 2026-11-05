import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { getExams, loadStore } from '@/lib/store';
import { downloadTemplate, isBuiltin, isCached, loadTemplateCache } from '@/lib/templateCache';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

function Root() {
  const { ready: authReady } = useAuth();
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadStore(), loadTemplateCache()])
      .catch((e) => console.warn('startup', e))
      .finally(() => {
        setDataReady(true);
        // Make sure every exam's sheet type is available offline (best effort).
        const ids = new Set(getExams().map((e) => e.templateId));
        ids.forEach((id) => {
          if (id !== 'auto' && !isBuiltin(id) && !isCached(id)) downloadTemplate(id).catch(() => undefined);
        });
      });
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
