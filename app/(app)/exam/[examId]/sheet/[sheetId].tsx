import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import SheetImage from '@/components/SheetImage';
import { Badge, Button, Card, IconButton, Notice, Screen, SectionTitle, Stat, tap, useToast } from '@/components/ui';
import { gradeSheet, type GradedQuestion } from '@/lib/grading';
import { effectiveStudentId } from '@/lib/models';
import { deleteSheet, upsertSheet, useExam, useSheets } from '@/lib/store';
import { colors, font, radius, scoreColor, space, type } from '@/lib/theme';

const RESULT_COLORS: Record<GradedQuestion['result'], string> = {
  correct: colors.success,
  wrong: colors.danger,
  multiple: colors.warning,
  blank: colors.textFaint,
  ungraded: colors.info,
};

type Filter = 'all' | 'wrong' | 'flagged';

export default function SheetDetail() {
  const { examId, sheetId } = useLocalSearchParams<{ examId: string; sheetId: string }>();
  const exam = useExam(examId);
  const sheets = useSheets(examId);
  const sheet = sheets.find((s) => s.id === sheetId);
  const toast = useToast();
  const [editing, setEditing] = useState<GradedQuestion | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const g = useMemo(() => (exam && sheet ? gradeSheet(exam, sheet) : null), [exam, sheet]);
  if (!exam || !sheet || !g) return <Screen title="Sheet" />;

  const id = effectiveStudentId(sheet);
  const shown = g.questions.filter((q) => (filter === 'all' ? true : filter === 'wrong' ? q.result !== 'correct' && q.result !== 'ungraded' : q.flags.length > 0));
  const flaggedCount = g.questions.filter((q) => q.flags.length).length;

  const saveOverride = async () => {
    if (!editing) return;
    const original = sheet.answers.find((a) => a.label === editing.label)?.marked ?? [];
    const overrides = { ...sheet.overrides };
    if (JSON.stringify([...draft].sort()) === JSON.stringify([...original].sort())) delete overrides[editing.label];
    else overrides[editing.label] = exam.options.filter((o) => draft.includes(o));
    await upsertSheet({ ...sheet, overrides });
    setEditing(null);
    tap('success');
  };

  const saveId = async () => {
    const v = (idDraft ?? '').trim();
    await upsertSheet({ ...sheet, idOverride: v && v !== sheet.studentId ? v : undefined });
    setIdDraft(null);
    toast('Index number updated', 'success');
  };

  const markReviewed = async () => {
    await upsertSheet({ ...sheet, reviewed: !sheet.reviewed });
    tap('success');
    if (!sheet.reviewed) toast('Marked as reviewed', 'success');
  };

  const remove = () =>
    Alert.alert('Delete this sheet?', 'The scan and its result will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSheet(exam.id, sheet.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen
      title={id ?? 'No index number'}
      subtitle={`${new Date(sheet.createdAt).toLocaleString()} · ${sheet.engine === 'device' ? 'graded on-device' : 'graded on server'}`}
      right={<IconButton icon="trash-outline" label="Delete sheet" color={colors.danger} onPress={remove} />}
    >
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}>
        <Card>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="score" value={`${g.score}/${g.max}`} />
            <Stat label="percent" value={g.percentage == null ? '–' : `${g.percentage}%`} color={scoreColor(g.percentage)} />
            <Stat label="result" value={g.passed == null ? '–' : g.passed ? 'Pass' : 'Fail'} color={g.passed ? colors.success : colors.danger} />
          </View>
          <Text style={[type.caption, { marginTop: space.md }]}>
            {g.counts.correct} correct · {g.counts.wrong} wrong · {g.counts.multiple} multiple · {g.counts.blank} blank
            {Object.keys(sheet.overrides).length ? ` · ${Object.keys(sheet.overrides).length} corrected by hand` : ''}
          </Text>
        </Card>

        {sheet.reviewReasons.length > 0 && !sheet.reviewed && (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {sheet.reviewReasons.map((r) => (
              <Notice key={r} tone="warning" text={r} icon="eye-outline" />
            ))}
          </View>
        )}

        <SectionTitle>Index number</SectionTitle>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontFamily: font.mono, fontSize: 22, fontWeight: '800' }}>{id ?? '—'}</Text>
            <Text style={type.caption}>
              {sheet.idOverride ? `Corrected by hand (scanned: ${sheet.studentId ?? 'none'})` : `Read with ${Math.round(sheet.studentIdConfidence * 100)}% confidence`}
            </Text>
          </View>
          <Button title="Edit" compact variant="secondary" icon="create-outline" onPress={() => setIdDraft(id ?? '')} />
        </Card>
        {Object.entries(sheet.fields)
          .filter(([k]) => k !== 'index_number')
          .map(([k, f]) => (
            <Text key={k} style={[type.bodyMuted, { marginTop: space.sm }]}>
              {f.label}: <Text style={{ color: colors.text, fontFamily: font.mono }}>{f.value ?? '—'}</Text>
            </Text>
          ))}
        {Object.entries(sheet.regionUris ?? {}).map(([k, r]) => (
          <View key={k} style={{ marginTop: space.sm }}>
            <Text style={type.caption}>{r.label} (handwritten)</Text>
            <Image source={{ uri: r.uri }} style={styles.region} contentFit="contain" />
          </View>
        ))}

        <SectionTitle>Sheet</SectionTitle>
        <SheetImage sheet={sheet} graded={g.questions} />
        <Text style={[type.caption, { marginTop: 6, textAlign: 'center' }]}>Pinch or double-tap to zoom · green = correct · red = wrong · yellow box = check</Text>

        <SectionTitle
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['all', 'wrong', 'flagged'] as Filter[]).map((f) => (
                <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && { backgroundColor: colors.surface3 }]}>
                  <Text style={{ color: filter === f ? colors.text : colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                    {f === 'all' ? 'All' : f === 'wrong' ? 'Wrong' : `Check (${flaggedCount})`}
                  </Text>
                </Pressable>
              ))}
            </View>
          }
        >
          Answers
        </SectionTitle>
        <Text style={[type.caption, { marginBottom: space.sm }]}>Tap a question to correct what was read.</Text>
        <View style={styles.grid}>
          {shown.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => {
                setDraft(q.marked);
                setEditing(q);
              }}
              style={[styles.cell, { borderColor: q.flags.length ? colors.accent : colors.border }]}
            >
              <Text style={styles.cellNum}>{q.label}</Text>
              <Text style={[styles.cellAns, { color: RESULT_COLORS[q.result] }]}>{q.marked.join('') || '–'}</Text>
              {q.result !== 'correct' && q.key.length > 0 && <Text style={styles.cellKey}>{q.key.join('/')}</Text>}
              {q.overridden && <Ionicons name="hand-left" size={10} color={colors.info} style={{ position: 'absolute', top: 4, right: 4 }} />}
            </Pressable>
          ))}
        </View>

        <Button
          title={sheet.reviewed ? 'Reviewed ✓ (tap to undo)' : 'Mark as reviewed'}
          variant={sheet.reviewed ? 'secondary' : 'primary'}
          icon="checkmark-done"
          onPress={markReviewed}
          style={{ marginTop: space.xl }}
        />
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modal}>
            <Text style={type.heading}>Question {editing?.label}</Text>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>
              Scanned: {sheet.answers.find((a) => a.label === editing?.label)?.marked.join(', ') || 'blank'}
              {editing?.key.length ? ` · Key: ${editing.key.join(' or ')}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: space.xl, justifyContent: 'center' }}>
              {exam.options.map((o) => {
                const on = draft.includes(o);
                return (
                  <Pressable
                    key={o}
                    onPress={() => setDraft((d) => (d.includes(o) ? d.filter((x) => x !== o) : [...d, o]))}
                    style={[styles.opt, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: on ? colors.accentText : colors.text }}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
            {editing && editing.flags.length > 0 && (
              <View style={{ marginBottom: space.md }}>
                <Badge text={`Flagged: ${editing.flags.join(', ').replace(/_/g, ' ')}`} color={colors.warning} bg={colors.warningSoft} />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Clear" variant="secondary" onPress={() => setDraft([])} style={{ flex: 1 }} compact />
              <Button title="Save" onPress={saveOverride} style={{ flex: 2 }} compact />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={idDraft !== null} transparent animationType="fade" onRequestClose={() => setIdDraft(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={type.heading}>Index number</Text>
            <TextInput
              value={idDraft ?? ''}
              onChangeText={setIdDraft}
              autoFocus
              keyboardType="number-pad"
              style={styles.idInput}
              placeholder="e.g. 3392022"
              placeholderTextColor={colors.textFaint}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Cancel" variant="secondary" onPress={() => setIdDraft(null)} style={{ flex: 1 }} compact />
              <Button title="Save" onPress={saveId} style={{ flex: 1 }} compact />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '18.6%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellNum: { position: 'absolute', top: 3, left: 5, fontSize: 10, color: colors.textFaint, fontWeight: '700' },
  cellAns: { fontSize: 18, fontWeight: '900' },
  cellKey: { fontSize: 10, color: colors.success, fontWeight: '700' },
  filter: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  region: { height: 60, backgroundColor: '#fff', borderRadius: radius.sm, marginTop: 4 },
  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl },
  opt: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  idInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    color: colors.text,
    fontSize: 22,
    fontFamily: font.mono,
    marginVertical: space.lg,
  },
});
