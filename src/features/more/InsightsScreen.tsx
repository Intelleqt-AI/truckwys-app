import { useLayoutEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, SwipeTabs } from '@/components/ui';
import { FindingsTab } from './insights/FindingsTab';
import { FleetTab } from './insights/FleetTab';
import { LanesTab } from './insights/LanesTab';
import { MarginTab } from './insights/MarginTab';
import { PaidTab } from './insights/PaidTab';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Insights'>;

// The same five tabs, in the same order, as the web's Insights page.
type Tab = 'findings' | 'margin' | 'paid' | 'fleet' | 'lanes';
// The web dropped its Cash flow tab (actual cash is Finance > Reports > Cash
// movement, a predicted shortfall is a finding), so old links that ask for it
// ('cashflow', or the web's 'cash') land on Getting paid, as they do there. Old
// 'briefing' links and anything unknown land on Findings.
const startTab = (t?: string): Tab =>
  t === 'margin' || t === 'paid' || t === 'fleet' || t === 'lanes'
    ? t
    : t === 'cashflow' || t === 'cash'
      ? 'paid'
      : 'findings';

export function InsightsScreen({ navigation, route }: Props) {
  const [tab, setTab] = useState<Tab>(startTab(route.params?.tab));
  const { colors } = useTheme();

  // SheetScreen's ScrollView can't host SwipeTabs' PagerView (a ScrollView's
  // content has no bounded height, which PagerView needs to render pages and
  // handle the swipe gesture) — so this screen sets its own plain, opaque
  // header instead, same as MoreScreen does for the same reason.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Insights',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
    });
  }, [navigation, colors.bgDeep]);

  return (
    <Screen scroll={false} padded={false} topInset={false} contentClassName="pt-2">
      <SwipeTabs
        tabs={[
          { label: 'Findings', value: 'findings' },
          { label: 'Margin', value: 'margin' },
          { label: 'Getting paid', value: 'paid' },
          { label: 'Fleet', value: 'fleet' },
          { label: 'Lanes', value: 'lanes' },
        ]}
        value={tab}
        onChange={setTab}
        lazy
      >
        <FindingsTab />
        <MarginTab />
        <PaidTab />
        <FleetTab />
        <LanesTab />
      </SwipeTabs>
    </Screen>
  );
}
