import Svg, { Ellipse, Rect } from 'react-native-svg';

import { BRAND } from '@/lib/theme';

/** Filled option in each row of the mark (3 rows x 4 options). Same drawing as the app icon. */
const MARK = [1, 3, 0];

/** The Scantron mark: three rows of answer bubbles, one filled in each. */
export default function Logo({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={0} y={0} width={64} height={64} rx={14} fill={BRAND} />
      {MARK.map((filled, row) =>
        [0, 1, 2, 3].map((col) => (
          <Ellipse
            key={`${row}-${col}`}
            cx={17 + col * 10}
            cy={20 + row * 12}
            rx={3.6}
            ry={2.6}
            fill={col === filled ? '#FFFFFF' : 'none'}
            stroke="#FFFFFF"
            strokeOpacity={col === filled ? 1 : 0.65}
            strokeWidth={1.1}
          />
        )),
      )}
    </Svg>
  );
}
