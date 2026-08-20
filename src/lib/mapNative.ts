import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Lazy access to react-native-maps.
 *
 * Same reasoning as pushNative: Expo Go ships a fixed set of native modules and
 * this is not one of them, so a static import throws while the module graph is
 * evaluating and takes the whole screen down before any fallback can render.
 * Behind this flag, Expo Go gets the static RouteMap instead and JS iteration on
 * the quote builder — the screen edited most often — keeps working without a
 * dev-client rebuild.
 *
 * Every real build resolves the require and behaves identically to a direct
 * import. Nothing else in the app should import react-native-maps.
 */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * iOS renders Apple Maps, which needs no key and no billing account. Android
 * renders Google Maps, which needs both — and without a key it does not error,
 * it just draws a blank grey rectangle. That is worse than the static tile map
 * it replaced and looks like a bug in our code, so Android falls back until a
 * key is actually configured.
 */
const ANDROID_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';
export const NEEDS_ANDROID_MAPS_KEY = Platform.OS === 'android' && !ANDROID_MAPS_KEY;

type MapsModule = typeof import('react-native-maps');

let cache: MapsModule | null = null;

/** The maps module, or null in Expo Go. */
export function getMapsLib(): MapsModule | null {
  if (IS_EXPO_GO || NEEDS_ANDROID_MAPS_KEY) return null;
  if (!cache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = require('react-native-maps') as MapsModule;
  }
  return cache;
}

/** True when an interactive map can actually be rendered. */
export const canRenderInteractiveMap = (): boolean => getMapsLib() != null;
