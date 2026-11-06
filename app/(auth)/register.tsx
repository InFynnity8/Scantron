import AuthForm from '@/components/AuthForm';
import { useColorScheme } from '@/lib/theme';

export default function Register() {
  useColorScheme(); // re-render when light/dark mode changes
  return <AuthForm mode="register" />;
}
