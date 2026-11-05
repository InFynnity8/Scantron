import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Field, Notice, Screen, SectionTitle, Segmented, useToast } from '@/components/ui';
import { DEFAULT_SCORING, type Exam } from '@/lib/models';
import { getExam, saveExam, uid } from '@/lib/store';
import { downloadTemplate, isCached } from '@/lib/templateCache';
import { useTemplateOptions } from '@/lib/templates';
import { colors, radius, space, type } from '@/lib/theme';

type Marking = 'standard' | 'negative';

export default function NewExam() {
  const { examId } = useLocalSearchParams<{ examId?: string }>();
  const editing = examId ? getExam(examId) : undefined;
  const { options, loading, error } = useTemplateOptions();
  const toast = useToast();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [course, setCourse] = useState(editing?.course ?? '');
  const [templateId, setTemplateId] = useState(editing?.templateId ?? '');
  const [count, setCount] = useState(editing ? String(editing.numQuestions) : '');
  const [passMark, setPassMark] = useState(String(editing?.passMark ?? 50));
  const [marking, setMarking] = useState<Marking>(editing && editing.scoring.wrong < 0 ? 'negative' : 'standard');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const tpl = useMemo(() => options.find((o) => o.id === templateId), [options, templateId]);
  useEffect(() => {
    if (!templateId && options.length) setTemplateId(options[0].id);
  }, [options, templateId]);
  useEffect(() => {
    if (tpl && !editing && (!count || Number(count) > tpl.numQuestions)) setCount(String(Math.min(tpl.numQuestions, 40)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl?.id]);

  const save = async () => {
    const n = parseInt(count, 10);
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the exam a name.';
    if (!tpl) e.template = 'Choose the answer sheet type.';
    if (!n || n < 1 || (tpl && n > tpl.numQuestions)) e.count = `Enter 1–${tpl?.numQuestions ?? 100}.`;
    const pm = Number(passMark);
    if (Number.isNaN(pm) || pm < 0 || pm > 100) e.pass = 'Enter a percentage between 0 and 100.';
    setErrors(e);
    if (Object.keys(e).length || !tpl) return;

    const key = Array.from({ length: n }, (_, i) => editing?.key[i] ?? '');
    const exam: Exam = {
      id: editing?.id ?? uid('e_'),
      title: title.trim(),
      course: course.trim().toUpperCase(),
      templateId: tpl.id,
      templateName: tpl.name,
      numQuestions: n,
      options: tpl.options,
      key,
      scoring: marking === 'negative' ? { correct: 1, wrong: -0.25, blank: 0 } : DEFAULT_SCORING,
      passMark: pm,
      createdAt: editing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await saveExam(exam);
    if (tpl.downloadable && !isCached(tpl.id)) {
      downloadTemplate(tpl.id)
        .then((ok) => ok && toast(`${tpl.name} downloaded - works offline now.`, 'success'))
        .catch(() => toast('Could not download the sheet for offline use. It will retry when online.', 'danger'));
    }
    if (editing) router.back();
    else router.replace({ pathname: '/exam/[examId]/key', params: { examId: exam.id, first: '1' } });
  };

  return (
    <Screen title={editing ? 'Edit exam' : 'New exam'}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Field label="Exam name" value={title} onChangeText={setTitle} placeholder="e.g. Mid-semester quiz" error={errors.title} />
          <Field label="Course code" value={course} onChangeText={setCourse} placeholder="e.g. COE 456" autoCapitalize="characters" />

          <SectionTitle>Answer sheet</SectionTitle>
          {loading && options.length <= 1 && <ActivityIndicator color={colors.accent} />}
          {!!error && (
            <View style={{ marginBottom: space.md }}>
              <Notice tone="info" text="Offline - showing the printable Scantron sheets. Institution sheets appear when you're online." />
            </View>
          )}
          {!!errors.template && <Text style={{ color: colors.danger, marginBottom: 8 }}>{errors.template}</Text>}
          <View style={{ gap: space.sm }}>
            {options.map((o) => {
              const active = o.id === templateId;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setTemplateId(o.id)}
                  style={[styles.option, active && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.accent : colors.textFaint} />
                  <View style={{ flex: 1, marginLeft: space.md }}>
                    <Text style={[type.body, { fontWeight: '600' }]}>{o.name}</Text>
                    {!!o.description && <Text style={type.caption}>{o.description}</Text>}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      {o.offline ? (
                        <Badge text="Works offline · live scan" color={colors.success} bg={colors.successSoft} icon="flash" />
                      ) : o.downloadable ? (
                        <Badge text="Offline after first download" color={colors.success} bg={colors.successSoft} icon="download-outline" />
                      ) : (
                        <Badge text="Needs internet" icon="cloud-outline" />
                      )}
                      {o.idDigits > 0 && <Badge text={`${o.idDigits}-digit index`} />}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <SectionTitle>Grading</SectionTitle>
          <Field
            label="Number of questions"
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            maxLength={3}
            error={errors.count}
            hint={tpl ? `This sheet has up to ${tpl.numQuestions} questions. Extra questions are ignored.` : undefined}
          />
          <Text style={[type.label, { marginBottom: 6 }]}>Marking</Text>
          <Segmented<Marking>
            value={marking}
            onChange={setMarking}
            options={[
              { value: 'standard', label: '+1 correct, 0 wrong' },
              { value: 'negative', label: 'Negative (−¼ wrong)' },
            ]}
          />
          <Field style={{ marginTop: space.lg }} label="Pass mark (%)" value={passMark} onChangeText={setPassMark} keyboardType="number-pad" maxLength={3} error={errors.pass} />

          <Button title={editing ? 'Save changes' : 'Continue to answer key'} icon={editing ? 'checkmark' : 'arrow-forward'} onPress={save} style={{ marginTop: space.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
