import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Badge, Button, EmptyState, IconButton, Notice, Screen, SectionTitle, Segmented, useToast } from '@/components/ui';
import { sheetPdfUrl } from '@/lib/api';
import { exportExamToExcel } from '@/lib/excel';
import { examStats, gradeSheet } from '@/lib/grading';
import { effectiveStudentId, needsReview, type Sheet } from '@/lib/models';
import { deleteExam, useExam, useSheets } from '@/lib/store';
import { downloadTemplate, isBuiltin, isCached, useTemplateCacheVersion } from '@/lib/templateCache';
import { colors, font, radius, scoreColor, space, themed, type, useColorScheme } from '@/lib/theme';

type Sort = 'recent' | 'id' | 'score' | 'review';

export default function ExamDetail() {
  useColorScheme(); // re-render when light/dark mode changes
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const exam = useExam(examId);
  const sheets = useSheets(examId);
  const toast = useToast();
  const [sort, setSort] = useState<Sort>('recent');
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useTemplateCacheVersion();

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

  const go = (pathname: '/exam/[examId]/key' | '/exam/[examId]/scan' | '/exam/[examId]/results') => router.push({ pathname, params: { examId: exam.id } });
  const needsDownload = exam.templateId !== 'auto' && !isBuiltin(exam.templateId) && !isCached(exam.templateId);

  const header = (
    <View>
      {/* The exam in three steps: key -> scan -> results */}
      <View style={styles.steps}>
        <Step
          n={1}
          title="Answer key"
          status={keyComplete ? `All ${exam.numQuestions} answers set` : `${keySet} of ${exam.numQuestions} set - unset questions are not graded`}
          tone={keyComplete ? 'done' : 'todo'}
          onPress={() => go('/exam/[examId]/key')}
        />
        <Step
          n={2}
          title="Scan papers"
          status={st.count ? `${st.count} graded${st.needsReview ? ` · ${st.needsReview} to review` : ''}` : 'Hold your phone over each answer sheet'}
          tone={st.count ? 'done' : keyComplete ? 'next' : 'todo'}
          onPress={() => go('/exam/[examId]/scan')}
        />
        <Step
          n={3}
          title="Results"
          status={st.count ? `Average ${st.mean}% · pass rate ${st.passRate}% · question analysis` : 'Scores and question analysis appear here'}
          tone={st.count ? 'done' : 'todo'}
          onPress={() => (st.count ? go('/exam/[examId]/results') : toast('Scan some sheets first.', 'info'))}
          last
        />
      </View>

      <Button title={st.count ? 'Scan more papers' : 'Start scanning'} icon="scan" onPress={() => go('/exam/[examId]/scan')} style={{ marginTop: space.lg }} />
      <View style={[styles.actions, { marginTop: space.sm }]}>
        <Button title="Export Excel" icon="download-outline" variant="secondary" compact loading={exporting} onPress={doExport} style={{ flex: 1 }} />
        {isBuiltin(exam.templateId) && (
          <Button
            title="Print sheets"
            icon="print-outline"
            variant="secondary"
            compact
            onPress={async () => {
              try {
                const dest = `${FileSystem.cacheDirectory}scantron-${exam.templateId}.pdf`;
                const r = await FileSystem.downloadAsync(sheetPdfUrl(exam.templateId, exam.title.slice(0, 60)), dest);
                if (r.status !== 200) throw new Error(`Server returned ${r.status}`);
                await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', dialogTitle: 'Print answer sheets', UTI: 'com.adobe.pdf' });
              } catch (e: any) {
                toast(e?.message?.includes('Network') ? 'Connect to the internet to download sheets.' : e?.message ?? 'Download failed', 'danger');
              }
            }}
            style={{ flex: 1 }}
          />
        )}
      </View>

      {needsDownload && (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Notice tone="info" icon="cloud-download-outline" text="Download this sheet type once to grade it offline, instantly and with live scanning." />
          <Button
            title="Download for offline use"
            icon="download-outline"
            variant="secondary"
            compact
            loading={downloading}
            onPress={async () => {
              setDownloading(true);
              try {
                const ok = await downloadTemplate(exam.templateId);
                toast(ok ? 'Ready for offline grading' : 'This sheet type can only be graded online.', ok ? 'success' : 'info');
              } catch (e: any) {
                toast(e?.message ?? 'Download failed', 'danger');
              } finally {
                setDownloading(false);
              }
            }}
          />
        </View>
      )}
      {dupes.size > 0 && (
        <View style={{ marginTop: space.md }}>
          <Notice tone="warning" text={`Duplicate index numbers: ${[...dupes].slice(0, 5).join(', ')}. Check those sheets.`} />
        </View>
      )}

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

function Step({ n, title, status, tone, onPress, last }: { n: number; title: string; status: string; tone: 'done' | 'next' | 'todo'; onPress: () => void; last?: boolean }) {
  const done = tone === 'done';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.step, !last && styles.stepRule, pressed && { backgroundColor: colors.surface2 }]} accessibilityRole="button">
      <View style={[styles.stepNum, done ? { backgroundColor: colors.success, borderColor: colors.success } : tone === 'next' ? { borderColor: colors.accent } : null]}>
        {done ? <Icon name="checkmark" size={15} color={colors.surface} /> : <Text style={{ color: tone === 'next' ? colors.accent : colors.textMuted, fontWeight: '700' }}>{n}</Text>}
      </View>
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={type.heading}>{title}</Text>
        <Text style={[type.caption, { marginTop: 2 }]}>{status}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
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
        <Text style={{ color: scoreColor(pct), fontWeight: '700', fontSize: 14 }}>{pct == null ? '–' : Math.round(pct)}</Text>
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
      {!review && (sheet.reviewed || Object.keys(sheet.overrides).length > 0) && <Icon name="checkmark-circle" size={18} color={colors.success} />}
      <Icon name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

const styles = themed(() => ({
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  steps: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', padding: space.md, paddingVertical: 14 },
  stepRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepNum: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
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
  scoreDot: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
}));
