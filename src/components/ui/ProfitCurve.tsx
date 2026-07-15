import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Mono } from './Text';

export interface CurvePoint {
  margin: number;
  profit: number;
}

// Profit-vs-margin "sweet-spot" sparkline (area + dashed reference at optimal
// margin). Mirrors the web QuoteBuilder chart; x = margin, y = expected profit.
export function ProfitCurve({
  points,
  optimalMargin,
  height = 64,
  color = '#22C55E',
}: {
  points: CurvePoint[];
  optimalMargin?: number;
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  if (points.length < 2) {
    return (
      <View onLayout={onLayout} style={{ height }} className="items-center justify-center">
        <Mono className="text-micro text-faint">Analysing…</Mono>
      </View>
    );
  }

  const pad = 4;
  const sorted = [...points].sort((a, b) => a.margin - b.margin);
  const xs = sorted.map((p) => p.margin);
  const ys = sorted.map((p) => p.profit);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const sx = (m: number) => pad + ((m - minX) / spanX) * (w - pad * 2);
  const sy = (p: number) => pad + (1 - (p - minY) / spanY) * (height - pad * 2);

  const line = sorted.map((p, i) => `${i ? 'L' : 'M'}${sx(p.margin).toFixed(1)},${sy(p.profit).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(maxX).toFixed(1)},${height - pad} L${sx(minX).toFixed(1)},${height - pad} Z`;
  const refX = optimalMargin != null ? sx(optimalMargin) : null;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#pc)" />
          <Path d={line} stroke={color} strokeWidth={1.5} fill="none" />
          {refX != null && (
            <Line x1={refX} y1={pad} x2={refX} y2={height - pad} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          )}
        </Svg>
      )}
    </View>
  );
}
