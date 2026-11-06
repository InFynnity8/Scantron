import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, Segmented } from '@/components/ui';
import { examStats, gradeSheet, itemAnalysis, type ItemStat } from '@/lib/grading';
import { useExam, useSheets } from '@/lib/store';
import { colors, radius, scoreColor, space, themed, type, useColorScheme } from '@/lib/theme';

type Order = 'number' | 'hardest';

/** Class results: score summary, score spread and per-question analysis. */
export default function Results() {
  useColorScheme(); // re-render when light/dark mode changes
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const exam = useExam(examId);
  const sheets = useSheets(examId);
  const [order, setOrder] = useState<Order>('hardest');

  const items = useMemo(() => (exam ? itemAnalysis(exam, sheets) : []), [exam, sheets]);
  const spread = useMemo(() => {
    const bins = Array.from({ length: 10 }, () => 0);
    if (!exam) return bins;
    for (const s of sheets) {
      const p = gradeSheet(exam, s).percentage;
      if (p != null) bins[Math.min(9, Math.floor(p / 10))]++;
    }
    return bins;
  }, [exam, sheets]);

  if (!exam) return <Screen title="Results" />;
  const st = examStats(exam, sheets);
  const graded = items.filter((i) => i.pCorrect != null);
  const shown = order === 'hardest' ? [...graded].sort((a, b) => (a.pCorrect ?? 0) - (b.pCorrect ?? 0)) : graded;
  const maxBin = Math.max(1, ...spread);

  return (
    <Screen title="Results" subtitle={`${exam.title} · ${st.count} sheet${st.count === 1 ? '' : 's'}`}>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.label}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}
        ListEmptyComponent={<EmptyState icon="document-text-outline" title="Nothing to analyse yet" body="Set the answer key and scan some sheets to see how each question went." />}
        ListHeaderComponent={
          st.count ? (
            <View>
              <View style={styles.summary}>
                <Figure value={st.mean == null ? '–' : `${st.mean}%`} label="average" color={scoreColor(st.mean)} />
                <Figure value={st.median == null ? '–' : `${st.median}%`} label="median" />
                <Figure value={st.passRate == null ? '–' : `${st.passRate}%`} label={`passed (≥ ${exam.passMark}%)`} />
              </View>
              <Text style={[type.caption, { marginTop: space.sm }]}>
                Highest {st.high ?? '–'}% · lowest {st.low ?? '–'}% · standard deviation {st.stdev ?? '–'}
              </Text>

              <Text style={[type.label, { marginTop: space.xl, marginBottom: space.sm }]}>Score spread</Text>
              <View style={styles.chart}>
                {spread.map((n, i) => (
                  <View key={i} style={styles.barCol}>
                    <Text style={[type.caption, { fontSize: 11 }]}>{n || ''}</Text>
                    <View style={[styles.bar, { height: 4 + (n / maxBin) * 80, backgroundColor: i * 10 >= exam.passMark ? colors.success : colors.danger, opacity: n ? 1 : 0.18 }]} />
                    <Text style={[type.caption, { fontSize: 10 }]}>{i * 10}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm }}>
                <Text style={[type.label, { flex: 1 }]}>Questions</Text>
              </View>
              <Segmented<Order>
                value={order}
                onChange={setOrder}
                options={[
                  { value: 'hardest', label: 'Hardest first' },
                  { value: 'number', label: 'By number' },
                ]}
              />
              <Text style={[type.caption, { marginTop: space.sm, marginBottom: space.md }]}>
                Bar = share of students who got it right. A question most students miss, or that strong students miss, is worth
                re-checking (wrong key, unclear wording).
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
        renderItem={({ item }) => <ItemRow item={item} options={exam.options} />}
      />
    </Screen>
  );
}

function Figure({ value, label, color = colors.text }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.title, { color }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

function ItemRow({ item, options }: { item: ItemStat; options: string[] }) {
  const pct = Math.round((item.pCorrect ?? 0) * 100);
  const total = Object.values(item.optionCounts).reduce((a, b) => a + b, 0) + item.blank + item.multiple;
  // Most popular wrong answer: the usual sign of a mis-keyed or confusing question.
  const keySet = new Set(item.key.split(''));
  const wrong = options.filter((o) => !keySet.has(o)).sort((a, b) => (item.optionCounts[b] ?? 0) - (item.optionCounts[a] ?? 0))[0];
  const wrongN = wrong ? item.optionCounts[wrong] ?? 0 : 0;
  const flag =
    item.discrimination != null && item.discrimination < 0
      ? 'Strong students missed it - check the key'
      : pct < 30
        ? 'Most students missed it'
        : null;
  return (
    <View style={styles.row}>
      <Text style={styles.qnum}>{item.label}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: scoreColor(pct) }]} />
          </View>
          <Text style={[styles.pct, { color: scoreColor(pct) }]}>{pct}%</Text>
        </View>
        <Text style={[type.caption, { marginTop: 4 }]}>
          Key {item.key || '–'}
          {wrongN > 0 ? ` · most common wrong: ${wrong} (${wrongN}/${total})` : ''}
          {item.blank ? ` · ${item.blank} blank` : ''}
        </Text>
        {flag && <Text style={[type.caption, { color: colors.warning, marginTop: 2 }]}>{flag}</Text>}
      </View>
    </View>
  );
}

const styles = themed(() => ({
  summary: {
    flexDirection: 'row',
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 3 },
  bar: { width: '100%', borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.md },
  qnum: { width: 40, fontSize: 15, fontWeight: '700', color: colors.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pct: { width: 46, textAlign: 'right', fontWeight: '700', fontSize: 14 },
}));
