import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

// Typography primitives (web v3: system sans, weights 400/500/600, sentence case).
// `Txt` is the base (colour defaults to fg). `Mono` carries every number/ID/status
// — it keeps its name for the existing call sites, but is now the same sans face
// with tabular numerals so figures line up like the web's `tabular-nums`. `Label`
// is the small muted caption above a field/section. All accept NativeWind
// className for size/colour.

type Props = TextProps & { className?: string };

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

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
  return <RNText className={`text-fg ${className}`} style={[TABULAR, style]} {...props} />;
}

export function Label({ className = '', style, ...props }: Props) {
  return (
    <RNText
      className={`text-caption font-medium text-faint ${className}`}
      style={[TABULAR, style]}
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
    <Label className="mb-1.5 text-sub text-muted">
      {label}
      {required ? <RNText className="text-danger"> *</RNText> : null}
    </Label>
  );
}
