import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Field, Notice, Screen, SectionTitle, Segmented, useToast } from '@/components/ui';
import { health } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEFAULT_SETTINGS, trimUrl, updateSettings, useSettings, type EnginePreference } from '@/lib/settings';
import { colors, space, type } from '@/lib/theme';

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, marginRight: space.md }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{label}</Text>
        <Text style={type.caption}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.surface3 }} thumbColor="#fff" />
    </View>
  );
}

export default function SettingsScreen() {
  const s = useSettings();
  const { email, guest, signOut } = useAuth();
  const toast = useToast();
  const [omrUrl, setOmrUrl] = useState(s.omrUrl);
  const [authUrl, setAuthUrl] = useState(s.authUrl);
  const [testing, setTesting] = useState(false);

  const saveUrls = async () => {
    await updateSettings({ omrUrl: trimUrl(omrUrl), authUrl: trimUrl(authUrl) });
    toast('Server settings saved', 'success');
  };

  const test = async () => {
    setTesting(true);
    const ok = await health(trimUrl(omrUrl));
    setTesting(false);
    toast(ok ? 'Grading server is online' : 'Cannot reach the grading server', ok ? 'success' : 'danger');
  };

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <SectionTitle>Account</SectionTitle>
        <Card>
          <Text style={type.body}>{guest ? 'Using Scantron without an account' : email}</Text>
          <Text style={[type.caption, { marginBottom: space.md }]}>Exams and results are stored on this phone.</Text>
          <Button title={guest ? 'Sign in or create account' : 'Sign out'} variant="secondary" compact onPress={signOut} />
        </Card>

        <SectionTitle>Scanning</SectionTitle>
        <Card>
          <Text style={[type.label, { marginBottom: 8 }]}>Grading engine</Text>
          <Segmented<EnginePreference>
            value={s.engine}
            onChange={(engine) => updateSettings({ engine })}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'device', label: 'Phone only' },
              { value: 'server', label: 'Server only' },
            ]}
          />
          <Text style={[type.caption, { marginTop: 8 }]}>
            Automatic grades on the phone whenever the sheet type is available offline (printed Scantron sheets, and KNUST sheets after their one-time download), and uses the server otherwise.
          </Text>
          <View style={{ height: space.md }} />
          <Toggle label="Live scan" hint="Show marks and the score on the camera before you capture." value={s.liveScan} onChange={(liveScan) => updateSettings({ liveScan })} />
          <Toggle label="Auto-capture" hint="Capture automatically when the reading is stable." value={s.autoCapture} onChange={(autoCapture) => updateSettings({ autoCapture })} />
          <Toggle label="Haptics" hint="Vibrate on capture and results." value={s.haptics} onChange={(haptics) => updateSettings({ haptics })} />
        </Card>

        <SectionTitle>Servers</SectionTitle>
        <Field label="Grading server" value={omrUrl} onChangeText={setOmrUrl} autoCapitalize="none" keyboardType="url" />
        <Field label="Account server" value={authUrl} onChangeText={setAuthUrl} autoCapitalize="none" keyboardType="url" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Test" variant="secondary" compact loading={testing} onPress={test} style={{ flex: 1 }} />
          <Button title="Save" compact onPress={saveUrls} style={{ flex: 1 }} />
        </View>
        <Button
          title="Reset to defaults"
          variant="ghost"
          compact
          onPress={() => {
            setOmrUrl(DEFAULT_SETTINGS.omrUrl);
            setAuthUrl(DEFAULT_SETTINGS.authUrl);
          }}
          style={{ marginTop: space.sm }}
        />
        <View style={{ marginTop: space.md }}>
          <Notice text="Free-tier servers sleep when idle; the first request after a while can take up to a minute." />
        </View>

        <Text style={[type.caption, { textAlign: 'center', marginTop: space.xxl }]}>Scantron v{Constants.expoConfig?.version ?? '2.0.0'}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
});
