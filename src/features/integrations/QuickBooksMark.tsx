import Svg, { Circle, Path } from 'react-native-svg';

// QuickBooks' green disc with its interlocking "qb": a ring-and-descender on the
// left, a ring-and-ascender on the right, the two stems meeting in the middle.
// Drawn from strokes, so it is an approximation of Intuit's artwork — swap in
// the official file (assets/integrations/) if brand review asks for it.
export function QuickBooksMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Circle cx={50} cy={50} r={50} fill="#2CA01C" />
      <Circle cx={36} cy={54} r={12} stroke="#FFFFFF" strokeWidth={8} />
      <Circle cx={64} cy={46} r={12} stroke="#FFFFFF" strokeWidth={8} />
      <Path d="M48 54V76" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
      <Path d="M52 46V24" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
    </Svg>
  );
}
