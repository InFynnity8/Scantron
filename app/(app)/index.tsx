import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, EmptyState, IconButton } from '@/components/ui';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={type.display}>Scantron</Text>
          <Text style={type.bodyMuted}>
            {exams.length} exam{exams.length === 1 ? '' : 's'} · {totals.sheets} sheet{totals.sheets === 1 ? '' : 's'} graded
          </Text>
        </View>
        <IconButton icon="print-outline" label="Printable sheets" onPress={() => router.push('/sheets')} />
        <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      {totals.review > 0 && (
        <View style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
          <Badge text={`${totals.review} sheet${totals.review === 1 ? '' : 's'} waiting for review`} color={colors.warning} bg={colors.warningSoft} icon="eye-outline" />
        </View>
      )}

      <FlatList
        data={exams}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No exams yet"
            body="Create an exam, set the answer key, then point your camera at each answer sheet. Results are graded instantly."
            action={<Button title="Create your first exam" icon="add" onPress={() => router.push('/exam/new')} />}
          />
        }
        renderItem={({ item: exam }) => {
          const list = sheets[exam.id] ?? [];
          const st = examStats(exam, list);
          const keySet = exam.key.slice(0, exam.numQuestions).filter(Boolean).length;
          return (
            <Card onPress={() => router.push({ pathname: '/exam/[examId]', params: { examId: exam.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  {!!exam.course && <Text style={[type.label, { color: colors.accent, marginBottom: 2 }]}>{exam.course}</Text>}
                  <Text style={type.heading} numberOfLines={1}>
                    {exam.title}
                  </Text>
                  <Text style={[type.caption, { marginTop: 2 }]}>
                    {exam.numQuestions} questions · {exam.templateName}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.title, { color: scoreColor(st.mean) }]}>{st.mean == null ? '–' : `${st.mean}%`}</Text>
                  <Text style={type.caption}>average</Text>
                </View>
              </View>
              <View style={styles.chips}>
                <Badge text={`${list.length} graded`} icon="checkmark-done" />
                {keySet < exam.numQuestions && <Badge text={`Key ${keySet}/${exam.numQuestions}`} color={colors.warning} bg={colors.warningSoft} icon="key-outline" />}
                {st.needsReview > 0 && <Badge text={`${st.needsReview} to review`} color={colors.warning} bg={colors.warningSoft} icon="eye-outline" />}
              </View>
            </Card>
          );
        }}
      />

      {exams.length > 0 && (
        <Pressable
          onPress={() => router.push('/exam/new')}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button"
          accessibilityLabel="New exam"
        >
          <Ionicons name="add" size={24} color={colors.accentText} />
          <Text style={{ color: colors.accentText, fontWeight: '800', fontSize: 16, marginLeft: 6 }}>New exam</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  chips: { flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.xxl,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
});
