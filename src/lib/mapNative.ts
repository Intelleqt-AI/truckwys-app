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

type MapsModule = typeof import('react-native-maps');

let cache: MapsModule | null = null;

/** The maps module, or null in Expo Go. */
export function getMapsLib(): MapsModule | null {
  if (IS_EXPO_GO) return null;
  if (!cache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = require('react-native-maps') as MapsModule;
  }
  return cache;
}

/** True when an interactive map can actually be rendered. */
export const canRenderInteractiveMap = (): boolean => getMapsLib() != null;
