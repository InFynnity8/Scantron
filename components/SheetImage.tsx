import { Zoomable } from '@likashefqet/react-native-image-zoom';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Rect } from 'react-native-svg';

import type { GradedQuestion } from '@/lib/grading';
import type { Sheet } from '@/lib/models';
import { project } from '@/lib/omr/homography';
import { loadCustomTemplate, loadedTemplate, useTemplateCacheVersion } from '@/lib/templateCache';
import { colors, radius, themed } from '@/lib/theme';

/** Zoomable sheet photo. Server scans come pre-annotated; device scans get a vector overlay. */
export default function SheetImage({ sheet, graded, height = 460 }: { sheet: Sheet; graded: GradedQuestion[]; height?: number }) {
  const [box, setBox] = useState({ w: 0, h: height });
  const uri = sheet.annotatedUri ?? sheet.photoUri;
  const cacheVersion = useTemplateCacheVersion();
  const [loadTick, setLoadTick] = useState(0);
  const template = useMemo(() => loadedTemplate(sheet.templateId), [sheet.templateId, cacheVersion, loadTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!template && sheet.homography) void loadCustomTemplate(sheet.templateId).then((r) => r && setLoadTick((n) => n + 1));
  }, [template, sheet.homography, sheet.templateId]);

  const overlay = useMemo(() => {
    if (sheet.annotatedUri || !sheet.homography || !sheet.imageSize || !template || !box.w) return null;
    const { width: iw, height: ih } = sheet.imageSize;
    const s = Math.min(box.w / iw, box.h / ih);
    const ox = (box.w - iw * s) / 2;
    const oy = (box.h - ih * s) / 2;
    const H = sheet.homography;
    const a = project(H, 0, 0);
    const b = project(H, template.rx, 0);
    const c = project(H, 0, template.ry);
    const r = Math.hypot(b.x - a.x, b.y - a.y) * s * 1.2;
    const ry = Math.hypot(c.x - a.x, c.y - a.y) * s * 1.2;
    const shifts = sheet.blockShifts ?? {};
    let curBlock = -1;
    const map = (x: number, y: number) => {
      const sh = shifts[String(curBlock)];
      const p = project(H, x + (sh?.[0] ?? 0), y + (sh?.[1] ?? 0));
      return { x: ox + p.x * s, y: oy + p.y * s };
    };
    const els: React.ReactElement[] = [];
    const byLabel = new Map(graded.map((g) => [g.label, g]));
    for (const item of template.questions) {
      const g = byLabel.get(item.label);
      if (!g) continue;
      curBlock = item.block;
      item.options.forEach((opt, i) => {
        const marked = g.marked.includes(opt);
        const isKey = g.key.includes(opt);
        if (!marked && !(isKey && g.result !== 'correct')) return;
        const color =
          g.result === 'ungraded' ? colors.info : marked ? (g.result === 'correct' ? colors.success : g.result === 'multiple' ? colors.warning : colors.danger) : colors.success;
        const p = map(item.centers[i].x, item.centers[i].y);
        els.push(<Ellipse key={`${item.label}${opt}`} cx={p.x} cy={p.y} rx={r} ry={ry} stroke={color} strokeWidth={marked ? 2.5 : 1.5} fill="none" strokeDasharray={marked ? undefined : '3 2'} />);
      });
      if (g.flags.length) {
        const p0 = map(item.centers[0].x, item.centers[0].y);
        const p1 = map(item.centers[item.centers.length - 1].x, item.centers[0].y);
        els.push(<Rect key={`f${item.label}`} x={p0.x - r * 1.4} y={p0.y - ry * 1.4} width={p1.x - p0.x + r * 2.8} height={ry * 2.8} stroke={colors.warning} strokeWidth={2} fill="none" rx={4} />);
      }
    }
    for (const f of template.fields) {
      const value = f.name === 'index_number' ? sheet.idOverride || sheet.studentId : sheet.fields[f.name]?.value;
      const marks = f.name === 'index_number' && sheet.idOverride ? undefined : sheet.fields[f.name]?.marks;
      f.columns.forEach((col, ci) => {
        curBlock = col.block;
        const ch = marks ? marks[ci] : value?.[ci];
        const oi = ch ? col.options.indexOf(ch) : -1;
        if (oi < 0) return;
        const p = map(col.centers[oi].x, col.centers[oi].y);
        els.push(<Ellipse key={`${f.name}${ci}`} cx={p.x} cy={p.y} rx={r} ry={ry} stroke={colors.info} strokeWidth={2.5} fill="none" />);
      });
    }
    return els;
  }, [sheet, template, box, graded]);

  if (!uri) return null;
  return (
    <View style={[styles.wrap, { height }]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Zoomable isDoubleTapEnabled maxScale={6} style={{ flex: 1 }}>
        <View style={{ width: box.w, height: box.h }}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          {overlay && <Svg style={StyleSheet.absoluteFill}>{overlay}</Svg>}
        </View>
      </Zoomable>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { backgroundColor: '#000', borderRadius: radius.lg, overflow: 'hidden' },
}));
