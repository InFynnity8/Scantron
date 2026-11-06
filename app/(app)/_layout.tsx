import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { colors, useColorScheme } from '@/lib/theme';

export default function AppLayout() {
  useColorScheme(); // re-render when light/dark mode changes
  const { signedIn } = useAuth();
  if (!signedIn) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="exam/[examId]/scan" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
