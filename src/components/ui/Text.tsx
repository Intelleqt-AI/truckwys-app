import { Text as RNText, type TextProps } from 'react-native';
import { MONO_FONT } from '@/theme/tokens';

// Typography primitives. `Txt` is the sans base (colour defaults to fg). `Mono`
// carries every number/ID/status. `Label` is the signature uppercase mono
// eyebrow (tracked out). All accept NativeWind className for size/colour.

type Props = TextProps & { className?: string };

export function Txt({ className = '', style, ...props }: Props) {
  return (
    <RNText
      className={`text-body text-fg ${className}`}
      style={style}
      {...props}
    />
  );
}

export function Mono({ className = '', style, ...props }: Props) {
  return (
    <RNText
      className={`text-fg ${className}`}
      style={[{ fontFamily: MONO_FONT }, style]}
      {...props}
    />
  );
}

export function Label({ className = '', style, ...props }: Props) {
  return (
    <RNText
      className={`text-micro tracking-label text-faint uppercase ${className}`}
      style={[{ fontFamily: MONO_FONT }, style]}
      {...props}
    />
  );
}
