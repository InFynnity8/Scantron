import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Ellipse, Polygon } from 'react-native-svg';

import { project } from '@/lib/omr/homography';
import type { CompiledTemplate, ItemReading } from '@/lib/omr/types';
import { colors } from '@/lib/theme';

export interface FrameMapping {
  imgW: number;
  imgH: number;
  viewW: number;
  viewH: number;
}

/** Map a point in the analysed frame to view coordinates (preview uses "cover" fit). */
export function toView(m: FrameMapping, x: number, y: number) {
  let px = x;
  let py = y;
  let w = m.imgW;
  let h = m.imgH;
  // Some Android devices hand back sensor-oriented (landscape) frames.
  if (m.imgW > m.imgH !== m.viewW > m.viewH) {
    px = m.imgH - y;
    py = x;
    w = m.imgH;
    h = m.imgW;
  }
  const s = Math.max(m.viewW / w, m.viewH / h);
  return { x: px * s + (m.viewW - w * s) / 2, y: py * s + (m.viewH - h * s) / 2, s };
}

function LiveOverlay({
  template,
  H,
  mapping,
  questions,
  idColumns,
  keyOf,
  shifts,
}: {
  template: CompiledTemplate;
  H: number[];
  shifts?: Record<string, [number, number]>;
  mapping: FrameMapping;
  questions: ItemReading[];
  idColumns: ItemReading[];
  keyOf: (label: string) => string[];
}) {
  const r0 = project(H, 0, 0);
  const r1 = project(H, template.rx, 0);
  const r2 = project(H, 0, template.ry);
  const rxImg = Math.hypot(r1.x - r0.x, r1.y - r0.y);
  const ryImg = Math.hypot(r2.x - r0.x, r2.y - r0.y);
  const at = (block: number, x: number, y: number) => {
    const s = shifts?.[String(block)];
    return project(H, x + (s?.[0] ?? 0), y + (s?.[1] ?? 0));
  };
  const corners = [
    [0, 0],
    [template.width, 0],
    [template.width, template.height],
    [0, template.height],
  ].map(([x, y]) => {
    const p = project(H, x, y);
    const v = toView(mapping, p.x, p.y);
    return `${v.x},${v.y}`;
  });

  const circles: React.ReactElement[] = [];
  const byLabel = new Map(questions.map((q) => [q.label, q]));
  for (const item of template.questions) {
    const reading = byLabel.get(item.label);
    if (!reading) continue;
    const key = keyOf(item.label);
    item.options.forEach((opt, i) => {
      const marked = reading.marked.includes(opt);
      const isKey = key.includes(opt);
      if (!marked && !(isKey && reading.marked.length !== 1)) return;
      let color: string = colors.info;
      if (key.length) {
        if (marked) color = reading.status === 'multiple' ? colors.warning : isKey ? colors.success : colors.danger;
        else color = colors.success; // missed correct answer
      }
      const c = item.centers[i];
      const p = at(item.block, c.x, c.y);
      const v = toView(mapping, p.x, p.y);
      circles.push(
        <Ellipse
          key={`${item.label}${opt}`}
          cx={v.x}
          cy={v.y}
          rx={Math.max(4, rxImg * v.s * 1.2)}
          ry={Math.max(3, ryImg * v.s * 1.2)}
          stroke={color}
          strokeWidth={marked ? 3 : 1.5}
          strokeDasharray={marked ? undefined : '3 3'}
          fill={marked ? `${color}33` : 'none'}
        />,
      );
    });
  }
  const idItems = template.fields.flatMap((f) => f.columns);
  idColumns.forEach((col, ci) => {
    const item = idItems[ci];
    if (!item) return;
    item.options.forEach((opt, i) => {
      if (!col.marked.includes(opt)) return;
      const p = at(item.block, item.centers[i].x, item.centers[i].y);
      const v = toView(mapping, p.x, p.y);
      circles.push(<Ellipse key={`id${ci}${opt}`} cx={v.x} cy={v.y} rx={Math.max(4, rxImg * v.s * 1.2)} ry={Math.max(3, ryImg * v.s * 1.2)} stroke={colors.info} strokeWidth={3} fill={`${colors.info}33`} />);
    });
  });

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Polygon points={corners.join(' ')} stroke={colors.camGuide} strokeWidth={2.5} fill="rgba(255,255,255,0.04)" />
      {circles}
    </Svg>
  );
}

export default memo(LiveOverlay);
