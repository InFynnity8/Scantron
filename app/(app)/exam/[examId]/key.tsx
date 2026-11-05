import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, IconButton, Notice, Screen, tap, useToast } from '@/components/ui';
import { saveExam, useExam } from '@/lib/store';
import { colors, font, radius, space, type } from '@/lib/theme';

const Row = memo(function Row({
  index,
  value,
  options,
  onSet,
}: {
  index: number;
  value: string;
  options: string[];
  onSet: (i: number, v: string) => void;
}) {
  return (
    <View style={[styles.row, index % 2 === 1 && { backgroundColor: colors.surface }]}>
      <Text style={styles.qnum}>{index + 1}</Text>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <Pressable
            key={o}
            onPress={() => {
              tap();
              onSet(index, value === o ? '' : o);
            }}
            onLongPress={() => {
              tap('medium');
              const set = new Set(value.split('').filter(Boolean));
              if (set.has(o)) set.delete(o);
              else set.add(o);
              onSet(index, options.filter((x) => set.has(x)).join(''));
            }}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityLabel={`Question ${index + 1} option ${o}`}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && { color: colors.accentText }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
});

export default function AnswerKey() {
  const { examId, first, scanned } = useLocalSearchParams<{ examId: string; first?: string; scanned?: string }>();
  const exam = useExam(examId);
  const toast = useToast();
  const [key, setKey] = useState<string[]>(() => exam?.key.slice(0, exam.numQuestions) ?? []);
  const [dirty, setDirty] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  // A key read from a scanned sheet arrives via route param.
  useEffect(() => {
    if (!scanned || !exam) return;
    try {
      const k: string[] = JSON.parse(scanned);
      setKey(Array.from({ length: exam.numQuestions }, (_, i) => k[i] ?? ''));
      setDirty(true);
      toast('Answer key read from sheet - check it, then save.', 'success');
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned]);

  const onSet = useCallback((i: number, v: string) => {
    setKey((k) => {
      const n = [...k];
      n[i] = v;
      return n;
    });
    setDirty(true);
  }, []);

  if (!exam) return <Screen title="Answer key" />;
  const done = key.filter(Boolean).length;

  const save = async () => {
    await saveExam({ ...exam, key });
    setDirty(false);
    tap('success');
    toast('Answer key saved - all sheets re-graded.', 'success');
    if (first) router.replace({ pathname: '/exam/[examId]', params: { examId: exam.id } });
    else router.back();
  };

  const applyTyped = () => {
    const letters = typed.toUpperCase().replace(/[^A-Z?\-_.]/g, '');
    const valid = new Set(exam.options);
    const next = [...key];
    let i = 0;
    for (const ch of letters) {
      if (i >= exam.numQuestions) break;
      next[i++] = valid.has(ch) ? ch : '';
    }
    setKey(next);
    setDirty(true);
    setTyping(false);
    setTyped('');
    toast(`Filled ${i} answers.`, 'success');
  };

  const leave = () => {
    if (!dirty) return router.back();
    Alert.alert('Discard changes?', 'Your answer key changes are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  return (
    <Screen
      title="Answer key"
      subtitle={`${done}/${exam.numQuestions} set · tap to choose · long-press to accept several`}
      right={
        <>
          <IconButton icon="text-outline" label="Type key" onPress={() => setTyping(true)} />
          <IconButton icon="scan-outline" label="Scan key sheet" onPress={() => router.push({ pathname: '/exam/[examId]/scan', params: { examId: exam.id, mode: 'key' } })} />
        </>
      }
    >
      {first === '1' && (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Notice text="Tip: fill one sheet with the correct answers and tap the scan icon to read the whole key in one go." icon="bulb-outline" />
        </View>
      )}
      <FlatList
        data={key}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => <Row index={index} value={item} options={exam.options} onSet={onSet} />}
        initialNumToRender={25}
        contentContainerStyle={{ paddingBottom: 110 }}
      />
      <View style={styles.footer}>
        <Button title="Cancel" variant="secondary" onPress={leave} style={{ flex: 1 }} />
        <Button title={`Save key (${done}/${exam.numQuestions})`} icon="checkmark" onPress={save} style={{ flex: 2 }} />
      </View>

      <Modal visible={typing} transparent animationType="fade" onRequestClose={() => setTyping(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={type.heading}>Type the answer key</Text>
            <Text style={[type.bodyMuted, { marginVertical: space.sm }]}>
              One letter per question, starting at question 1. Use “-” to skip a question. Spaces are ignored.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              multiline
              placeholder="BEADB CCAAB …"
              placeholderTextColor={colors.textFaint}
              style={styles.typed}
            />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
              <Button title="Cancel" variant="secondary" onPress={() => setTyping(false)} style={{ flex: 1 }} />
              <Button title="Apply" onPress={applyTyped} style={{ flex: 1 }} disabled={!typed.trim()} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 7 },
  qnum: { width: 40, color: colors.textMuted, fontWeight: '700', fontSize: 15, fontFamily: font.mono },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: '800', fontSize: 15 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl },
  typed: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    color: colors.text,
    fontSize: 18,
    fontFamily: font.mono,
    letterSpacing: 2,
    textAlignVertical: 'top',
  },
});
