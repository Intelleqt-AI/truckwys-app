import { Text as RNText, type TextProps } from 'react-native';
import { MONO_FONT } from '@/theme/tokens';

// Typography primitives. `Txt` is the sans base (colour defaults to fg). `Mono`
// carries every number/ID/status. `Label` is the signature uppercase mono
// eyebrow (tracked out). All accept NativeWind className for size/colour.

type Props = TextProps & { className?: string };

/**
 * Font size for TextInputs — deliberately WITHOUT a lineHeight.
 *
 * iOS applies its lineHeight centring compensation to Text but never to
 * TextInput: the baseline offset that cancels out an oversized line box lives
 * on the Paragraph renderer only. So a lineHeight from the type scale leaves
 * typed glyphs sitting ~2px below the icon and prefix beside them, while a Txt
 * in the same row (SelectField, DateField) looks correct. Inputs take the size
 * alone and let the platform centre the font's natural line box.
 *
 * Matches `text-body`'s 15px. Do NOT put `text-body` back on a TextInput — its
 * 22px lineHeight is what caused the misalignment.
 */
export const INPUT_TEXT = { fontSize: 15 } as const;

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

/**
 * A form field's label, with an optional required marker.
 *
 * Shared by TextField, SelectField and DateField so the asterisk convention
 * can't drift between them.
 *
 * `required` is a flag rather than something callers append to the label string:
 * SelectField reuses its label as the picker modal's title and inside the search
 * placeholder, so a decorated `"Vehicle type *"` would leak the asterisk into
 * both. The marker is a nested RNText so it inherits the label's size and mono
 * face and overrides nothing but the colour.
 */
export function FieldLabel({ label, required }: { label?: string; required?: boolean }) {
  if (!label) return null;
  return (
    <Label className="mb-1.5 text-muted">
      {label}
      {required ? <RNText className="text-danger"> *</RNText> : null}
    </Label>
  );
}
