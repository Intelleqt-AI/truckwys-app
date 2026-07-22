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
import { fetchData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import {
  useCompanyProfile,
  updateCompanyProfile,
  changePassword,
  updateCompanyLogo,
  useMe,
  updateProfile,
  uploadAvatar,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
  useSessions,
  revokeSession,
  setTwoFactor,
  deleteAccount,
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
      });
      await Promise.all([qc.invalidateQueries({ queryKey: ['me'] }), refreshUser()]);
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
      await Promise.all([qc.invalidateQueries({ queryKey: ['me'] }), refreshUser()]);
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
        <Avatar name={`${firstName} ${lastName}`.trim() || email} uri={avatar || undefined} size={56} />
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

const ACTIVE_OPTIONS = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

function VehicleTypesSection() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray(await fetchData('vehicle-types/')),
    retry: false,
  });
  const list = data ?? [];

  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [activeStr, setActiveStr] = useState('true');
  const [busy, setBusy] = useState(false);

  // Batch-delete selection mode.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCapacity('');
    setBaseRate('');
    setActiveStr('true');
  };

  const loadForEdit = (t: Record<string, unknown>) => {
    setEditingId(pick(t, ['id']) as string | number);
    setName(str(pick(t, ['name'])));
    setDescription(str(pick(t, ['description'])));
    setCapacity(pick(t, ['capacity']) != null ? String(num(pick(t, ['capacity']))) : '');
    setBaseRate(pick(t, ['base_rate']) != null ? String(num(pick(t, ['base_rate']))) : '');
    setActiveStr(pick(t, ['active']) === false ? 'false' : 'true');
  };

  const save = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setBusy(true);
    // capacity is in tons (web stores vehicle-type capacity as tons directly).
    const payload = {
      name: name.trim(),
      description: description.trim(),
      capacity: capacity ? Number(capacity) : 0,
      base_rate: baseRate ? Number(baseRate) : 0,
      active: activeStr === 'true',
    };
    try {
      if (editingId != null) await updateVehicleType(editingId, payload);
      else await createVehicleType(payload);
      await qc.invalidateQueries({ queryKey: ['vehicle-types'] });
      resetForm();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save type');
    } finally {
      setBusy(false);
    }
  };

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
            await qc.invalidateQueries({ queryKey: ['vehicle-types'] });
            if (editingId === tid) resetForm();
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
            await qc.invalidateQueries({ queryKey: ['vehicle-types'] });
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
        {list.length > 0 && (
          <Pressable
            hitSlop={8}
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
      </View>

      {list.length > 0 ? (
        <Group>
          {list.map((t, i) => {
            const r = t as Record<string, unknown>;
            const tid = String(pick(r, ['id']) ?? i);
            const cap = num(pick(r, ['capacity']));
            const isActive = pick(r, ['active']) !== false;
            const isSel = selected.has(tid);
            return (
              <Pressable
                key={tid}
                onPress={() => (selectMode ? toggleSel(tid) : loadForEdit(r))}
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
                  <IconButton name="x" size={16} accessibilityLabel="Delete type" onPress={() => removeOne(r)} />
                )}
              </Pressable>
            );
          })}
        </Group>
      ) : (
        <EmptyState icon="truck" title="No vehicle types" body="Add the classes you operate." />
      )}

      {selectMode ? (
        <Button
          label={selected.size ? `Delete ${selected.size} selected` : 'Select types to delete'}
          variant="danger"
          icon="x"
          loading={busy}
          onPress={batchDelete}
          fullWidth
        />
      ) : (
        <>
          <Label className="text-muted">{editingId != null ? 'Edit type' : 'Add a type'}</Label>
          <TextField label="Name" icon="truck" placeholder="e.g. Superlink 30t" value={name} onChangeText={setName} />
          <TextField label="Description" placeholder="Optional" value={description} onChangeText={setDescription} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField label="Capacity (tons)" placeholder="e.g. 30" icon="box" keyboardType="numeric" value={capacity} onChangeText={setCapacity} />
            </View>
            <View className="flex-1">
              <TextField label="Base rate / km" placeholder="e.g. 25" icon="dollar" keyboardType="numeric" value={baseRate} onChangeText={setBaseRate} />
            </View>
          </View>
          {editingId != null && (
            <SelectField label="Status" options={ACTIVE_OPTIONS} value={activeStr} onSelect={setActiveStr} />
          )}
          <Button label={editingId != null ? 'Save changes' : 'Add vehicle type'} loading={busy} onPress={save} fullWidth />
          {editingId != null && (
            <Button label="Cancel edit" variant="secondary" onPress={resetForm} fullWidth />
          )}
        </>
      )}
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
  const signOutStore = useAuthStore((s) => s.signOut);
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
        <TextField label="Current password" placeholder="Current password" secureTextEntry icon="lock" value={current} onChangeText={setCurrent} />
        <TextField label="New password" placeholder="At least 8 characters" secureTextEntry icon="lock" value={next} onChangeText={setNext} />
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

      <Group label="Danger zone">
        <Pressable
          onPress={() =>
            Alert.alert(
              'Delete account',
              'This permanently deletes your account and data. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      await signOutStore();
                    } catch {
                      toast.info('Contact support@truckwys.co.za to complete account deletion.');
                    }
                  },
                },
              ],
            )
          }
          className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
        >
          <Icon name="x" size={18} color="#FF4949" />
          <Txt className="flex-1 text-body text-danger">Delete account</Txt>
        </Pressable>
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

const INDUSTRY_OPTIONS = [
  { label: 'General freight', value: 'general_freight' },
  { label: 'Refrigerated', value: 'refrigerated' },
  { label: 'Hazmat', value: 'hazmat' },
  { label: 'Construction', value: 'construction' },
  { label: 'Agriculture', value: 'agriculture' },
  { label: 'Other', value: 'other' },
];
const PROVINCE_OPTIONS = ['GP', 'WC', 'KZN', 'EC', 'LP', 'MP', 'NW', 'FS', 'NC'].map((p) => ({ label: p, value: p }));

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
  const [validityDays, setValidityDays] = useState('');
  const [baseRate, setBaseRate] = useState('');

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
    setValidityDays(pick(data, ['default_quote_validity_days']) != null ? String(num(pick(data, ['default_quote_validity_days']))) : '');
    setBaseRate(pick(data, ['base_rate_per_km', 'base_rate']) != null ? String(num(pick(data, ['base_rate_per_km', 'base_rate']))) : '');
    const logo = str(pick(data, ['logo_url']));
    if (logo && !logo.endsWith('/brand/logo.svg')) setLogoUrl(logo);
    setSeeded(true);
  }, [data, seeded]);

  const save = async () => {
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
        default_quote_validity_days: validityDays ? Number(validityDays) : undefined,
        base_rate_per_km: baseRate ? Number(baseRate) : undefined,
      });
      await qc.invalidateQueries({ queryKey: ['company-profile'] });
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update company');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      const out = (await updateCompanyLogo({ uri: asset.uri, name: 'logo.jpg', type: 'image/jpeg' })) as Record<string, unknown>;
      const url = str(pick(out ?? {}, ['logo_url']));
      if (url) setLogoUrl(url);
      await qc.invalidateQueries({ queryKey: ['company-profile'] });
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload logo');
    }
  };

  return (
    <View className="gap-4">
      <Label className="text-muted">Company logo</Label>
      <View className="flex-row items-center gap-3">
        <Avatar name={companyName} uri={logoUrl || undefined} size={56} />
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
      <TextField label="Postal code" keyboardType="numeric" value={postalCode} onChangeText={setPostalCode} />

      <Label className="mt-1 text-muted">Contact</Label>
      <TextField label="Phone" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextField label="Business email" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField label="Support email" autoCapitalize="none" keyboardType="email-address" value={supportEmail} onChangeText={setSupportEmail} />

      <Label className="mt-1 text-muted">Rate & quote defaults</Label>
      <TextField label="Base rate / km (ZAR)" placeholder="e.g. 25" icon="dollar" keyboardType="numeric" value={baseRate} onChangeText={setBaseRate} />
      <TextField label="Quote validity (days)" placeholder="e.g. 7" keyboardType="numeric" value={validityDays} onChangeText={setValidityDays} />

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
