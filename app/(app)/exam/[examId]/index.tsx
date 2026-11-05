import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, IconButton, Notice, Screen, SectionTitle, Segmented, Stat, useToast } from '@/components/ui';
import { exportExamToExcel } from '@/lib/excel';
import { examStats, gradeSheet } from '@/lib/grading';
import { effectiveStudentId, needsReview, type Sheet } from '@/lib/models';
import { deleteExam, useExam, useSheets } from '@/lib/store';
import { colors, font, radius, scoreColor, space, type } from '@/lib/theme';

type Sort = 'recent' | 'id' | 'score' | 'review';

export default function ExamDetail() {
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const exam = useExam(examId);
  const sheets = useSheets(examId);
  const toast = useToast();
  const [sort, setSort] = useState<Sort>('recent');
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    if (!exam) return [];
    const r = sheets.map((s) => ({ s, g: gradeSheet(exam, s) }));
    if (sort === 'id') r.sort((a, b) => (effectiveStudentId(a.s) ?? '~').localeCompare(effectiveStudentId(b.s) ?? '~'));
    if (sort === 'score') r.sort((a, b) => (b.g.percentage ?? -1) - (a.g.percentage ?? -1));
    if (sort === 'review') r.sort((a, b) => Number(needsReview(b.s)) - Number(needsReview(a.s)));
    return r;
  }, [exam, sheets, sort]);

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    sheets.forEach((s) => {
      const id = effectiveStudentId(s);
      if (id) seen.set(id, (seen.get(id) ?? 0) + 1);
    });
    return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  }, [sheets]);

  if (!exam) return <Screen title="Exam" />;
  const st = examStats(exam, sheets);
  const keySet = exam.key.slice(0, exam.numQuestions).filter(Boolean).length;
  const keyComplete = keySet === exam.numQuestions;

  const doExport = async () => {
    if (!sheets.length) return toast('Scan some sheets first.', 'info');
    setExporting(true);
    try {
      await exportExamToExcel(exam, sheets);
    } catch (e: any) {
      toast(e?.message ?? 'Export failed', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete exam?', `"${exam.title}" and its ${sheets.length} graded sheet(s) will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExam(exam.id);
          router.replace('/');
        },
      },
    ]);

  const header = (
    <View>
      <Card>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="graded" value={String(st.count)} />
          <Stat label="average" value={st.mean == null ? '–' : `${st.mean}%`} color={scoreColor(st.mean)} />
          <Stat label="highest" value={st.high == null ? '–' : `${st.high}%`} />
          <Stat label="pass rate" value={st.passRate == null ? '–' : `${st.passRate}%`} />
        </View>
        {st.count > 1 && (
          <Text style={[type.caption, { marginTop: space.md }]}>
            Median {st.median}% · lowest {st.low}% · std. dev. {st.stdev} · pass mark {exam.passMark}%
          </Text>
        )}
      </Card>

      {!keyComplete && (
        <View style={{ marginTop: space.md }}>
          <Notice tone="warning" text={`Answer key: ${keySet} of ${exam.numQuestions} questions set. Unset questions are not graded.`} />
        </View>
      )}
      {dupes.size > 0 && (
        <View style={{ marginTop: space.md }}>
          <Notice tone="warning" text={`Duplicate index numbers: ${[...dupes].slice(0, 5).join(', ')}. Check those sheets.`} />
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Scan sheets" icon="scan" onPress={() => router.push({ pathname: '/exam/[examId]/scan', params: { examId: exam.id } })} style={{ flex: 1 }} />
      </View>
      <View style={[styles.actions, { marginTop: space.sm }]}>
        <Button title="Answer key" icon="key-outline" variant="secondary" compact onPress={() => router.push({ pathname: '/exam/[examId]/key', params: { examId: exam.id } })} style={{ flex: 1 }} />
        <Button title="Export Excel" icon="download-outline" variant="secondary" compact loading={exporting} onPress={doExport} style={{ flex: 1 }} />
      </View>

      <SectionTitle right={<Text style={type.caption}>{st.needsReview ? `${st.needsReview} need review` : ''}</Text>}>{`Sheets (${sheets.length})`}</SectionTitle>
      {sheets.length > 1 && (
        <View style={{ marginBottom: space.md }}>
          <Segmented<Sort>
            value={sort}
            onChange={setSort}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'id', label: 'Index' },
              { value: 'score', label: 'Score' },
              { value: 'review', label: 'Review' },
            ]}
          />
        </View>
      )}
    </View>
  );

  return (
    <Screen
      title={exam.title}
      subtitle={[exam.course, `${exam.numQuestions} questions`, exam.templateName].filter(Boolean).join(' · ')}
      right={
        <>
          <IconButton icon="create-outline" label="Edit exam" onPress={() => router.push({ pathname: '/exam/new', params: { examId: exam.id } })} />
          <IconButton icon="trash-outline" label="Delete exam" color={colors.danger} onPress={remove} />
        </>
      }
    >
      <FlatList
        data={rows}
        keyExtractor={(r) => r.s.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={<EmptyState icon="scan-outline" title="No sheets yet" body="Tap “Scan sheets” and point the camera at a filled answer sheet." />}
        renderItem={({ item: { s, g } }) => <SheetRow sheet={s} pct={g.percentage} score={`${g.score}/${g.max}`} dupe={dupes.has(effectiveStudentId(s) ?? '')} examId={exam.id} />}
      />
    </Screen>
  );
}

function SheetRow({ sheet, pct, score, dupe, examId }: { sheet: Sheet; pct: number | null; score: string; dupe: boolean; examId: string }) {
  const id = effectiveStudentId(sheet);
  const review = needsReview(sheet);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/exam/[examId]/sheet/[sheetId]', params: { examId, sheetId: sheet.id } })}
      style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surface2 }]}
    >
      <View style={[styles.scoreDot, { borderColor: scoreColor(pct) }]}>
        <Text style={{ color: scoreColor(pct), fontWeight: '800', fontSize: 13 }}>{pct == null ? '–' : Math.round(pct)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={[type.body, { fontFamily: font.mono, fontWeight: '700' }]}>{id ?? 'No index number'}</Text>
        <Text style={type.caption}>
          {score} · {new Date(sheet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {sheet.engine === 'device' ? ' · on-device' : ''}
        </Text>
      </View>
      {dupe && <Badge text="Duplicate" color={colors.danger} bg={colors.dangerSoft} />}
      {review && <Badge text="Review" color={colors.warning} bg={colors.warningSoft} icon="eye-outline" />}
      {!review && (sheet.reviewed || Object.keys(sheet.overrides).length > 0) && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreDot: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
