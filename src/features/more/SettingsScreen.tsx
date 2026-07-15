import { useEffect, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  TextField,
  SelectField,
  Toggle,
  SegmentedControl,
  Button,
  IconButton,
  Icon,
  Txt,
  Mono,
  Label,
  EmptyState,
  type IconName,
} from '@/components/ui';
import { fetchData, postData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import {
  useCompanyProfile,
  updateCompanyProfile,
  changePassword,
  updateCompanyLogo,
  useSessions,
  revokeSession,
  setTwoFactor,
  useUsers,
  inviteUser,
  updateUserRole,
  removeUser,
} from './api';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Settings'>;

const SECTIONS: { key: string; label: string; icon: IconName }[] = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'appearance', label: 'Appearance', icon: 'eye' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'security', label: 'Security', icon: 'lock' },
  { key: 'company', label: 'Company details', icon: 'building' },
  { key: 'vehicle-types', label: 'Vehicle types', icon: 'truck' },
  { key: 'users', label: 'Users & permissions', icon: 'users' },
  { key: 'billing', label: 'Billing', icon: 'card' },
  { key: 'integrations', label: 'Integrations', icon: 'plug' },
  { key: 'directory', label: 'Directory', icon: 'grid' },
  { key: 'risk', label: 'Risk-Scoring API', icon: 'shield' },
];

export function SettingsScreen({ route, navigation }: Props) {
  const section = route.params?.section;
  const current = SECTIONS.find((s) => s.key === section);

  return (
    <SheetScreen
      eyebrow="Settings"
      title={current?.label ?? 'Settings'}
      onBack={() => navigation.goBack()}
    >
      {!section && <SettingsMenu onOpen={(k) => navigation.push('Settings', { section: k })} />}
      {section === 'profile' && <ProfileSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'notifications' && <NotificationsSection />}
      {section === 'security' && <SecuritySection />}
      {section === 'company' && <CompanySection />}
      {section === 'vehicle-types' && <VehicleTypesSection />}
      {section === 'users' && <UsersSection />}
      {section === 'billing' && <BillingSection />}
      {section === 'integrations' && <IntegrationsSection />}
      {(section === 'directory' || section === 'risk') && (
        <Txt className="text-callout text-muted">
          {current?.label} is managed on the web dashboard. Configuration here is read-only on mobile.
        </Txt>
      )}
    </SheetScreen>
  );
}

function SettingsMenu({ onOpen }: { onOpen: (k: string) => void }) {
  const { colors } = useTheme();
  return (
    <Group>
      {SECTIONS.map((s, i) => (
        <Pressable
          key={s.key}
          onPress={() => onOpen(s.key)}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover ${
            i === SECTIONS.length - 1 ? '' : 'border-b border-line-row'
          }`}
        >
          <Icon name={s.icon} size={19} color={colors.muted} />
          <Txt className="flex-1 text-body text-fg">{s.label}</Txt>
          <Icon name="chevronRight" size={16} color={colors.faint} />
        </Pressable>
      ))}
    </Group>
  );
}

function ProfileSection() {
  const user = useAuthStore((s) => s.user);
  return (
    <Group>
      <DetailRow label="Name" value={user?.name ?? '—'} mono={false} />
      <DetailRow label="Email" value={user?.email ?? '—'} mono={false} />
      <DetailRow label="Role" value={user?.role ?? '—'} />
      <DetailRow label="Phone" value={(user?.phone as string) ?? '—'} last />
    </Group>
  );
}

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

function AppearanceSection() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <View className="gap-3">
      <Label className="text-muted">Theme</Label>
      <SegmentedControl options={THEME_OPTIONS} value={mode} onChange={setMode} />
      <Txt className="text-caption text-faint">
        System follows your device setting. Truckwys is designed dark-first.
      </Txt>
    </View>
  );
}

function VehicleTypesSection() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray(await fetchData('vehicle-types/')),
    retry: false,
  });
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setBusy(true);
    try {
      await postData({
        url: 'vehicle-types/',
        data: { name: name.trim(), capacity: capacity ? Number(capacity) * 1000 : undefined },
      });
      await qc.invalidateQueries({ queryKey: ['vehicle-types'] });
      setName('');
      setCapacity('');
      toast.success('Vehicle type added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add type');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      {data && data.length > 0 ? (
        <Group>
          {data.map((t, i) => {
            const r = t as Record<string, unknown>;
            const cap = num(pick(r, ['capacity', 'capacity_kg']));
            return (
              <DetailRow
                key={i}
                label={str(pick(r, ['name']), 'Type')}
                value={cap ? `${cap / 1000} t` : '—'}
                last={i === data.length - 1}
              />
            );
          })}
        </Group>
      ) : (
        <EmptyState icon="truck" title="No vehicle types" body="Add the classes you operate." />
      )}
      <Label className="text-muted">Add a type</Label>
      <TextField label="Name" icon="truck" placeholder="e.g. Superlink 30t" value={name} onChangeText={setName} />
      <TextField label="Capacity (tons)" icon="box" keyboardType="numeric" value={capacity} onChangeText={setCapacity} />
      <Button label="Add vehicle type" loading={busy} onPress={add} fullWidth />
    </View>
  );
}

const NOTIF_KEYS = [
  { key: 'quotes', label: 'Quote activity', desc: 'Viewed, accepted or expired quotes' },
  { key: 'loads', label: 'Load updates', desc: 'Status changes on your bookings' },
  { key: 'finance', label: 'Finance', desc: 'Invoices paid and overdue' },
  { key: 'fleet', label: 'Fleet alerts', desc: 'Service due and compliance' },
];

function NotificationsSection() {
  const [state, setState] = useState<Record<string, boolean>>({
    quotes: true,
    loads: true,
    finance: true,
    fleet: false,
  });
  return (
    <Group>
      {NOTIF_KEYS.map((n, i) => (
        <View
          key={n.key}
          className={`flex-row items-center justify-between gap-3 px-4 py-3.5 ${
            i === NOTIF_KEYS.length - 1 ? '' : 'border-b border-line-row'
          }`}
        >
          <View className="flex-1">
            <Txt className="text-callout text-fg">{n.label}</Txt>
            <Txt className="mt-0.5 text-caption text-faint">{n.desc}</Txt>
          </View>
          <Toggle value={!!state[n.key]} onValueChange={(v) => setState((s) => ({ ...s, [n.key]: v }))} />
        </View>
      ))}
    </Group>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next.length < 8) return toast.error('New password must be at least 8 characters');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.success('Password updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };
  const user = useAuthStore((s) => s.user);
  const [twoFa, setTwoFa] = useState(Boolean(user?.two_factor_enabled));
  const { data: sessions } = useSessions();
  const qc = useQueryClient();

  const toggle2fa = async (v: boolean) => {
    setTwoFa(v);
    try {
      await setTwoFactor(v);
      toast.success(v ? 'Two-factor enabled' : 'Two-factor disabled');
    } catch (e) {
      setTwoFa(!v);
      toast.error(e instanceof Error ? e.message : 'Could not update 2FA');
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeSession(id);
      await qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Session revoked');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke');
    }
  };

  return (
    <View className="gap-5">
      <View className="gap-4">
        <TextField label="Current password" secureTextEntry icon="lock" value={current} onChangeText={setCurrent} />
        <TextField label="New password" secureTextEntry icon="lock" value={next} onChangeText={setNext} />
        <Button label="Update password" loading={busy} onPress={submit} fullWidth />
      </View>

      <Group label="Two-factor authentication">
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <View className="flex-1 pr-3">
            <Txt className="text-callout text-fg">Require a login code</Txt>
            <Txt className="mt-0.5 text-caption text-faint">Email OTP on every sign-in</Txt>
          </View>
          <Toggle value={twoFa} onValueChange={toggle2fa} />
        </View>
      </Group>

      {!!sessions?.length && (
        <Group label="Active sessions">
          {sessions.map((s, i) => (
            <View
              key={s.id}
              className={`flex-row items-center justify-between px-4 py-3 ${i === sessions.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <View className="flex-1 pr-3">
                <Txt className="text-callout text-fg" numberOfLines={1}>
                  {s.device}
                </Txt>
                <Mono className="mt-0.5 text-caption text-faint">{s.current ? 'This device' : s.lastSeen}</Mono>
              </View>
              {!s.current && (
                <Pressable hitSlop={8} onPress={() => revoke(s.id)}>
                  <Mono className="text-micro uppercase text-danger">Revoke</Mono>
                </Pressable>
              )}
            </View>
          ))}
        </Group>
      )}
    </View>
  );
}

function CompanySection() {
  const { data } = useCompanyProfile();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    // Populate the form once the profile loads (deferred so it isn't a
    // synchronous setState in the effect body).
    const id = setTimeout(() => {
      setName(str(pick(data, ['name', 'company_name'])));
      setBaseRate(String(pick(data, ['base_rate_per_km', 'base_rate']) ?? ''));
    }, 0);
    return () => clearTimeout(id);
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await updateCompanyProfile({ name, base_rate_per_km: baseRate ? Number(baseRate) : undefined });
      await qc.invalidateQueries({ queryKey: ['company-profile'] });
      toast.success('Company updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update company');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;
    try {
      await updateCompanyLogo({ uri: asset.uri, name: 'logo.jpg', type: 'image/jpeg' });
      await qc.invalidateQueries({ queryKey: ['company-profile'] });
      toast.success('Logo updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload logo');
    }
  };

  return (
    <View className="gap-4">
      <TextField label="Company name" icon="building" value={name} onChangeText={setName} />
      <TextField label="Base rate / km (ZAR)" icon="dollar" keyboardType="numeric" value={baseRate} onChangeText={setBaseRate} />
      <Button label="Upload logo" variant="secondary" icon="download" onPress={uploadLogo} fullWidth />
      <Button label="Save changes" loading={busy} onPress={save} fullWidth />
    </View>
  );
}

const ROLES = ['ADMIN', 'MANAGER', 'OPERATOR', 'DISPATCHER', 'VIEWER'].map((r) => ({ label: r, value: r }));

function UsersSection() {
  const { data } = useUsers();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const invite = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    try {
      await inviteUser(email.trim(), role);
      setEmail('');
      toast.success('Invite sent');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not invite');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id: string, r: string) => {
    try {
      await updateUserRole(id, r);
      await refresh();
      toast.success('Role updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update role');
    }
  };

  const remove = (id: string, name: string) =>
    Alert.alert('Remove user', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeUser(id);
            await refresh();
            toast.success('User removed');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not remove');
          }
        },
      },
    ]);

  return (
    <View className="gap-5">
      <View className="gap-3">
        <Label className="text-muted">Invite a teammate</Label>
        <TextField label="Email" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <SelectField label="Role" icon="shield" options={ROLES} value={role} onSelect={setRole} />
        <Button label="Send invite" loading={busy} onPress={invite} fullWidth />
      </View>

      {!!data?.length && (
        <Group label="Team">
          {data.map((u, i) => (
            <View
              key={u.id}
              className={`flex-row items-center gap-2 px-4 py-3 ${i === data.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <View className="flex-1">
                <Txt className="text-callout text-fg" numberOfLines={1}>
                  {u.name}
                </Txt>
                <Mono className="mt-0.5 text-caption text-faint">{u.role}</Mono>
              </View>
              <View style={{ width: 120 }}>
                <SelectField options={ROLES} value={u.role} onSelect={(r) => changeRole(u.id, r)} />
              </View>
              <IconButton name="x" size={16} accessibilityLabel="Remove user" onPress={() => remove(u.id, u.name)} />
            </View>
          ))}
        </Group>
      )}
    </View>
  );
}

function BillingSection() {
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => fetchData('billing/status/') as Promise<Record<string, unknown>>,
    retry: false,
  });
  return (
    <View className="gap-4">
      <Group>
        <DetailRow label="Plan" value={str(pick(data ?? {}, ['plan', 'subscription_plan']), '—')} mono={false} />
        <DetailRow label="Status" value={str(pick(data ?? {}, ['status', 'subscription_status']), '—')} />
        <DetailRow label="Renews" value={str(pick(data ?? {}, ['renews_at', 'next_billing_date']), '—')} last />
      </Group>
      <Button
        label="Manage on web"
        variant="secondary"
        icon="link"
        onPress={() => WebBrowser.openBrowserAsync('https://app.truckwys.co.za/settings/billing')}
        fullWidth
      />
    </View>
  );
}

function IntegrationsSection() {
  const { data } = useQuery({
    queryKey: ['xero-status'],
    queryFn: () => fetchData('integrations/xero/status/') as Promise<Record<string, unknown>>,
    retry: false,
  });
  const connected = Boolean(pick(data ?? {}, ['connected', 'is_connected']));
  return (
    <View className="gap-4">
      <Group>
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <View>
            <Txt className="text-callout text-fg">Xero</Txt>
            <Txt className="mt-0.5 text-caption text-faint">Accounting sync</Txt>
          </View>
          <Mono className={`text-micro uppercase ${connected ? 'text-success' : 'text-faint'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </Mono>
        </View>
      </Group>
      <Button
        label={connected ? 'Manage on web' : 'Connect on web'}
        variant="secondary"
        icon="link"
        onPress={() => WebBrowser.openBrowserAsync('https://app.truckwys.co.za/settings/integrations/xero')}
        fullWidth
      />
    </View>
  );
}
