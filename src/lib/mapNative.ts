import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Lazy access to the native map libraries.
 *
 * Same reasoning as pushNative: Expo Go ships a fixed set of native modules and
 * neither of these is one of them, so a static import throws while the module
 * graph is evaluating and takes the whole screen down before any fallback can
 * render. Behind these flags, Expo Go gets the static RouteMap instead and JS
 * iteration on the quote builder — the screen edited most often — keeps
 * working without a dev-client rebuild.
 *
 * Every real build resolves the require and behaves identically to a direct
 * import. Nothing else in the app should import react-native-maps or
 * @maplibre/maplibre-react-native directly.
 */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * iOS renders Apple Maps via react-native-maps, which needs no key and no
 * billing account, so it's used there unchanged. Android instead renders
 * through MapLibre GL Native styled with MapTiler tiles (see getMapLibreLib
 * below) — react-native-maps' Android renderer is the Google Maps SDK
 * natively and needs its own key just to initialise, which this app doesn't
 * want to require.
 */
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

type MapsModule = typeof import('react-native-maps');
type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

let mapsCache: MapsModule | null = null;
let mapLibreCache: MapLibreModule | null = null;

/** react-native-maps (Apple Maps), iOS only. */
export function getMapsLib(): MapsModule | null {
  if (IS_EXPO_GO || Platform.OS !== 'ios') return null;
  if (!mapsCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mapsCache = require('react-native-maps') as MapsModule;
  }
  return mapsCache;
}

/** MapLibre GL Native (MapTiler tiles), Android only. */
export function getMapLibreLib(): MapLibreModule | null {
  if (IS_EXPO_GO || Platform.OS !== 'android' || !MAPTILER_KEY) return null;
  if (!mapLibreCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mapLibreCache = require('@maplibre/maplibre-react-native') as MapLibreModule;
  }
  return mapLibreCache;
}

/** True when an interactive map can actually be rendered on this platform. */
export const canRenderInteractiveMap = (): boolean => getMapsLib() != null || getMapLibreLib() != null;
