import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { providerConfig } from '../types';
import { IntegrationLogo, LOGO_XERO } from '@/features/integrations/IntegrationLogo';
import { QuickBooksMark } from '@/features/integrations/QuickBooksMark';

/** A provider's tile: its real logo (Xero, QuickBooks), or a lettermark on its brand colour (Sage). */
export function ProviderMark({ provider, size = 44 }: { provider: string | null | undefined; size?: number }) {
  const cfg = providerConfig(provider);
  if (cfg.code === 'XERO') return <IntegrationLogo source={LOGO_XERO} size={size} />;
  if (cfg.code === 'QBO') {
    return (
      <IntegrationLogo size={size}>
        <QuickBooksMark size={size * 0.78} />
      </IntegrationLogo>
    );
  }
  return (
    <View
      className="items-center justify-center rounded-control"
      style={{ width: size, height: size, backgroundColor: cfg.mark.bg }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Txt className="font-semibold" style={{ color: cfg.mark.fg, fontSize: size * 0.4 }}>
        {cfg.initials}
      </Txt>
    </View>
  );
}

/** The organisation's initials ("GH"), used for the organisation picker. */
export function OrgInitials({ name, size = 40 }: { name: string; size?: number }) {
  const letters =
    name
      .replace(/\(.*?\)/g, '')
      .split(/\s+/)
      .filter((w) => /^[A-Za-z0-9]/.test(w))
      .slice(0, 2)
      .map((w) => (w[0] ?? '').toUpperCase())
      .join('') || '?';
  return (
    <View className="items-center justify-center rounded-control bg-raised" style={{ width: size, height: size }}>
      <Txt className="font-semibold text-muted" style={{ fontSize: size * 0.38 }}>
        {letters}
      </Txt>
    </View>
  );
}
