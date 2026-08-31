import { KeyboardController } from 'react-native-keyboard-controller';

// Hard cap on how long a save flow will wait for the hide animation. The
// promise below resolves off a native hide event; if that event never lands
// (hardware keyboard, an OS that reports nothing), the confirmation overlay
// must still appear rather than the save silently stalling.
const HIDE_TIMEOUT_MS = 400;

/**
 * Blurs the focused input and resolves once the keyboard is actually gone —
 * resolves immediately when nothing is focused, so it's safe to await
 * unconditionally. Use it before showing a confirmation overlay: a popup
 * fading in over a still-open keyboard reads as a glitch.
 */
export async function dismissKeyboard(): Promise<void> {
  await Promise.race([
    KeyboardController.dismiss(),
    new Promise<void>((resolve) => setTimeout(resolve, HIDE_TIMEOUT_MS)),
  ]);
}
