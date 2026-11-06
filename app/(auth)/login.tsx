import AuthForm from '@/components/AuthForm';
import { useColorScheme } from '@/lib/theme';

export default function Login() {
  useColorScheme(); // re-render when light/dark mode changes
  return <AuthForm mode="login" />;
}
