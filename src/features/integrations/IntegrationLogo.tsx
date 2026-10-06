import type { ReactNode } from 'react';
import { View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';

/**
 * A brand tile: the logo on white (brand artwork is drawn for a light ground, so
 * the tile stays white in dark mode too), hairline border, same corner as the
 * web's `.acct-logo`. Pass `source` for a bundled image or `children` for a drawn mark.
 */
export function IntegrationLogo({
  source,
  children,
  size = 44,
}: {
  source?: ImageSourcePropType;
  children?: ReactNode;
  size?: number;
}) {
  return (
    <View
      className="items-center justify-center overflow-hidden rounded-control border border-line"
      style={{ width: size, height: size, backgroundColor: '#FFFFFF' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {source ? (
        // The supplied artwork has generous padding; scale it up as the web does.
        <Image
          source={source}
          contentFit="contain"
          style={{ width: size, height: size, transform: [{ scale: 1.35 }] }}
        />
      ) : (
        children
      )}
    </View>
  );
}

export const LOGO_XERO = require('../../../assets/integrations/xero.png');
export const LOGO_CARTRACK = require('../../../assets/integrations/cartrack.png');
export const LOGO_CTRLFLEET = require('../../../assets/integrations/ctrlfleet.jpg');
