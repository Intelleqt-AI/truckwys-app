import { useEffect, useState } from 'react';
import { View, Pressable, Alert, Modal } from 'react-native';
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
  Avatar,
  Button,
  IconButton,
  Icon,
  Txt,
  Mono,
  Label,
  EmptyState,
  type IconName,
} from '@/components/ui';
import { fetchData, mediaUrl } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { status as statusHues } from '@/theme/tokens';
import { useAuthStore } from '@/stores/authStore';
import { useRole, canAccessSettingsSection } from '@/lib/access';
import { WEB_APP_URL } from '@/lib/legal';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import {
  useCompanyProfile,
  updateCompanyProfile,
  changePassword,
  updateCompanyLogo,
  fetchFuelPrices,
  useMe,
  updateProfile,
  uploadAvatar,
  deleteVehicleType,
  useSessions,
  revokeSession,
  useSecuritySettings,
  updateSecuritySettings,
  useLoginActivity,
  revokeSessions,
  type SecuritySettings,
  deleteAccount,
  useUsers,
  inviteUser,
  updateUserRole,
  removeUser,
  useNotificationPrefs,
  updateNotificationPrefs,
  useBillingStatus,
  useBillingHistory,
  type BillingCharge,
  NOTIFICATION_DEFAULTS,
  type NotificationChannel,
  type NotificationPrefs,
} from './api';
import { formatCurrency, formatDate, formatRelativeTime, parseNum } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { subscriptionStatusDetail, subscriptionStatusLabel } from '@/lib/subscriptionStatus';
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
  { key: 'risk', label: 'Risk-Scoring API', icon: 'shield' },
];

export function SettingsScreen({ route, navigation }: Props) {
  const role = useRole();
  const requested = route.params?.section;
  // Fall back to the menu when this role can't reach the requested section —
  // web redirects to /settings/profile for the same case.
  const section = requested && canAccessSettingsSection(role, requested) ? requested : undefined;
  const current = SECTIONS.find((s) => s.key === section);
  const visibleSections = SECTIONS.filter((s) => canAccessSettingsSection(role, s.key));

  return (
    <SheetScreen
      eyebrow="Settings"
      title={current?.label ?? 'Settings'}
      onBack={() => navigation.goBack()}
    >
      {!section && (
        <SettingsMenu
          sections={visibleSections}
          onOpen={(k) => navigation.push('Settings', { section: k })}
        />
      )}
      {section === 'profile' && <ProfileSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'notifications' && <NotificationsSection />}
      {section === 'security' && <SecuritySection />}
      {section === 'company' && <CompanySection />}
      {section === 'vehicle-types' && <VehicleTypesSection />}
      {section === 'users' && <UsersSection />}
      {section === 'billing' && <BillingSection navigation={navigation} />}
      {section === 'integrations' && <IntegrationsSection />}
      {section === 'risk' && (
        <Txt className="text-callout text-muted">
          {current?.label} is managed on the web dashboard. Configuration here is read-only on mobile.
        </Txt>
      )}
    </SheetScreen>
  );
}

function SettingsMenu({
  sections,
  onOpen,
}: {
  sections: typeof SECTIONS;
  onOpen: (k: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Group>
      {sections.map((s, i) => (
        <Pressable
          key={s.key}
          onPress={() => onOpen(s.key)}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover ${
            i === sections.length - 1 ? '' : 'border-b border-line-row'
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

// Same short lists the web profile offers — deliberately not the full IANA set.
const TIMEZONES = [
  { label: 'South Africa (UTC+2)', value: 'Africa/Johannesburg' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London (UTC+0)', value: 'Europe/London' },
  { label: 'New York (UTC-5)', value: 'America/New_York' },
];
const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Afrikaans', value: 'af' },
  { label: 'Zulu', value: 'zu' },
];
const DATE_FORMATS = [
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
];

function ProfileSection() {
  const { data: me } = useMe();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const qc = useQueryClient();
  const [seeded, setSeeded] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [timezone, setTimezone] = useState('Africa/Johannesburg');
  const [language, setLanguage] = useState('en');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [busy, setBusy] = useState(false);

  // Seed once from auth/me (falls back to the store user).
  useEffect(() => {
    if (seeded) return;
    const src = (me ?? {}) as Record<string, unknown>;
    const fallbackName = str(user?.name);
    setFirstName(str(pick(src, ['first_name'])) || fallbackName.split(' ')[0] || '');
    setLastName(str(pick(src, ['last_name'])) || fallbackName.split(' ').slice(1).join(' ') || '');
    setEmail(str(pick(src, ['email'])) || str(user?.email));
    setJobTitle(str(pick(src, ['job_title'])));
    setPhone(str(pick(src, ['phone'])) || str(user?.phone));
    setAvatar(str(pick(src, ['avatar'])));
    // Same client-side defaults the web profile applies.
    setTimezone(str(pick(src, ['timezone'])) || 'Africa/Johannesburg');
    setLanguage(str(pick(src, ['language'])) || 'en');
    setDateFormat(str(pick(src, ['date_format'])) || 'DD/MM/YYYY');
    if (me) setSeeded(true);
  }, [me, user, seeded]);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        job_title: jobTitle.trim(),
        phone: phone.trim(),
        timezone,
        language,
        date_format: dateFormat,
      });
      await Promise.all([Promise.resolve(invalidateFor(qc, 'user')), refreshUser()]);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const out = await uploadAvatar({ uri: a.uri, name: a.fileName ?? 'avatar.jpg', type: a.mimeType ?? 'image/jpeg' });
      const url = str(pick(out ?? {}, ['avatar']));
      if (url) setAvatar(url);
      await Promise.all([Promise.resolve(invalidateFor(qc, 'user')), refreshUser()]);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Avatar name={`${firstName} ${lastName}`.trim() || email} uri={mediaUrl(avatar)} size={56} />
        <Button label="Change photo" variant="secondary" icon="user" onPress={pickAvatar} />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="First name" placeholder="Jane" autoCapitalize="words" value={firstName} onChangeText={setFirstName} />
        </View>
        <View className="flex-1">
          <TextField label="Last name" placeholder="Dlamini" autoCapitalize="words" value={lastName} onChangeText={setLastName} />
        </View>
      </View>
      <TextField label="Email" placeholder="you@company.co.za" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField label="Job title" placeholder="e.g. Operations Manager" value={jobTitle} onChangeText={setJobTitle} />
      <TextField label="Phone" placeholder="+27 82 123 4567" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      {user?.role ? <DetailRow label="Role" value={user.role} /> : null}

      <Label className="mt-1 text-muted">Preferences</Label>
      <SelectField label="Time zone" icon="clock" options={TIMEZONES} value={timezone} onSelect={setTimezone} />
      <SelectField label="Language" icon="user" options={LANGUAGES} value={language} onSelect={setLanguage} />
      <SelectField label="Date format" icon="calendar" options={DATE_FORMATS} value={dateFormat} onSelect={setDateFormat} />

      <Button label="Save profile" loading={busy} onPress={save} fullWidth />
    </View>
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
  const { nav } = useAppNavigation();
  const { data } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray(await fetchData('vehicle-types/')),
    retry: false,
  });
  const list = data ?? [];
  const [busy, setBusy] = useState(false);

  // Batch-delete selection mode.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const removeOne = (t: Record<string, unknown>) => {
    const tid = pick(t, ['id']) as string | number;
    Alert.alert('Delete vehicle type', `Delete "${str(pick(t, ['name']), 'this type')}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicleType(tid);
            invalidateFor(qc, 'vehicle-type');
            toast.success();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
          }
        },
      },
    ]);
  };

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const batchDelete = () => {
    if (selected.size === 0) return;
    Alert.alert('Delete vehicle types', `Delete ${selected.size} selected type(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Delete ${selected.size}`,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await Promise.all([...selected].map((sid) => deleteVehicleType(sid).catch(() => {})));
            invalidateFor(qc, 'vehicle-type');
            setSelected(new Set());
            setSelectMode(false);
            toast.success();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Label className="text-muted">Vehicle types</Label>
        <View className="flex-row items-center gap-1">
          {list.length > 0 && (
            <Pressable
              hitSlop={8}
              className="px-2"
              onPress={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            >
              <Mono className="text-micro uppercase tracking-wide text-accent">
                {selectMode ? 'Done' : 'Select'}
              </Mono>
            </Pressable>
          )}
          {!selectMode && (
            <IconButton name="plus" accessibilityLabel="Add vehicle type" onPress={() => nav.navigate('AddVehicleType')} />
          )}
        </View>
      </View>

      {list.length > 0 ? (
        <Group>
          {list.map((t, i) => {
            const r = t as Record<string, unknown>;
            const tid = String(pick(r, ['id']) ?? i);
            const cap = num(pick(r, ['capacity']));
            const isActive = pick(r, ['active']) !== false;
            const isSel = selected.has(tid);
            const openEdit = () => nav.navigate('AddVehicleType', { id: pick(r, ['id']) as string | number, preview: r });
            return (
              <Pressable
                key={tid}
                onPress={() => (selectMode ? toggleSel(tid) : openEdit())}
                className={`min-h-[52px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-hover ${
                  i === list.length - 1 ? '' : 'border-b border-line-row'
                }`}
              >
                {selectMode &&
                  (isSel ? (
                    <Icon name="checkCircle" size={20} color="#4D9EFF" />
                  ) : (
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#888888' }} />
                  ))}
                <View className="flex-1">
                  <Txt className="text-body text-fg" numberOfLines={1}>
                    {str(pick(r, ['name']), 'Type')}
                  </Txt>
                  <Mono className="mt-0.5 text-caption text-faint">
                    {cap ? `${cap} t` : '—'} · {isActive ? 'Active' : 'Inactive'}
                  </Mono>
                </View>
                {!selectMode && (
                  <View className="flex-row items-center">
                    <IconButton name="edit" size={16} accessibilityLabel="Edit type" onPress={openEdit} />
                    <IconButton name="x" size={16} accessibilityLabel="Delete type" onPress={() => removeOne(r)} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </Group>
      ) : (
        <EmptyState icon="truck" title="No vehicle types" body="Add the classes you operate." />
      )}

      {selectMode && (
        <Button
          label={selected.size ? `Delete ${selected.size} selected` : 'Select types to delete'}
          variant="danger"
          icon="x"
          loading={busy}
          onPress={batchDelete}
          fullWidth
        />
      )}
    </View>
  );
}

// Labels for the canonical backend schema (see NOTIFICATION_DEFAULTS).
const NOTIF_CHANNELS: {
  channel: NotificationChannel;
  label: string;
  disabled?: boolean;
  keys: { key: string; label: string; desc: string }[];
}[] = [
  {
    channel: 'email',
    label: 'Email',
    keys: [
      { key: 'quotes', label: 'Quote activity', desc: 'Viewed, accepted or expired quotes' },
      { key: 'invoices', label: 'Invoices', desc: 'Issued, due and overdue invoices' },
      { key: 'payments', label: 'Payments', desc: 'Payments received and failed' },
      { key: 'fleet_alerts', label: 'Fleet alerts', desc: 'Service due and compliance' },
      { key: 'weekly_reports', label: 'Weekly reports', desc: 'Monday summary of the week' },
    ],
  },
  {
    channel: 'push',
    label: 'Push',
    keys: [
      { key: 'new_bookings', label: 'New bookings', desc: 'A quote became an active load' },
      { key: 'payment_received', label: 'Payment received', desc: 'An invoice was paid' },
      { key: 'maintenance_due', label: 'Maintenance due', desc: 'A vehicle is due for service' },
      { key: 'driver_updates', label: 'Driver updates', desc: 'Status changes from drivers' },
      { key: 'product_news', label: 'Product news', desc: 'New features and tips from Truckwys' },
    ],
  },
  {
    channel: 'sms',
    label: 'SMS',
    disabled: true,
    keys: [
      { key: 'critical_alerts', label: 'Critical alerts', desc: 'Breakdowns and incidents' },
      { key: 'payment_confirmations', label: 'Payment confirmations', desc: 'Confirmed payments' },
    ],
  },
];

function NotificationsSection() {
  const { data } = useNotificationPrefs();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed once from the server, then edit locally until saved.
  useEffect(() => {
    if (data && !prefs) setPrefs(data);
  }, [data, prefs]);

  const state = prefs ?? NOTIFICATION_DEFAULTS;

  const toggle = (channel: NotificationChannel, key: string, value: boolean) =>
    setPrefs((p) => {
      const base = p ?? NOTIFICATION_DEFAULTS;
      return { ...base, [channel]: { ...base[channel], [key]: value } };
    });

  const save = async () => {
    setBusy(true);
    try {
      await updateNotificationPrefs(state);
      await qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Notification preferences saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save preferences');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      {NOTIF_CHANNELS.map((group) => (
        <Group
          key={group.channel}
          label={group.disabled ? `${group.label} · coming soon` : group.label}
        >
          {group.keys.map((n, i) => (
            <View
              key={n.key}
              className={`flex-row items-center justify-between gap-3 px-4 py-3.5 ${
                i === group.keys.length - 1 ? '' : 'border-b border-line-row'
              }`}
              style={group.disabled ? { opacity: 0.45 } : undefined}
            >
              <View className="flex-1">
                <Txt className="text-callout text-fg">{n.label}</Txt>
                <Txt className="mt-0.5 text-caption text-faint">{n.desc}</Txt>
              </View>
              <Toggle
                value={!!state[group.channel][n.key]}
                onValueChange={(v) => toggle(group.channel, n.key, v)}
                disabled={group.disabled}
              />
            </View>
          ))}
        </Group>
      ))}
      <Button label="Save preferences" loading={busy} onPress={save} fullWidth />
    </View>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next.length < 8) return toast.error('New password must be at least 8 characters');
    // Confirm is client-side only — the endpoint takes current + new.
    if (next !== confirmPw) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirmPw('');
      toast.success('Password updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };
  const signOutStore = useAuthStore((s) => s.signOut);
  const { data: security } = useSecuritySettings();
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const closeDelete = () => {
    setShowDelete(false);
    setDeletePassword('');
  };

  const confirmDelete = async () => {
    if (!deletePassword) return;
    setDeleteBusy(true);
    try {
      await deleteAccount(deletePassword);
      closeDelete();
      // signOut also unregisters this device from push.
      await signOutStore();
    } catch (e) {
      // Surface the real reason (usually a wrong password) rather than
      // deflecting the user to support — Apple 5.1.1(v) requires deletion to
      // actually work in-app.
      toast.error(e instanceof Error ? e.message : 'Could not delete account');
    } finally {
      setDeleteBusy(false);
    }
  };
  const { data: sessions } = useSessions();
  const { data: activity } = useLoginActivity();
  const otherCount = (sessions ?? []).filter((x) => !x.current).length;
  const qc = useQueryClient();

  // One handler for all three preferences. They live in
  // User.security_settings behind auth/security-settings/ — the old code
  // PATCHed auth/me/ with a field that doesn't exist, so nothing persisted.
  const setPref = async (key: keyof SecuritySettings, v: boolean) => {
    try {
      await updateSecuritySettings({ [key]: v });
      invalidateFor(qc, 'security');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update setting');
    }
  };

  const revokeMany = async (scope: 'others' | 'all') => {
    try {
      await revokeSessions(scope);
      if (scope === 'all') {
        // This device's own token is gone — stay signed in and it 401s.
        await signOutStore();
        return;
      }
      invalidateFor(qc, 'security');
      toast.success('Other sessions signed out');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign out sessions');
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
        <TextField label="Current password" placeholder="Current password" secureTextEntry icon="lock" value={current} onChangeText={setCurrent} />
        <TextField label="New password" placeholder="At least 8 characters" secureTextEntry icon="lock" value={next} onChangeText={setNext} />
        <TextField label="Confirm new password" placeholder="Re-enter the new password" secureTextEntry icon="lock" value={confirmPw} onChangeText={setConfirmPw} />
        <Button label="Update password" loading={busy} onPress={submit} fullWidth />
      </View>

      <Group label="Security options">
        <SecurityToggle
          title="Two-factor authentication"
          sub="Require an emailed code on every sign-in"
          value={security?.two_factor ?? true}
          onChange={(v) => setPref('two_factor', v)}
        />
        <SecurityToggle
          title="Session timeout"
          sub="Sign out automatically after 30 minutes of inactivity"
          value={security?.session_timeout ?? true}
          onChange={(v) => setPref('session_timeout', v)}
        />
        <SecurityToggle
          title="Login alerts"
          sub="Email me when a new device signs in"
          value={security?.login_alerts ?? true}
          onChange={(v) => setPref('login_alerts', v)}
          last
        />
      </Group>

      <Group label="Danger zone">
        <Pressable
          onPress={() => setShowDelete(true)}
          className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
        >
          <Icon name="x" size={18} color="#FF4949" />
          <Txt className="flex-1 text-body text-danger">Delete account</Txt>
        </Pressable>
      </Group>

      {/* The endpoint requires the current password, and Alert.alert can't
          collect input — hence a real modal rather than a system dialog. */}
      {showDelete && (
        <Modal visible transparent animationType="fade" onRequestClose={closeDelete}>
          <Pressable
            onPress={closeDelete}
            className="flex-1 items-center justify-center bg-black/65 px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Delete account</Txt>
              <Txt className="mt-1.5 text-sub text-muted">
                This deactivates your account, signs you out of every device, and cannot be undone.
                Enter your password to confirm.
              </Txt>
              <View className="mt-4">
                <TextField
                  label="Password"
                  placeholder="Your current password"
                  secureTextEntry
                  icon="lock"
                  autoCapitalize="none"
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                />
              </View>
              <View className="mt-5 flex-row gap-2.5">
                <View className="flex-1">
                  <Button label="Cancel" variant="secondary" onPress={closeDelete} fullWidth />
                </View>
                <View className="flex-1">
                  <Button
                    label="Delete account"
                    variant="danger"
                    loading={deleteBusy}
                    disabled={!deletePassword}
                    onPress={confirmDelete}
                    fullWidth
                  />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
          <Pressable
            onPress={() =>
              otherCount > 0
                ? Alert.alert(
                    'Sign out other sessions',
                    `Sign out ${otherCount} other device${otherCount === 1 ? '' : 's'}? They'll need to log in again.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sign out', style: 'destructive', onPress: () => revokeMany('others') },
                    ],
                  )
                : Alert.alert(
                    'Sign out all sessions',
                    'This signs out every device, including this one.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sign out', style: 'destructive', onPress: () => revokeMany('all') },
                    ],
                  )
            }
            className="border-t border-line-row px-4 py-3.5 active:bg-surface-hover"
          >
            <Mono className="text-micro uppercase text-danger">
              {otherCount > 0 ? 'Log out other sessions' : 'Log out all sessions'}
            </Mono>
          </Pressable>
        </Group>
      )}

      {!!activity?.length && (
        <Group label="Login activity">
          {activity.map((a, i) => (
            <View
              key={a.id}
              className={`flex-row items-center gap-3 px-4 py-3 ${i === activity.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <View
                className="h-2 w-2 rounded-pill"
                style={{ backgroundColor: ACTIVITY_TONE[a.event] ?? statusHues.info }}
              />
              <View className="flex-1">
                <Txt className="text-caption text-fg">{ACTIVITY_LABEL[a.event] ?? (a.action === 'LOGIN' ? 'Signed in' : 'Signed out')}</Txt>
                <Mono className="mt-0.5 text-micro text-faint" numberOfLines={1}>
                  {[a.device, a.ip, formatRelativeTime(a.time)].filter(Boolean).join(' · ')}
                </Mono>
              </View>
            </View>
          ))}
        </Group>
      )}
    </View>
  );
}

/** One row of the Security options group. */
function SecurityToggle({
  title,
  sub,
  value,
  onChange,
  last,
}: {
  title: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  // Optimistic: the switch should move under the finger, and the shared
  // security-settings query is the source of truth once it refetches.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3.5 ${last ? '' : 'border-b border-line-row'}`}
    >
      <View className="flex-1 pr-3">
        <Txt className="text-callout text-fg">{title}</Txt>
        <Txt className="mt-0.5 text-caption text-faint">{sub}</Txt>
      </View>
      <Toggle
        value={local}
        onValueChange={(v) => {
          setLocal(v);
          onChange(v);
        }}
      />
    </View>
  );
}

// Same labels/tones the web security page uses for the activity feed.
const ACTIVITY_LABEL: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  revoked: 'Session revoked',
  revoked_others: 'Other sessions revoked',
  revoked_all: 'All sessions revoked',
};
const ACTIVITY_TONE: Record<string, string> = {
  login: statusHues.success,
  logout: statusHues.info,
  revoked: statusHues.danger,
  revoked_others: statusHues.danger,
  revoked_all: statusHues.danger,
};

const INDUSTRY_OPTIONS = [
  { label: 'General freight', value: 'general_freight' },
  { label: 'Refrigerated', value: 'refrigerated' },
  { label: 'Hazmat', value: 'hazmat' },
  { label: 'Construction', value: 'construction' },
  { label: 'Agriculture', value: 'agriculture' },
  { label: 'Other', value: 'other' },
];
const PROVINCE_OPTIONS = ['GP', 'WC', 'KZN', 'EC', 'LP', 'MP', 'NW', 'FS', 'NC'].map((p) => ({ label: p, value: p }));
// The backend's factory default for Company.fuel_price_per_litre. Used both as
// the blank-box fallback on save and to recognise an untouched diesel price when
// the live feed offers a fresher one — those two uses must stay in step, or the
// "don't overwrite a deliberate price" guard inverts.
const DIESEL_DEFAULT_PRICE = 23.5;

function CompanySection() {
  const { data } = useCompanyProfile();
  const qc = useQueryClient();
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('general_freight');
  const [regNumber, setRegNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('GP');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  // Quote defaults — all consumed by the quote calculator.
  const [validityDays, setValidityDays] = useState('');
  const [allowCrossBorder, setAllowCrossBorder] = useState('yes');
  const [baseRate, setBaseRate] = useState('');
  const [tollRate, setTollRate] = useState('');
  const [slaHours, setSlaHours] = useState('');
  const [surchargeThreshold, setSurchargeThreshold] = useState('');
  const [surchargePct, setSurchargePct] = useState('');
  // One default price per fuel type. Diesel keeps the legacy field name
  // (fuel_price_per_litre) because it predates the other three, and it's the
  // only one the column can't hold NULL for.
  const [fuelPrice, setFuelPrice] = useState('');
  const [fuelPetrol, setFuelPetrol] = useState('');
  const [fuelElectric, setFuelElectric] = useState('');
  const [fuelHybrid, setFuelHybrid] = useState('');
  const [livePrice, setLivePrice] = useState<Record<string, unknown> | null>(null);
  const [fetchingLive, setFetchingLive] = useState(false);

  useEffect(() => {
    if (seeded || !data) return;
    const addr = (pick(data, ['address']) ?? {}) as Record<string, unknown>;
    const contact = (pick(data, ['contact']) ?? {}) as Record<string, unknown>;
    setCompanyName(str(pick(data, ['company_name', 'name'])));
    setIndustry(str(pick(data, ['industry']), 'general_freight'));
    setRegNumber(str(pick(data, ['registration_number'])));
    setVatNumber(str(pick(data, ['vat_number'])));
    setWebsite(str(pick(data, ['website'])));
    setDescription(str(pick(data, ['description'])));
    setStreet(str(pick(addr, ['street'])));
    setCity(str(pick(addr, ['city'])));
    setProvince(str(pick(addr, ['province']), 'GP'));
    setPostalCode(str(pick(addr, ['postal_code'])));
    setPhone(str(pick(contact, ['phone'])));
    setEmail(str(pick(contact, ['email'])));
    setSupportEmail(str(pick(contact, ['support_email'])));
    // Numeric fields stay blank when unset, so an empty box never means "0".
    const seedNum = (keys: string[], set: (v: string) => void) => {
      const raw = pick(data, keys);
      if (raw != null) set(String(num(raw)));
    };
    seedNum(['default_quote_validity_days'], setValidityDays);
    // Web reads default_base_rate_per_km; older records used base_rate_per_km.
    seedNum(['default_base_rate_per_km', 'base_rate_per_km', 'base_rate'], setBaseRate);
    seedNum(['default_toll_rate_per_km'], setTollRate);
    seedNum(['fuel_price_per_litre'], setFuelPrice);
    seedNum(['fuel_price_petrol'], setFuelPetrol);
    seedNum(['fuel_price_electric'], setFuelElectric);
    seedNum(['fuel_price_hybrid'], setFuelHybrid);
    seedNum(['default_sla_hours'], setSlaHours);
    seedNum(['weight_surcharge_threshold_kg'], setSurchargeThreshold);
    seedNum(['weight_surcharge_pct'], setSurchargePct);
    setAllowCrossBorder(pick(data, ['allow_cross_border']) === false ? 'no' : 'yes');
    const logo = str(pick(data, ['logo_url']));
    if (logo && !logo.endsWith('/brand/logo.svg')) setLogoUrl(logo);
    setSeeded(true);
  }, [data, seeded]);

  const save = async () => {
    // Every numeric box is validated through parseNum first. The old guards
    // compared Number(v) against bounds, and BOTH sides of a comparison are
    // false for NaN — so a comma value passed every check and NaN went to the
    // API, which is not a JSON number at all.
    const numericFields: [string, string][] = [
      ['Quote validity', validityDays],
      ['Weight surcharge', surchargePct],
      ['Weight surcharge threshold', surchargeThreshold],
      ['Base rate / km', baseRate],
      ['Toll rate / km', tollRate],
      ['Diesel price', fuelPrice],
      ['Petrol price', fuelPetrol],
      ['Electric price', fuelElectric],
      ['Hybrid price', fuelHybrid],
      ['SLA hours', slaHours],
    ];
    for (const [label, v] of numericFields) {
      if (v.trim() && parseNum(v) == null) return toast.error(`${label} is not a number`);
    }

    // Same bounds the web company page enforces.
    const validityNum = parseNum(validityDays);
    if (validityNum != null && (validityNum < 1 || validityNum > 365)) {
      return toast.error('Quote validity must be between 1 and 365 days');
    }
    const surchargeNum = parseNum(surchargePct);
    if (surchargeNum != null && (surchargeNum < 0 || surchargeNum > 100)) {
      return toast.error('Weight surcharge must be between 0 and 100%');
    }
    for (const [label, v] of numericFields) {
      const n = parseNum(v);
      if (n != null && n < 0) return toast.error(`${label} can't be negative`);
    }

    // Only send a numeric field when it has a value — an empty box must leave
    // the stored default alone rather than zeroing it.
    const optionalNum = (v: string) => (v.trim() ? (parseNum(v) ?? undefined) : undefined);
    // For the nullable per-fuel-type prices, blank has to mean "clear it", which
    // needs an explicit null: optionalNum omits the key entirely, so a price
    // could be set but never removed.
    const clearableNum = (v: string) => (v.trim() ? (parseNum(v) ?? null) : null);

    setBusy(true);
    try {
      await updateCompanyProfile({
        company_name: companyName.trim(),
        name: companyName.trim(),
        industry,
        registration_number: regNumber.trim(),
        vat_number: vatNumber.trim(),
        website: website.trim(),
        description: description.trim(),
        address: { street: street.trim(), city: city.trim(), province, postal_code: postalCode.trim(), country: 'South Africa' },
        contact: { phone: phone.trim(), email: email.trim(), support_email: supportEmail.trim() },
        allow_cross_border: allowCrossBorder === 'yes',
        default_quote_validity_days: optionalNum(validityDays),
        default_base_rate_per_km: optionalNum(baseRate),
        default_toll_rate_per_km: optionalNum(tollRate),
        // Diesel is NOT NULL with a 23.50 factory default, so a blank box falls
        // back to that rather than clearing — matching the web page.
        fuel_price_per_litre: optionalNum(fuelPrice) ?? DIESEL_DEFAULT_PRICE,
        fuel_price_petrol: clearableNum(fuelPetrol),
        fuel_price_electric: clearableNum(fuelElectric),
        fuel_price_hybrid: clearableNum(fuelHybrid),
        default_sla_hours: optionalNum(slaHours),
        weight_surcharge_threshold_kg: optionalNum(surchargeThreshold),
        weight_surcharge_pct: optionalNum(surchargePct),
      });
      invalidateFor(qc, 'company');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update company');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pull the live national prices into the form (not saved until Save changes).
   *
   * One action rather than web's two: the endpoint returns diesel and petrol in
   * a single response, and web wires a FETCH NOW button next to each that both
   * call the same handler — so pressing the petrol one silently rewrites diesel
   * too. One button that says it fills both is the honest version.
   *
   * There is no live feed for electric or hybrid anywhere in the system, so those
   * two stay manual.
   */
  const loadLivePrice = async (manual: boolean) => {
    if (manual) setFetchingLive(true);
    try {
      const d = (await fetchFuelPrices(manual)) as Record<string, unknown>;
      setLivePrice(d);
      if (pick(d, ['success']) === false) {
        if (manual) toast.error(str(pick(d, ['error']), 'Could not fetch live fuel prices'));
        return;
      }
      const diesel = pick(d, ['inland_price']);
      if (diesel != null) {
        // On the silent load, only fill what still looks untouched — blank, or
        // still sitting on the factory default. A manual fetch is an explicit
        // request, so it always wins. Never quietly overwrite a real price.
        setFuelPrice((prev) => {
          const n = parseNum(prev);
          const untouched = !prev.trim() || (n != null && Math.abs(n - DIESEL_DEFAULT_PRICE) < 0.001);
          return manual || untouched ? String(num(diesel)) : prev;
        });
      }
      // petrol_95 comes back as 0 (not null) when there's no data — writing that
      // would store a zero price.
      const petrol = num(pick(d, ['petrol_95']));
      if (petrol > 0) setFuelPetrol((prev) => (manual || !prev.trim() ? String(petrol) : prev));
      if (manual) toast.success('Fuel prices refreshed');
    } catch (e) {
      // The endpoint 500s rather than degrading to a 200, so this path is real.
      if (manual) toast.error(e instanceof Error ? e.message : 'Could not fetch live fuel prices');
    } finally {
      if (manual) setFetchingLive(false);
    }
  };

  // Chained off the profile load, not parallel: the guard above reads the
  // current diesel value to decide whether it looks untouched, so the saved
  // value has to be in state first.
  useEffect(() => {
    if (!seeded) return;
    void loadLivePrice(false);
  }, [seeded]);

  // Read-out under the fields: what the live feed last said, and whether it's old.
  const liveStale = pick(livePrice ?? {}, ['is_stale']) === true;
  const liveDiesel = num(pick(livePrice ?? {}, ['inland_price']));
  const liveNote = (() => {
    if (!livePrice || pick(livePrice, ['success']) === false || liveDiesel <= 0) return '';
    const updated = str(pick(livePrice, ['last_updated']));
    const warning = str(pick(livePrice, ['stale_warning']));
    const parts = [`Live national diesel ${formatCurrency(liveDiesel)}/L`];
    if (updated) parts.push(`updated ${formatDate(updated)}`);
    if (warning) parts.push(warning);
    return parts.join(' · ');
  })();

  const uploadLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      const out = (await updateCompanyLogo({ uri: asset.uri, name: 'logo.jpg', type: 'image/jpeg' })) as Record<string, unknown>;
      const url = str(pick(out ?? {}, ['logo_url']));
      if (url) setLogoUrl(url);
      invalidateFor(qc, 'company');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload logo');
    }
  };

  return (
    <View className="gap-4">
      <Label className="text-muted">Company logo</Label>
      <View className="flex-row items-center gap-3">
        <Avatar name={companyName} uri={mediaUrl(logoUrl)} size={56} />
        <Button label="Upload logo" variant="secondary" icon="download" onPress={uploadLogo} />
      </View>

      <Label className="mt-1 text-muted">Business information</Label>
      <TextField label="Company name" placeholder="Your company" icon="building" value={companyName} onChangeText={setCompanyName} />
      <SelectField label="Industry" options={INDUSTRY_OPTIONS} value={industry} onSelect={setIndustry} />
      <TextField label="Registration number" placeholder="YYYY/XXXXXX/XX" value={regNumber} onChangeText={setRegNumber} />
      <TextField label="VAT number" placeholder="4XXXXXXXXX" value={vatNumber} onChangeText={setVatNumber} />
      <TextField label="Website" placeholder="https://" autoCapitalize="none" keyboardType="url" value={website} onChangeText={setWebsite} />
      <TextField label="Description" placeholder="What your company does" value={description} onChangeText={setDescription} multiline />

      <Label className="mt-1 text-muted">Business address</Label>
      <TextField label="Street address" value={street} onChangeText={setStreet} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="City" value={city} onChangeText={setCity} />
        </View>
        <View className="flex-1">
          <SelectField label="Province" options={PROVINCE_OPTIONS} value={province} onSelect={setProvince} />
        </View>
      </View>
      <TextField label="Postal code" keyboardType="number-pad" value={postalCode} onChangeText={setPostalCode} />

      <Label className="mt-1 text-muted">Contact</Label>
      <TextField label="Phone" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextField label="Business email" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField label="Support email" autoCapitalize="none" keyboardType="email-address" value={supportEmail} onChangeText={setSupportEmail} />

      <Label className="mt-1 text-muted">Quote defaults</Label>
      <SelectField
        label="Cross-border routes"
        options={[
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ]}
        value={allowCrossBorder}
        onSelect={setAllowCrossBorder}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Whether your fleet is set up to run loads that cross into neighbouring countries. Set to
        &quot;No&quot; and any quote whose route actually crosses a border is refused rather than priced.
      </Txt>
      <TextField label="Quote validity (days)" placeholder="e.g. 7" keyboardType="number-pad" value={validityDays} onChangeText={setValidityDays} />
      <TextField label="Base rate / km" prefix="R" placeholder="e.g. 25" keyboardType="decimal-pad" value={baseRate} onChangeText={setBaseRate} />
      <TextField label="Toll rate / km" prefix="R" placeholder="e.g. 0,95" keyboardType="decimal-pad" value={tollRate} onChangeText={setTollRate} />
      <Txt className="-mt-1 text-caption text-faint">
        Fallback only — used when the routing service can&apos;t itemise toll plazas.
      </Txt>
      <TextField label="Default SLA (hours)" placeholder="e.g. 48" icon="clock" keyboardType="number-pad" value={slaHours} onChangeText={setSlaHours} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="Surcharge over (kg)" placeholder="e.g. 5 000" keyboardType="number-pad" numeric value={surchargeThreshold} onChangeText={setSurchargeThreshold} />
        </View>
        <View className="flex-1">
          <TextField label="Surcharge (%)" placeholder="e.g. 15" keyboardType="decimal-pad" value={surchargePct} onChangeText={setSurchargePct} />
        </View>
      </View>

      {/* ── Fuel price defaults ───────────────────────────────────────────── */}
      <View className="mt-1 flex-row items-center justify-between">
        <Label className="text-muted">Fuel price defaults</Label>
        <Pressable
          onPress={() => loadLivePrice(true)}
          disabled={fetchingLive}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Fetch live fuel prices"
          className="active:opacity-50"
        >
          <Mono className={`text-micro tracking-wide uppercase ${fetchingLive ? 'text-faint' : 'text-accent'}`}>
            {fetchingLive ? 'Fetching…' : 'Fetch live'}
          </Mono>
        </Pressable>
      </View>
      <Txt className="-mt-2 text-caption text-faint">
        Used when a vehicle type of that fuel runs a quote. Diesel and petrol can
        be pulled from the live national price; electric and hybrid have no feed,
        so set those yourself.
      </Txt>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="Diesel (R/L)" prefix="R" placeholder="e.g. 23,50" keyboardType="decimal-pad" value={fuelPrice} onChangeText={setFuelPrice} />
        </View>
        <View className="flex-1">
          <TextField label="Petrol (R/L)" prefix="R" placeholder="Not set" keyboardType="decimal-pad" value={fuelPetrol} onChangeText={setFuelPetrol} />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="Electric (R/kWh)" prefix="R" placeholder="Not set" keyboardType="decimal-pad" value={fuelElectric} onChangeText={setFuelElectric} />
        </View>
        <View className="flex-1">
          <TextField label="Hybrid (R/L)" prefix="R" placeholder="Not set" keyboardType="decimal-pad" value={fuelHybrid} onChangeText={setFuelHybrid} />
        </View>
      </View>
      {liveNote && (
        <Txt className={`-mt-1 text-caption ${liveStale ? 'text-warning' : 'text-faint'}`}>{liveNote}</Txt>
      )}

      <Button label="Save changes" loading={busy} onPress={save} fullWidth />
    </View>
  );
}

// Web's six. CUSTOMER and PARTNER exist on the model but neither client
// exposes them for staff invites.
const ROLES = ['ADMIN', 'MANAGER', 'OPERATOR', 'DISPATCHER', 'VIEWER', 'DRIVER'].map((r) => ({
  label: r,
  value: r,
}));

function UsersSection() {
  const { data } = useUsers();
  const meId = useAuthStore((st) => st.user?.id);
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [busy, setBusy] = useState(false);
  const refresh = () => invalidateFor(qc, 'user');

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
        <TextField label="Email" placeholder="colleague@company.co.za" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
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
              {/* The backend refuses a self role-change ("You cannot change
                  your own role"), so don't offer the control. */}
              {String(u.id) === String(meId) ? (
                <Mono className="text-micro uppercase text-faint">You</Mono>
              ) : (
                <>
                  <View style={{ width: 120 }}>
                    <SelectField options={ROLES} value={u.role} onSelect={(r) => changeRole(u.id, r)} />
                  </View>
                  <IconButton name="x" size={16} accessibilityLabel="Remove user" onPress={() => remove(u.id, u.name)} />
                </>
              )}
            </View>
          ))}
        </Group>
      )}
    </View>
  );
}

// Live countdown to the next charge, mirroring the web billing page. Reads
// next_billing_at (a datetime) rather than next_billing_date (a date), which is
// why the API exposes both.
function useNextPaymentLabel(nextBillingAt: string): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!nextBillingAt) {
      setLabel('');
      return;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      const diff = new Date(nextBillingAt).getTime() - Date.now();
      if (Number.isNaN(diff)) return setLabel('');
      if (diff <= 0) return setLabel('Payment processing…');
      const s = Math.floor(diff / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (diff < 48 * 3600 * 1000) {
        return setLabel(
          h >= 1
            ? `Next payment in ${h}:${pad(m)}:${pad(s % 60)}`
            : `Next payment in ${pad(m)}:${pad(s % 60)}`,
        );
      }
      setLabel(`Next payment in ${Math.ceil(diff / 86400000)} days`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextBillingAt]);
  return label;
}

const CHARGE_TONE = (status: string) =>
  status === 'complete' ? statusHues.success : status === 'pending' ? statusHues.warning : statusHues.danger;

/** One charge row, shared by the preview and the full-history screen. */
function ChargeRow({ c, last }: { c: BillingCharge; last?: boolean }) {
  return (
    <View className={`px-4 py-3 ${last ? '' : 'border-b border-line-row'}`}>
      <View className="flex-row items-center justify-between">
        <Txt className="flex-1 pr-3 text-caption text-fg" numberOfLines={1}>
          {c.label}
        </Txt>
        <Mono className="text-caption text-fg">{formatCurrency(c.amount)}</Mono>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        <Mono className="text-micro text-faint">
          {[c.createdAt ? formatDate(c.createdAt) : '', c.reference].filter(Boolean).join(' · ')}
        </Mono>
        <Mono className="text-micro uppercase" style={{ color: CHARGE_TONE(c.status) }}>
          {c.status}
        </Mono>
      </View>
    </View>
  );
}

// Read-only by design: no purchase path lives in the app. Selling a
// subscription outside Apple's in-app purchase system is guideline 3.1.1, and
// it's the same reason there's no sign-up here — so this shows everything the
// web page shows but sends people there to actually change the plan.
function BillingSection({ navigation }: { navigation: Props['navigation'] }) {
  const { data } = useBillingStatus();
  const { data: history } = useBillingHistory();
  const d = data ?? {};
  const flatPlan = (pick(d, ['flat_plan']) ?? {}) as Record<string, unknown>;
  const card = (pick(d, ['card']) ?? {}) as Record<string, unknown>;
  const grace = (pick(d, ['grace']) ?? {}) as Record<string, unknown>;

  const planLabel =
    str(pick(flatPlan, ['label'])) || str(pick(d, ['plan', 'subscription_plan']), '—');
  const status = str(pick(d, ['status', 'subscription_status']), '—');
  const amount = num(pick(d, ['amount'])) || num(pick(flatPlan, ['amount']));
  const last4 = str(pick(card, ['last4']));
  const cardType = str(pick(card, ['card_type']));
  const suspended = Boolean(pick(d, ['suspended']));
  // cancel_at_period_end (backend migration 0096): the subscription is winding
  // down but access continues to the end of the paid period, so this is not a
  // blocked state and must not read like one.
  const cancelling = Boolean(pick(d, ['cancel_at_period_end']));
  const subEnd = str(pick(d, ['subscription_end']));
  const graceDays = num(pick(grace, ['days_remaining']));
  const graceExpires = str(pick(grace, ['grace_period_expires_at']));
  const nextBillingDate = str(pick(d, ['next_billing_date']));
  const takeRate = num(pick(flatPlan, ['take_rate_pct']));
  const countdown = useNextPaymentLabel(str(pick(d, ['next_billing_at'])));

  return (
    <View className="gap-4">
      {suspended && (
        <View className="flex-row items-start gap-2.5 rounded-xs border border-danger bg-danger-bg p-3">
          <Icon name="alert" size={17} color="#FF4949" />
          <Txt className="flex-1 text-sub text-muted">
            Your subscription is suspended. You can still view existing data and manage drivers and
            vehicles, but new quotes and invoices are blocked until payment is settled.
          </Txt>
        </View>
      )}
      {!suspended && cancelling && (
        <View className="flex-row items-start gap-2.5 rounded-xs border border-warning bg-warning-bg p-3">
          <Icon name="alert" size={17} color="#F59E0B" />
          <Txt className="flex-1 text-sub text-muted">
            Cancelling
            {subEnd ? ` — access continues until ${formatDate(subEnd)}` : ''}. Quoting and invoicing
            keep working until then.
          </Txt>
        </View>
      )}
      {!suspended && !cancelling && graceDays > 0 && (
        <View className="flex-row items-start gap-2.5 rounded-xs border border-warning bg-warning-bg p-3">
          <Icon name="alert" size={17} color="#F59E0B" />
          <Txt className="flex-1 text-sub text-muted">
            Payment is overdue — {graceDays} day{graceDays === 1 ? '' : 's'} of grace remaining
            {graceExpires ? ` (until ${formatDate(graceExpires)})` : ''}.
          </Txt>
        </View>
      )}

      <Txt className="text-caption text-faint">{subscriptionStatusDetail(status)}</Txt>

      <Group>
        <DetailRow label="Plan" value={planLabel} mono={false} />
        <DetailRow label="Status" value={subscriptionStatusLabel(status)} />
        {amount > 0 ? <DetailRow label="Amount" value={formatCurrency(amount)} /> : null}
        {last4 ? (
          <DetailRow label="Card" value={`${cardType || 'Card'} •••• ${last4}`} mono={false} />
        ) : null}
        {/* Was reading `renews_at`, which this endpoint never returns — the
            row was permanently blank. */}
        <DetailRow label="Renews" value={nextBillingDate ? formatDate(nextBillingDate) : '—'} last />
      </Group>

      {!!countdown && (
        <Mono className="text-caption text-accent" style={{ fontVariant: ['tabular-nums'] }}>
          {countdown}
        </Mono>
      )}

      {takeRate > 0 && (
        <Txt className="text-caption text-muted">
          Every delivered load is also charged {takeRate}% of its invoice value to this card, on top
          of the monthly fee.
        </Txt>
      )}

      {!!history?.length && (
        <>
          <Group label="Recent charges">
            {history.slice(0, 5).map((c, i) => (
              <ChargeRow key={c.id} c={c} last={i === Math.min(history.length, 5) - 1} />
            ))}
          </Group>
          <Button
            label="Full billing history"
            variant="secondary"
            icon="receipt"
            onPress={() => navigation.navigate('BillingHistory')}
            fullWidth
          />
        </>
      )}

      <Txt className="text-caption text-faint">
        Subscriptions and payment methods are managed on the web dashboard.
      </Txt>
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
        onPress={() => WebBrowser.openBrowserAsync(`${WEB_APP_URL}/settings/integrations/xero`)}
        fullWidth
      />
    </View>
  );
}
