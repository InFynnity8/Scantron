import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { colors, useColorScheme } from '@/lib/theme';

export default function AuthLayout() {
  useColorScheme(); // re-render when light/dark mode changes
  const { signedIn } = useAuth();
  if (signedIn) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />;
}
