import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Logo from '@/components/Logo';
import { Button, Field, Notice } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, space, themed, type } from '@/lib/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const isLogin = mode === 'login';

  const submit = async () => {
    setError(null);
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (!isLogin && password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const t = setTimeout(() => setSlow(true), 6000);
    try {
      if (isLogin) await signIn(email, password);
      else await signUp(email, password);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      clearTimeout(t);
      setSlow(false);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Logo size={64} />
          </View>
          <Text style={[type.display, { textAlign: 'center' }]}>{isLogin ? 'Welcome back' : 'Create account'}</Text>
          <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: 6, marginBottom: space.xxl }]}>
            {isLogin ? 'Grade answer sheets in seconds.' : 'Start grading answer sheets with your phone.'}
          </Text>

          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@school.edu" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete={isLogin ? 'password' : 'new-password'} />
          {!isLogin && <Field label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="••••••••" secureTextEntry />}

          {!!error && (
            <View style={{ marginBottom: space.lg }}>
              <Notice tone="danger" text={error} />
            </View>
          )}
          {slow && (
            <View style={{ marginBottom: space.lg }}>
              <Notice tone="info" text="The server is waking up - this can take up to a minute the first time." />
            </View>
          )}

          <Button title={isLogin ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />

          <View style={styles.row}>
            <Text style={type.bodyMuted}>{isLogin ? "Don't have an account? " : 'Already have an account? '}</Text>
            <Link href={isLogin ? '/register' : '/login'} replace style={{ color: colors.accent, fontWeight: '600' }}>
              {isLogin ? 'Register' : 'Sign in'}
            </Link>
          </View>

          <View style={styles.divider} />
          <Button title="Continue without an account" variant="ghost" icon="cloud-offline-outline" onPress={continueAsGuest} />
          <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>Exams and results are stored on this phone.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  wrap: { padding: space.xl, paddingTop: space.xxl * 1.5, flexGrow: 1 },
  logo: { alignSelf: 'center', marginBottom: space.xl },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xl },
}));
