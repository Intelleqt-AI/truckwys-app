import { View, Pressable, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Group, DetailRow, Icon, Txt, Mono, Label } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { PRIVACY_POLICY_URL, TERMS_URL, SUPPORT_EMAIL } from '@/lib/legal';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Support'>;

export function SupportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const openUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      toast.error('Could not open the page');
    }
  };

  const emailSupport = async () => {
    // Pre-fill the context we'd otherwise have to ask for.
    const subject = encodeURIComponent('Truckwys mobile support');
    const body = encodeURIComponent(
      `\n\n---\nAccount: ${user?.email ?? 'unknown'}\nApp version: ${version}`,
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      toast.info(`Email us at ${SUPPORT_EMAIL}`);
    }
  };

  const Row = ({
    icon,
    label,
    sub,
    onPress,
  }: {
    icon: 'send' | 'shield' | 'file';
    label: string;
    sub?: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 border-b border-line-row px-4 py-3 active:bg-surface-hover"
    >
      <Icon name={icon} size={19} color={colors.muted} />
      <View className="flex-1">
        <Txt className="text-body text-fg">{label}</Txt>
        {sub ? <Txt className="mt-0.5 text-caption text-faint">{sub}</Txt> : null}
      </View>
      <Icon name="chevronRight" size={16} color={colors.faint} />
    </Pressable>
  );

  return (
    <SheetScreen eyebrow="Help" title="Support" onBack={() => navigation.goBack()}>
      <Txt className="mb-4 text-callout text-muted">
        Questions about a quote, a booking or your account? The Truckwys operations team answers
        weekdays, 08:00–17:00 SAST.
      </Txt>

      <Group label="Get in touch">
        <Row
          icon="send"
          label="Email support"
          sub={SUPPORT_EMAIL}
          onPress={emailSupport}
        />
        <View className="px-4 py-3">
          <Label className="mb-1 text-muted">Response time</Label>
          <Txt className="text-sub text-muted">Usually within one business day.</Txt>
        </View>
      </Group>

      <Group label="Legal">
        <Row icon="shield" label="Privacy policy" onPress={() => openUrl(PRIVACY_POLICY_URL)} />
        <Row icon="file" label="Terms of service" onPress={() => openUrl(TERMS_URL)} />
      </Group>

      <Group label="App">
        <DetailRow label="Version" value={version} />
        <DetailRow label="Signed in as" value={user?.email ?? '—'} mono={false} last />
      </Group>

      <Mono className="mt-2 text-center text-micro text-faint">Truckwys · v{version}</Mono>
    </SheetScreen>
  );
}
