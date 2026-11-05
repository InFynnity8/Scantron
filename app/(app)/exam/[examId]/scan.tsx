import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import LiveOverlay, { type FrameMapping } from '@/components/LiveOverlay';
import { Badge, Button, EmptyState, IconButton, tap } from '@/components/ui';
import { gradeSheet, keyOptions } from '@/lib/grading';
import { effectiveStudentId, type Exam, type Sheet } from '@/lib/models';
import { DeviceScanError, scanGray, type DeviceScanOptions } from '@/lib/omr/engine';
import type { CompiledTemplate, ScanReading } from '@/lib/omr/types';
import { INDEX_FIELD } from '@/lib/omr/template';
import { canGradeOnDevice, deviceOptions, newSheetId, preparePhoto, ScanError, scanPhoto, toSheet } from '@/lib/scanner';
import { useSettings } from '@/lib/settings';
import { deleteSheet, upsertSheet, useExam, useSheets } from '@/lib/store';
import { loadedTemplate } from '@/lib/templateCache';
import { colors, font, radius, scoreColor, space, type } from '@/lib/theme';

type Phase = 'live' | 'processing' | 'result' | 'error';

interface LiveState {
  reading: ScanReading;
  mapping: FrameMapping;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function signature(r: ScanReading): string {
  return r.questions.map((q) => q.marked.join('')).join('|') + '#' + (r.fields[INDEX_FIELD]?.value ?? '');
}

export default function ScanScreen() {
  const { examId, mode } = useLocalSearchParams<{ examId: string; mode?: 'key' }>();
  const exam = useExam(examId);
  const sheets = useSheets(examId);
  const settings = useSettings();
  const [permission, requestPermission] = useCameraPermissions();

  const cam = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>('live');
  const phaseRef = useRef<Phase>('live');
  const [torch, setTorch] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [live, setLive] = useState<LiveState | null>(null);
  const [hint, setHint] = useState('Fit the whole sheet inside the frame');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [ready, setReady] = useState(false);
  const loopRunning = useRef(false);
  const slide = useRef(new Animated.Value(0)).current;

  const isKeyMode = mode === 'key';
  const onDevice = !!exam && canGradeOnDevice(exam);
  const liveMode = onDevice && settings.liveScan;
  // Device-engine options (built-in sheet, or cached KNUST-style template + reference).
  const [devOpts, setDevOpts] = useState<DeviceScanOptions | null>(null);
  useEffect(() => {
    if (!exam || !onDevice) return;
    let alive = true;
    deviceOptions(exam)
      .then((o) => alive && setDevOpts(o))
      .catch(() => alive && setDevOpts(null));
    return () => {
      alive = false;
    };
  }, [exam, onDevice]);
  const template: CompiledTemplate | undefined = useMemo(
    () => (exam && devOpts ? devOpts.custom?.template ?? loadedTemplate(exam.templateId) : undefined),
    [exam, devOpts],
  );

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
    Animated.spring(slide, { toValue: p === 'result' || p === 'error' ? 1 : 0, useNativeDriver: true, friction: 9 }).start();
  };

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // ------------------------------------------------------------------ results
  const finish = useCallback(
    async (uri: string) => {
      if (!exam) return;
      setPhaseBoth('processing');
      setLive(null);
      try {
        const id = newSheetId();
        const outcome = await scanPhoto(exam, uri, id);
        const s = toSheet(exam, id, outcome);
        setSheet(s);
        setError(null);
        tap(s.reviewReasons.length ? 'warning' : 'success');
        setPhaseBoth('result');
      } catch (e: any) {
        tap('error');
        setError(e instanceof ScanError || e instanceof DeviceScanError ? e.message : e?.message ?? 'Could not read the sheet.');
        setPhaseBoth('error');
      }
    },
    [exam], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const capture = useCallback(async () => {
    if (!cam.current || phaseRef.current !== 'live') return;
    tap('medium');
    setPhaseBoth('processing');
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.92, shutterSound: false });
      if (pic?.uri) await finish(pic.uri);
    } catch (e: any) {
      setError(e?.message ?? 'Camera error');
      setPhaseBoth('error');
    }
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled && r.assets[0]) await finish(r.assets[0].uri);
  };

  // ------------------------------------------------------------------ live loop
  useEffect(() => {
    if (!liveMode || !focused || !ready || phase !== 'live' || !exam || !view.w || !devOpts) return;
    let alive = true;
    let last = '';
    let stable = 0;
    (async () => {
      if (loopRunning.current) return;
      loopRunning.current = true;
      while (alive && phaseRef.current === 'live') {
        let frameUri: string | undefined;
        let smallUri: string | undefined;
        try {
          const pic = await cam.current?.takePictureAsync({ quality: 0.5, skipProcessing: true, shutterSound: false, exif: false });
          frameUri = pic?.uri;
          if (!frameUri || !alive || phaseRef.current !== 'live') break;
          const p = await preparePhoto(frameUri, devOpts.custom ? 960 : 760, true, 0.7);
          smallUri = p.uri;
          try {
            const reading = scanGray(p.gray!, devOpts);
            if (!alive || phaseRef.current !== 'live') break;
            setLive({ reading, mapping: { imgW: p.width, imgH: p.height, viewW: view.w, viewH: view.h } });
            const sig = signature(reading);
            stable = sig === last ? stable + 1 : 0;
            last = sig;
            setHint(stable >= 1 ? 'Hold still…' : 'Reading sheet…');
            if (settings.autoCapture && stable >= 1) {
              alive = false;
              await capture();
            }
          } catch (e: any) {
            stable = 0;
            last = '';
            setLive(null);
            setHint(e instanceof DeviceScanError ? e.message : 'Looking for the sheet…');
          }
        } catch {
          await wait(400);
        } finally {
          if (frameUri) FileSystem.deleteAsync(frameUri, { idempotent: true }).catch(() => undefined);
          if (smallUri) FileSystem.deleteAsync(smallUri, { idempotent: true }).catch(() => undefined);
        }
      }
      loopRunning.current = false;
    })();
    return () => {
      alive = false;
    };
  }, [liveMode, focused, ready, phase, exam, view.w, view.h, settings.autoCapture, capture, devOpts]);

  // ------------------------------------------------------------------ actions
  const duplicate = useMemo(() => {
    const id = sheet ? effectiveStudentId(sheet) : null;
    return id ? sheets.find((s) => effectiveStudentId(s) === id) : undefined;
  }, [sheet, sheets]);

  const next = () => {
    setSheet(null);
    setError(null);
    setHint('Fit the whole sheet inside the frame');
    setPhaseBoth('live');
  };

  const keep = async (replace: boolean, openReview = false) => {
    if (!sheet) return;
    if (replace && duplicate) await deleteSheet(duplicate.examId, duplicate.id);
    await upsertSheet(sheet);
    if (openReview) router.push({ pathname: '/exam/[examId]/sheet/[sheetId]', params: { examId: sheet.examId, sheetId: sheet.id } });
    next();
  };

  const useAsKey = () => {
    if (!sheet || !exam) return;
    const key = Array.from({ length: exam.numQuestions }, (_, i) => {
      const a = sheet.answers.find((q) => q.label === String(i + 1));
      return a ? a.marked.join('') : '';
    });
    router.navigate({ pathname: '/exam/[examId]/key', params: { examId: exam.id, scanned: JSON.stringify(key) } });
  };

  // ------------------------------------------------------------------ render
  if (!exam) return <SafeAreaView style={styles.fill} />;
  if (!permission) return <SafeAreaView style={styles.permission} />;
  if (!permission.granted) {
    // Once Android has been told "don't ask again", the system dialog no longer
    // appears - the only way forward is the app's settings page.
    const blocked = permission.status === 'denied' && !permission.canAskAgain;
    return (
      <SafeAreaView style={styles.permission}>
        <EmptyState
          icon="camera-outline"
          title="Camera access needed"
          body={
            blocked
              ? 'Camera access is turned off for Scantron. Open Settings, tap Permissions, then allow Camera.'
              : 'Scantron reads answer sheets with the camera. Photos stay on your phone unless the sheet type needs the grading server.'
          }
          action={
            <Button
              title={blocked ? 'Open settings' : 'Allow camera'}
              icon={blocked ? 'settings-outline' : 'camera-outline'}
              onPress={async () => {
                if (blocked) return void Linking.openSettings();
                const res = await requestPermission();
                if (!res.granted && !res.canAskAgain) void Linking.openSettings();
              }}
              style={{ alignSelf: 'stretch' }}
            />
          }
        />
        <View style={{ paddingHorizontal: space.xl, gap: space.sm }}>
          <Button title="Choose a photo instead" icon="images-outline" variant="secondary" onPress={pickFromGallery} />
          <Button title="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const keyOf = (label: string) => keyOptions(exam.key[Number(label) - 1]);
  const liveGrade = live && !isKeyMode ? liveScore(exam, live.reading) : null;
  const liveId = live?.reading.fields[INDEX_FIELD]?.value;

  return (
    <View style={styles.fill} onLayout={(e: LayoutChangeEvent) => setView({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <StatusBar style="light" />
      {focused && (
        <CameraView
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter={false}
          autofocus="on"
          onCameraReady={() => setReady(true)}
        />
      )}

      {live && template && live.reading.homography && phase === 'live' && (
        <LiveOverlay
          template={template}
          H={live.reading.homography}
          shifts={live.reading.blockShifts}
          mapping={live.mapping}
          questions={live.reading.questions.filter((q) => Number(q.label) <= exam.numQuestions)}
          idColumns={template.fields.flatMap((f) => live.reading.fields[f.name]?.characters ?? [])}
          keyOf={isKeyMode ? () => [] : keyOf}
        />
      )}
      {!live && phase === 'live' && <Guide />}

      {/* top bar */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <IconButton icon="close" label="Close" onPress={() => router.back()} style={styles.glass} color={colors.camText} />
        <View style={[styles.glass, styles.pill]}>
          <Text style={{ color: colors.camText, fontWeight: '600' }} numberOfLines={1}>
            {isKeyMode ? 'Scan answer key' : exam.title}
          </Text>
          {!isKeyMode && <Text style={{ color: CAM_MUTED, fontSize: 12 }}>{sheets.length ? `${sheets.length} graded` : "No sheets yet"}</Text>}
        </View>
        <IconButton icon={torch ? 'flash' : 'flash-off'} label="Torch" onPress={() => setTorch((t) => !t)} style={styles.glass} color={torch ? TORCH_ON : colors.camText} />
      </SafeAreaView>

      {/* live status */}
      {phase === 'live' && (
        <View style={styles.liveInfo} pointerEvents="none">
          {liveGrade ? (
            <View style={[styles.glass, styles.liveCard]}>
              <Text style={{ color: camScoreColor(liveGrade.percentage), fontSize: 30, fontWeight: '800' }}>
                {liveGrade.score}/{liveGrade.max}
              </Text>
              <Text style={{ color: colors.camText, fontFamily: font.mono, fontWeight: '700' }}>{liveId ?? '—'}</Text>
            </View>
          ) : null}
          <View style={[styles.glass, styles.hint]}>
            {onDevice ? (
              <Badge text={liveMode ? 'Live' : 'On phone'} color={CAM_GOOD} bg="transparent" icon="flash" />
            ) : (
              <Badge text="Server" color={CAM_INFO} bg="transparent" icon="cloud-outline" />
            )}
            <Text style={{ color: colors.camText, fontSize: 14, marginLeft: 4, flexShrink: 1 }}>{liveMode ? hint : 'Fit the sheet in the frame, then tap capture'}</Text>
          </View>
        </View>
      )}

      {/* bottom controls */}
      {phase === 'live' && (
        <SafeAreaView edges={['bottom']} style={styles.controls}>
          <IconButton icon="images-outline" label="Choose photo" onPress={pickFromGallery} style={[styles.glass, { width: 52, height: 52 }]} color={colors.camText} />
          <Pressable onPress={capture} style={styles.shutter} accessibilityRole="button" accessibilityLabel="Capture">
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={{ width: 52 }} />
        </SafeAreaView>
      )}

      {phase === 'processing' && (
        <View style={[StyleSheet.absoluteFill, styles.processing]}>
          <ActivityIndicator size="large" color={colors.camText} />
          <Text style={[type.heading, { marginTop: space.lg, color: colors.camText }]}>Reading sheet…</Text>
          <Text style={[type.bodyMuted, { color: CAM_MUTED }]}>{onDevice ? 'Grading on your phone' : 'Uploading to the grading server'}</Text>
        </View>
      )}

      {/* result sheet */}
      <Animated.View
        style={[styles.result, { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] }]}
        pointerEvents={phase === 'result' || phase === 'error' ? 'auto' : 'none'}
      >
        <SafeAreaView edges={['bottom']}>
          {phase === 'error' && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
                <Icon name="alert-circle" size={26} color={colors.danger} />
                <Text style={[type.heading, { marginLeft: 8 }]}>Couldn’t read this sheet</Text>
              </View>
              <Text style={[type.bodyMuted, { marginBottom: space.lg }]}>{error}</Text>
              <Button title="Try again" icon="refresh" onPress={next} />
            </View>
          )}
          {phase === 'result' && sheet && <ResultBody exam={exam} sheet={sheet} keyMode={isKeyMode} duplicate={duplicate} onNext={next} onKeep={keep} onUseAsKey={useAsKey} />}
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function liveScore(exam: Exam, r: ScanReading) {
  const fake: Sheet = {
    id: 'live',
    examId: exam.id,
    createdAt: 0,
    templateId: r.templateId,
    engine: 'device',
    studentId: null,
    studentIdConfidence: 0,
    fields: {},
    answers: r.questions,
    overrides: {},
    reviewReasons: [],
    reviewed: false,
    warnings: [],
  };
  const g = gradeSheet(exam, fake);
  return g.max > 0 ? g : null;
}

function ResultBody({
  exam,
  sheet,
  keyMode,
  duplicate,
  onNext,
  onKeep,
  onUseAsKey,
}: {
  exam: Exam;
  sheet: Sheet;
  keyMode: boolean;
  duplicate?: Sheet;
  onNext: () => void;
  onKeep: (replace: boolean, review?: boolean) => void;
  onUseAsKey: () => void;
}) {
  const g = gradeSheet(exam, sheet);
  if (keyMode) {
    const answered = sheet.answers.filter((a) => a.marked.length).length;
    return (
      <View>
        <Text style={type.heading}>Answer key read</Text>
        <Text style={[type.bodyMuted, { marginVertical: space.sm }]}>
          {answered} of {exam.numQuestions} questions have a mark. You can adjust any answer on the next screen.
        </Text>
        <Text style={{ color: colors.text, fontFamily: font.mono, fontSize: 15, marginBottom: space.lg }} numberOfLines={3}>
          {sheet.answers.map((a) => a.marked.join('') || '·').join(' ')}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Rescan" variant="secondary" onPress={onNext} style={{ flex: 1 }} />
          <Button title="Use as key" icon="checkmark" onPress={onUseAsKey} style={{ flex: 2 }} />
        </View>
      </View>
    );
  }
  const id = effectiveStudentId(sheet);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Index number</Text>
          <Text style={{ color: id ? colors.text : colors.warning, fontFamily: font.mono, fontSize: 24, fontWeight: '700' }}>{id ?? 'Not read'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: scoreColor(g.percentage), fontSize: 34, fontWeight: '800' }}>{g.percentage == null ? '–' : `${g.percentage}%`}</Text>
          <Text style={type.caption}>
            {g.score}/{g.max} · {g.counts.correct} right · {g.counts.wrong + g.counts.multiple} wrong · {g.counts.blank} blank
          </Text>
        </View>
      </View>
      {(sheet.reviewReasons.length > 0 || duplicate || sheet.warnings.length > 0) && (
        <View style={{ marginTop: space.md, gap: 6 }}>
          {duplicate && <Badge text={`Index ${id} was already scanned`} color={colors.danger} bg={colors.dangerSoft} icon="copy-outline" />}
          {sheet.reviewReasons.map((r) => (
            <Badge key={r} text={r} color={colors.warning} bg={colors.warningSoft} icon="eye-outline" />
          ))}
          {sheet.warnings.slice(0, 2).map((w) => (
            <Badge key={w} text={w} color={colors.info} bg={colors.infoSoft} icon="information-circle-outline" />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Button title="Retake" variant="secondary" onPress={onNext} style={{ flex: 1 }} compact />
        <Button title="Review" variant="secondary" icon="eye-outline" onPress={() => onKeep(!!duplicate, true)} style={{ flex: 1 }} compact />
        <Button title={duplicate ? 'Replace' : 'Save & next'} icon="arrow-forward" onPress={() => onKeep(!!duplicate)} style={{ flex: 1.4 }} compact />
      </View>
    </View>
  );
}

function Guide() {
  return (
    <View style={styles.guideWrap} pointerEvents="none">
      <View style={styles.guide}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <View
            key={c}
            style={[
              styles.corner,
              c[0] === 't' ? { top: -2, borderTopWidth: 4 } : { bottom: -2, borderBottomWidth: 4 },
              c[1] === 'l' ? { left: -2, borderLeftWidth: 4 } : { right: -2, borderRightWidth: 4 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Camera chrome sits on the live preview, so it uses its own light-on-dark palette.
const CAM_MUTED = 'rgba(255,255,255,0.72)';
const CAM_GOOD = '#7DDBA3';
const CAM_INFO = '#A8CBEB';
const TORCH_ON = '#FFD166';
function camScoreColor(pct: number | null | undefined) {
  if (pct == null) return colors.camText;
  return pct >= 70 ? CAM_GOOD : pct >= 50 ? TORCH_ON : '#FF8A80';
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  permission: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  glass: { backgroundColor: colors.camBar },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, gap: space.sm },
  pill: { flex: 1, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: space.lg, alignItems: 'center' },
  liveInfo: { position: 'absolute', left: space.lg, right: space.lg, bottom: 150, alignItems: 'center', gap: space.sm },
  liveCard: { borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.xl, alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: space.md, maxWidth: '100%' },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: space.xl, paddingTop: space.md },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  processing: { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  result: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '82%', aspectRatio: 210 / 297, maxHeight: '72%' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: colors.camGuide, borderRadius: 3 },
});
