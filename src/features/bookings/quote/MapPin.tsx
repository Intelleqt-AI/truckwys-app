import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

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
