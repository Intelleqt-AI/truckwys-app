import { useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Icon } from './icons';
import { Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Web's ⓘ: methodology and caveats live behind a small icon instead of a footnote
 * paragraph in the card body. The popover is the web's inverted ink tip
 * (`--tip-bg` / `--tip-fg`), shown centred over a light scrim; tap anywhere to
 * dismiss. 14px glyph with a 44pt hit area (R7).
 */
export function InfoTip({ text, label = 'More info' }: { text: string; label?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.6}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Icon name="info" size={14} color={colors.faint} strokeWidth={1.75} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="flex-1 items-center justify-center bg-backdrop px-8"
        >
          <View
            className="max-w-[300px] rounded-control px-3.5 py-3"
            style={{ backgroundColor: colors.btnPrimaryBg, boxShadow: colors.shadowPop }}
          >
            <Txt className="text-sub" style={{ color: colors.btnPrimaryFg }} accessibilityRole="text">
              {text}
            </Txt>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
