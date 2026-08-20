import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

/**
 * The pin's own proportions, from its viewBox — a caller centring it on a point
 * needs both, and guessing them puts the tip somewhere the map isn't reporting.
 *
 * The box is 24x34 with the tip at y=30, so the tip sits (30 - 17)/24 of a size
 * below the box's centre, and the pin's head reaches 30/24 of a size above the
 * tip. Both were being approximated at 0.7, which left the tip ~7px above the
 * coordinate it claimed to mark.
 */
/** Pull the pin up by this * size so its tip lands on the target. */
export const PIN_TIP_OFFSET = -13 / 24;
/** How far the top of the pin reaches above its tip, as a multiple of size. */
export const PIN_TOP_ABOVE_TIP = 30 / 24;

/**
 * The map pin.
 *
 * Lucide's MapPin is a 1.7px outline stroke designed to sit in a text row at
 * 16px. Blown up to marker size on a photographic map it reads as a wireframe —
 * thin, hollow, and it disappears over busy tiles. A map marker needs the
 * opposite: a solid silhouette with a light rim so it holds against any
 * background, and a cast shadow so it reads as sitting *on* the map rather than
 * drawn into it.
 *
 * Geometry is a teardrop whose tip is the exact point being marked, so the
 * caller anchors on the bottom of the box, not its centre.
 */
export function MapPin({
  color,
  size = 40,
  /** The soft ground shadow. Off for list rows and static previews. */
  shadow = true,
}: {
  color: string;
  size?: number;
  shadow?: boolean;
}) {
  // 24-wide viewBox; height carries the tail plus room for the shadow.
  const w = size;
  const h = size * (34 / 24);

  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Svg width={w} height={h} viewBox="0 0 24 34">
        {shadow && (
          <>
            {/* Cast shadow at the tip. Two ellipses rather than a blur filter —
                RN SVG's filter support is patchy across platforms. */}
            <Ellipse cx="12" cy="31.4" rx="6" ry="2.1" fill="#000" opacity={0.18} />
            <Ellipse cx="12" cy="31.4" rx="3.2" ry="1.1" fill="#000" opacity={0.22} />
          </>
        )}

        {/* Teardrop: circular head, tapering to a point at y=30. */}
        <Path
          d="M12 0.9c-5.2 0-9.4 4.2-9.4 9.4 0 6.6 7.6 15.3 9.4 19.3 1.8-4 9.4-12.7 9.4-19.3 0-5.2-4.2-9.4-9.4-9.4z"
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {/* Inner well, so the pin reads as a marker and not a solid blob. */}
        <Circle cx="12" cy="10.1" r="3.5" fill="#FFFFFF" opacity={0.95} />
      </Svg>
    </View>
  );
}

/**
 * The crosshair reticle shown while the map moves under a fixed pin.
 *
 * Separate from the pin because it marks a *pending* point: a thin ring with a
 * centre dot, which stays legible while the map is in motion and doesn't imply
 * the location is already chosen.
 */
export function MapReticle({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 22 22">
        <Circle cx="11" cy="11" r="9.2" stroke="#FFFFFF" strokeWidth={2.4} fill="none" opacity={0.85} />
        <Circle cx="11" cy="11" r="9.2" stroke={color} strokeWidth={1.4} fill="none" />
        <Circle cx="11" cy="11" r="2.4" fill={color} stroke="#FFFFFF" strokeWidth={1} />
      </Svg>
    </View>
  );
}

/**
 * The centre-locked pin on the pin-drop screen, animated.
 *
 * Two states, and the transition between them is the whole point: while the map
 * is moving the pin lifts off the surface and its shadow shrinks and darkens,
 * and when the map settles it drops with a short spring and the shadow spreads
 * back out. That is what makes the map read as moving *under* a pin rather than
 * the pin sliding around on top of it — the single detail that separates a
 * ride-hailing picker that feels solid from one that feels like a static overlay.
 *
 * Everything runs in reanimated worklets on the UI thread. Driving this from
 * React state would tie the pin's frame rate to the JS thread, which is
 * simultaneously handling region callbacks and a debounced geocode — exactly when
 * it must not stutter.
 */
export function CentrePin({
  color,
  lifted,
  size = 44,
}: {
  color: string;
  /** True while the map is in motion. */
  lifted: boolean;
  size?: number;
}) {
  // 0 = resting on the map, 1 = lifted.
  const lift = useSharedValue(0);
  // Separate from `lift` so the landing can overshoot without the shadow
  // inverting: the pin bounces, the shadow just settles.
  const land = useSharedValue(0);

  useEffect(() => {
    if (lifted) {
      lift.value = withTiming(1, { duration: 140 });
      return;
    }
    lift.value = withSpring(0, { damping: 12, stiffness: 220, mass: 0.5 });
    // A single squash on impact. withSequence rather than a spring on scale so
    // the pin can't wobble while the address underneath is being read.
    land.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 160 }));
  }, [lifted, lift, land]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [
      // Tip is the marked point, so the pin hangs above its own anchor.
      { translateY: size * PIN_TIP_OFFSET - lift.value * 10 },
      { scaleY: 1 - land.value * 0.07 },
      { scaleX: 1 + land.value * 0.05 },
    ],
  }));

  // The shadow stays on the ground: it tightens and darkens as the pin rises,
  // which is what sells the height.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + lift.value * 0.12,
    transform: [{ scale: 1 - lift.value * 0.35 }],
  }));

  return (
    <View className="items-center justify-center" pointerEvents="none">
      <Animated.View style={shadowStyle} className="absolute">
        <Svg width={size * 0.5} height={size * 0.2} viewBox="0 0 24 10">
          <Ellipse cx="12" cy="5" rx="11" ry="4" fill="#000" opacity={0.55} />
        </Svg>
      </Animated.View>
      <Animated.View style={pinStyle}>
        {/* Its own cast shadow is off: the ground shadow above is doing that job
            and would double up. */}
        <MapPin color={color} size={size} shadow={false} />
      </Animated.View>
    </View>
  );
}
