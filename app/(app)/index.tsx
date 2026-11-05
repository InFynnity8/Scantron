import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, EmptyState, IconButton } from '@/components/ui';
import { examStats } from '@/lib/grading';
import { useAllSheets, useExams } from '@/lib/store';
import { colors, radius, scoreColor, space, type } from '@/lib/theme';

export default function Home() {
  const exams = useExams();
  const sheets = useAllSheets();
  const totals = useMemo(() => {
    const all = Object.values(sheets).flat();
    return { sheets: all.length, review: all.filter((s) => !s.reviewed && s.reviewReasons.length).length };
  }, [sheets]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={type.display}>Scantron</Text>
        </View>
        <IconButton icon="print-outline" label="Printable sheets" onPress={() => router.push('/sheets')} />
        <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      {exams.length > 0 && (
        <View style={styles.summary}>
          <Summary value={exams.length} label={exams.length === 1 ? 'exam' : 'exams'} />
          <View style={styles.rule} />
          <Summary value={totals.sheets} label="sheets graded" />
          <View style={styles.rule} />
          <Summary value={totals.review} label="to review" color={totals.review ? colors.warning : undefined} />
        </View>
      )}

      <FlatList
        data={exams}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, flexGrow: 1 }}
        ListHeaderComponent={exams.length ? <Text style={[type.label, { marginBottom: space.sm }]}>Exams</Text> : null}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No exams yet"
            body="Create an exam, enter the answer key, then hold your phone over each answer sheet. Marks are graded on the spot."
          />
        }
        renderItem={({ item: exam }) => {
          const list = sheets[exam.id] ?? [];
          const st = examStats(exam, list);
          const keySet = exam.key.slice(0, exam.numQuestions).filter(Boolean).length;
          const notes = [
            `${list.length} graded`,
            keySet < exam.numQuestions ? `key ${keySet}/${exam.numQuestions}` : null,
            st.needsReview ? `${st.needsReview} to review` : null,
          ].filter(Boolean);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/exam/[examId]', params: { examId: exam.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
              accessibilityRole="button"
            >
              <View style={[styles.score, { borderColor: st.mean == null ? colors.border : scoreColor(st.mean) }]}>
                <Text style={[styles.scoreText, { color: st.mean == null ? colors.textFaint : scoreColor(st.mean) }]}>
                  {st.mean == null ? '–' : Math.round(st.mean)}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={type.heading} numberOfLines={1}>
                  {exam.title}
                </Text>
                <Text style={[type.caption, { marginTop: 2 }]} numberOfLines={1}>
                  {[exam.course, `${exam.numQuestions} questions`].filter(Boolean).join(' · ')}
                </Text>
                <Text
                  style={[type.caption, { marginTop: 2, color: st.needsReview || keySet < exam.numQuestions ? colors.warning : colors.textFaint }]}
                  numberOfLines={1}
                >
                  {notes.join(' · ')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          );
        }}
      />

      <View style={styles.dock}>
        <Button title="New exam" icon="add" onPress={() => router.push('/exam/new')} />
      </View>
    </SafeAreaView>
  );
}

function Summary({ value, label, color = colors.text }: { value: number; label: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.title, { color }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    marginBottom: space.xl,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rule: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  score: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 17, fontWeight: '700' },
  dock: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
