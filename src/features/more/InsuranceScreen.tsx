import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SectionLabel, Badge, Button, Card, Icon, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { AppStackParamList } from '@/navigation/types';

/**
 * Insurance is not live. The route stays so the More menu item leads somewhere
 * truthful instead of a dead row. Copy must not imply partners or cover that do
 * not exist yet. Mirrors the web's src/pages/Insurance.tsx: what is coming, and
 * what works today (premiums logged as Insurance expenses, already counted in
 * the profit and loss).
 */
type Props = NativeStackScreenProps<AppStackParamList, 'Insurance'>;

const COMING = [
  {
    icon: 'truck',
    title: 'Cost per truck',
    text: 'Insurance beside fuel, tolls and maintenance on each vehicle.',
  },
  {
    icon: 'receipt',
    title: 'Cover in every quote',
    text: 'The cost of cover included when you price a load.',
  },
  {
    icon: 'file',
    title: 'Policies with the vehicle',
    text: 'Policy documents and renewal dates kept with the truck they cover.',
  },
] as const;

export function InsuranceScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { goTab } = useAppNavigation();

  return (
    <SheetScreen title="Insurance" onBack={() => navigation.goBack()}>
      <View className="mb-4 items-start gap-2">
        <Badge label="Coming soon" tone="neutral" />
        <Txt className="text-sub text-muted">Cover costs per truck and per load, planned.</Txt>
      </View>

      <SectionLabel>What is coming</SectionLabel>
      <Card className="mb-5 gap-3 p-4">
        {COMING.map((item) => (
          <View key={item.title} className="flex-row gap-3">
            <View className="mt-0.5">
              <Icon name={item.icon} size={18} color={colors.muted} />
            </View>
            <View className="flex-1">
              <Txt className="text-callout font-medium text-fg">{item.title}</Txt>
              <Txt className="mt-0.5 text-sub text-muted">{item.text}</Txt>
            </View>
          </View>
        ))}
      </Card>

      <SectionLabel>Until then</SectionLabel>
      <Card className="mb-5 gap-3 p-4">
        <Txt className="text-sub text-muted">
          No cover through TruckWys yet. Log premiums as Insurance expenses so your profit and loss counts them.
        </Txt>
        <Button
          label="Go to expenses"
          variant="secondary"
          fullWidth
          onPress={() => goTab('Finance', { tab: 'expenses' })}
        />
      </Card>
    </SheetScreen>
  );
}
