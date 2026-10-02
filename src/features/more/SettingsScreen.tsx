import { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, Alert, Modal, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
  StatCard,
  Badge,
  Banner,
  SwipeRow,
  SelectionDot,
  type IconName,
} from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { fetchData, mediaUrl } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { useAuthStore } from '@/stores/authStore';
import { useRole, canAccessSettingsSection, canSeeInsights, visibleTabs } from '@/lib/access';
import { INDUSTRY_OPTIONS } from '@/lib/companyOptions';
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
import { normalizeVehicleType } from '@/features/bookings/api';
import { vehicleTypeDeleteCopy } from './validation';
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  parseNum,
  roundTo,
  decimalMax,
} from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { subscriptionStatusDetail, subscriptionStatusLabel } from '@/lib/subscriptionStatus';
import { useDemo } from '@/hooks/useDemo';
import { DEMO_UNAVAILABLE_MESSAGE } from '@/lib/demoStatus';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Settings'>;

const SECTIONS: { key: string; label: string; icon: IconName }[] = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'appearance', label: 'Appearance', icon: 'eye' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'security', label: 'Security', icon: 'lock' },
  { key: 'company', label: 'Company details', icon: 'building' },
  { key: 'vehicle-types', label: 'Vehicle types', icon: 'truck' },
  { key: 'users', label: 'Users and permissions', icon: 'users' },
  { key: 'billing', label: 'Billing', icon: 'card' },
  { key: 'integrations', label: 'Integrations', icon: 'plug' },
  { key: 'risk', label: 'Payment risk API', icon: 'shield' },
];

export function SettingsScreen({ route, navigation }: Props) {
  const role = useRole();
  const { goTab } = useAppNavigation();
  const requested = route.params?.section;
  // Fall back to the menu when this role can't reach the requested section —
  // web redirects to /settings/profile for the same case.
  const section = requested && canAccessSettingsSection(role, requested) ? requested : undefined;
  const current = SECTIONS.find((s) => s.key === section);
  const visibleSections = SECTIONS.filter((s) => canAccessSettingsSection(role, s.key));

  return (
    <SheetScreen
      title={current?.label ?? 'Settings'}
      onBack={() => navigation.goBack()}
    >
      {!section && (
        <>
          <SettingsMenu
            sections={visibleSections}
            onOpen={(k) => navigation.push('Settings', { section: k })}
          />
          {/* Same Customers/Fleet screens the Customers tab and More menu
              already open — each already has Import and Select (bulk
              delete), so this is a second door in, not a second list. */}
          <DirectorySection
            canOpenCustomers={canSeeInsights(role)}
            canOpenVehicles={visibleTabs(role).includes('Fleet')}
            onOpenCustomers={() => navigation.navigate('Customers')}
            onOpenVehicles={() => goTab('Fleet', { tab: 'vehicles' })}
          />
        </>
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
          {current?.label} is managed on the web dashboard. Configuration here is read-only on
          mobile.
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
        <TouchableOpacity
          key={s.key}
          onPress={() => onOpen(s.key)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${
            i === sections.length - 1 ? '' : 'border-b border-line-row'
          }`}
        >
          <Icon name={s.icon} size={19} color={colors.muted} />
          <Txt className="flex-1 text-body text-fg">{s.label}</Txt>
          <Icon name="chevronRight" size={16} color={colors.faint} />
        </TouchableOpacity>
      ))}
    </Group>
  );
}

function DirectorySection({
  canOpenCustomers,
  canOpenVehicles,
  onOpenCustomers,
  onOpenVehicles,
}: {
  canOpenCustomers: boolean;
  canOpenVehicles: boolean;
  onOpenCustomers: () => void;
  onOpenVehicles: () => void;
}) {
  const { colors } = useTheme();
  const rows: { key: string; icon: IconName; label: string; onPress: () => void }[] = [];
  if (canOpenCustomers) rows.push({ key: 'customers', icon: 'users', label: 'Customers', onPress: onOpenCustomers });
  if (canOpenVehicles) rows.push({ key: 'vehicles', icon: 'truck', label: 'Vehicles', onPress: onOpenVehicles });
  if (!rows.length) return null;
  return (
    <Group label="Directory">
      {rows.map((r, i) => (
        <TouchableOpacity
          key={r.key}
          onPress={r.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={r.label}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${
            i === rows.length - 1 ? '' : 'border-b border-line-row'
          }`}
        >
          <Icon name={r.icon} size={19} color={colors.muted} />
          <Txt className="flex-1 text-body text-fg">{r.label}</Txt>
          <Icon name="chevronRight" size={16} color={colors.faint} />
        </TouchableOpacity>
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

// Swaps the icon+label for a spinner+"Uploading" while an image upload is in
// flight, then reverts — Button's own `loading` state just blanks to a bare
// spinner, which reads as "did this button die?" for a multi-second upload.
function UploadButton({
  label,
  icon,
  uploading,
  onPress,
}: {
  label: string;
  icon: IconName;
  uploading: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (uploading) {
    return (
      <View className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-control border border-line-active bg-surface px-4">
        <ActivityIndicator size="small" color={colors.fg} />
        <Mono className="text-callout font-medium text-fg">Uploading</Mono>
      </View>
    );
  }
  return <Button label={label} variant="secondary" icon={icon} onPress={onPress} />;
}

function ProfileSection() {
  const { data: me } = useMe();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const qc = useQueryClient();
  const demo = useDemo();
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
    if (demo.block()) return;
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
    if (demo.block()) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const out = await uploadAvatar({
        uri: a.uri,
        name: a.fileName ?? 'avatar.jpg',
        type: a.mimeType ?? 'image/jpeg',
      });
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
        <Avatar
          name={`${firstName} ${lastName}`.trim() || email}
          uri={mediaUrl(avatar)}
          size={56}
        />
        <UploadButton label="Change photo" icon="user" uploading={busy} onPress={pickAvatar} />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="First name"
            placeholder="Jane"
            autoCapitalize="words"
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>
        <View className="flex-1">
          <TextField
            label="Last name"
            placeholder="Dlamini"
            autoCapitalize="words"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
      </View>
      <TextField
        label="Email"
        placeholder="you@company.co.za"
        icon="send"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Job title"
        placeholder="e.g. Operations Manager"
        value={jobTitle}
        onChangeText={setJobTitle}
      />
      <TextField
        label="Phone"
        placeholder="+27 82 123 4567"
        icon="phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {user?.role ? <DetailRow label="Role" value={user.role} /> : null}

      <Label className="mt-1 text-muted">Preferences</Label>
      <SelectField
        label="Time zone"
        icon="clock"
        options={TIMEZONES}
        value={timezone}
        onSelect={setTimezone}
      />
      <SelectField
        label="Language"
        icon="user"
        options={LANGUAGES}
        value={language}
        onSelect={setLanguage}
      />
      <SelectField
        label="Date format"
        icon="calendar"
        options={DATE_FORMATS}
        value={dateFormat}
        onSelect={setDateFormat}
      />

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
  const { colors } = useTheme();
  const { nav } = useAppNavigation();
  const demo = useDemo();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vehicle-types'],
    // Shares its query key with bookings/api.ts's useVehicleTypes and
    // fleet/api.ts's useVehicleTypesList — must normalize identically, see
    // normalizeVehicleType's comment.
    queryFn: async () => asArray(await fetchData('vehicle-types/')).map(normalizeVehicleType),
    retry: false,
  });
  // Memoised so `sorted`/`activeCount` below don't re-derive on every render
  // — `data ?? []` would otherwise hand them a fresh empty-array identity
  // whenever `data` is undefined.
  const list = useMemo(() => data ?? [], [data]);
  const [busy, setBusy] = useState(false);

  // Batch-delete selection mode.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Ids currently mid swipe-delete — lets that one row show a spinner
  // instead of leaving the tap-Delete-confirm-then-silence gap unexplained.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Active types first, then alphabetical — the API gives no guaranteed
  // order, and the ones you actually quote against should sort to the top.
  const sorted = useMemo(
    () =>
      [...list].sort((a, b) => {
        const ra = a as unknown as Record<string, unknown>;
        const rb = b as unknown as Record<string, unknown>;
        const activeA = pick(ra, ['active']) !== false;
        const activeB = pick(rb, ['active']) !== false;
        if (activeA !== activeB) return activeA ? -1 : 1;
        return str(pick(ra, ['name'])).localeCompare(str(pick(rb, ['name'])));
      }),
    [list],
  );
  const activeCount = useMemo(
    () =>
      list.filter((t) => pick(t as unknown as Record<string, unknown>, ['active']) !== false)
        .length,
    [list],
  );

  // isOverride: this row is a company-owned copy-on-write clone of a shared
  // (company=null) default (see normalizeVehicleType's comment). Deleting it
  // is a "Reset" — the backend's own perform_destroy treats it as a plain
  // delete, and the shared default reappears in the list once the refetch
  // lands, since visible_vehicle_types_queryset only hides a shared row while
  // this company has an override of the same name.
  const removeOne = (t: Record<string, unknown>, tid: string, isOverride = false) => {
    if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
    const rawId = pick(t, ['id']) as string | number;
    const name = str(pick(t, ['name']), 'this type');
    const copy = vehicleTypeDeleteCopy(name, isOverride);
    Alert.alert(copy.title, copy.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: copy.confirmLabel,
        style: 'destructive',
        onPress: async () => {
          setDeletingIds((prev) => new Set(prev).add(tid));
          try {
            await deleteVehicleType(rawId);
            invalidateFor(qc, 'vehicle-type');
            toast.success();
            // Left in `deletingIds` on success — the invalidate above drops
            // this row from the list entirely once the refetch lands, so
            // there's nothing to revert and no flash back to a normal row.
          } catch (e) {
            toast.error(e instanceof Error ? e.message : copy.errorMessage);
            setDeletingIds((prev) => {
              const next = new Set(prev);
              next.delete(tid);
              return next;
            });
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
    if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
    // Shared platform defaults are never selectable (see isShared below), but
    // a selection can still mix plain deletes with resets of a company's own
    // overrides — "Remove" covers both without claiming the wrong one.
    const anyOverride = list.some(
      (t) => selected.has(String(t.id)) && t.company !== null && t.overrides_shared_default,
    );
    Alert.alert(
      'Remove vehicle types',
      `Remove ${selected.size} selected type(s)?${anyOverride ? ' Any customized type reverts to the shared default instead of being deleted.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Remove ${selected.size}`,
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
      ],
    );
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Label className="text-muted">Vehicle types</Label>
        <View className="flex-row items-center gap-1">
          {sorted.length > 0 && (
            <TouchableOpacity
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={selectMode ? 'Done selecting' : 'Select vehicle types'}
              className="min-h-[44px] justify-center px-2"
              onPress={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            >
              <Mono className="text-caption font-medium text-link">
                {selectMode ? 'Done' : 'Select'}
              </Mono>
            </TouchableOpacity>
          )}
          {!selectMode && (
            <IconButton
              name="plus"
              accessibilityLabel="Add vehicle type"
              onPress={() => {
                if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
                nav.navigate('AddVehicleType');
              }}
            />
          )}
        </View>
      </View>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load vehicle types"
          body="Check your connection and try again."
          action={
            <Button label="Retry" variant="secondary" icon="refresh" onPress={() => refetch()} />
          }
        />
      ) : sorted.length > 0 ? (
        <>
          <View className="flex-row gap-2.5">
            <StatCard label="Types" value={String(sorted.length)} />
            <StatCard label="Active" value={String(activeCount)} />
          </View>

          <View>
            {sorted.map((t, i) => {
              const r = t as unknown as Record<string, unknown>;
              const tid = String(pick(r, ['id']) ?? i);
              const cap = num(pick(r, ['capacity']));
              const rate = num(pick(r, ['base_rate']));
              const fuelType = str(pick(r, ['fuel_type']));
              const consumption = num(pick(r, ['fuel_consumption_l_per_100km']));
              const sensitivity = num(pick(r, ['fuel_consumption_sensitivity_pct']));
              const description = str(pick(r, ['description']));
              const isActive = pick(r, ['active']) !== false;
              const isSel = selected.has(tid);
              const isDeleting = deletingIds.has(tid);
              // Shared platform default (company=null, editable but never
              // deletable — the backend's own perform_destroy 403s a tenant
              // trying), this company's own override of one (editable in
              // place, "Reset" instead of "Delete"), or a fully custom type.
              // Read straight off `t`, not through pick(r, ...) — pick()
              // treats null the same as a missing key, which would erase the
              // "shared" signal entirely (see normalizeVehicleType).
              const isShared = t.company === null;
              const isOverride = !isShared && t.overrides_shared_default === true;
              const openEdit = () => {
                if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
                nav.navigate('AddVehicleType', {
                  id: pick(r, ['id']) as string | number,
                  preview: r,
                });
              };
              const meta = [
                cap ? `${cap}t` : null,
                rate ? `R ${rate}/km` : null,
                fuelType || null,
                consumption ? `${consumption} L/100km` : null,
                consumption && sensitivity ? `+${sensitivity}%/t over capacity` : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <View key={tid} className="mb-2.5 overflow-hidden rounded-card border border-line">
                  <SwipeRow
                    // A shared default has nothing to delete/reset yet — the
                    // backend rejects it outright (VehicleTypeViewSet.perform_
                    // destroy), so the gesture is disabled rather than left to
                    // fail on tap.
                    enabled={!selectMode && !isDeleting && !isShared}
                    deleteLabel={isOverride ? 'Reset' : 'Delete'}
                    onDelete={() => removeOne(r, tid, isOverride)}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (selectMode) {
                          if (!isShared) toggleSel(tid);
                          return;
                        }
                        openEdit();
                      }}
                      disabled={isDeleting}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${str(pick(r, ['name']), 'Vehicle type')}${selectMode ? (isSel ? ', selected' : '') : ', edit'}`}
                      className="min-h-[64px] flex-row items-center gap-3 bg-surface px-3.5 py-3"
                    >
                      {/* Not selectable when shared — batch-delete can't
                          touch a platform default, so its dot never fills
                          (SelectionDot's `disabled`). */}
                      {selectMode && <SelectionDot selected={isSel} disabled={isShared} />}
                      <View
                        className={`h-[38px] w-[38px] items-center justify-center rounded-control border ${
                          isActive ? 'border-line-active' : 'border-line'
                        }`}
                      >
                        <Icon
                          name="truck"
                          size={19}
                          color={isActive ? colors.fg : colors.faint}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Txt className="flex-1 text-body font-medium text-fg" numberOfLines={1}>
                            {str(pick(r, ['name']), 'Type')}
                          </Txt>
                          {!isActive && <Badge label="Inactive" tone="neutral" />}
                          {isShared && <Badge label="Platform default" tone="info" />}
                          {isOverride && <Badge label="Customized" tone="accent" />}
                        </View>
                        {!!description && (
                          <Txt className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                            {description}
                          </Txt>
                        )}
                        {!!meta && (
                          <Mono className="mt-0.5 text-caption text-faint" numberOfLines={1}>
                            {meta}
                          </Mono>
                        )}
                      </View>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={colors.faint} />
                      ) : (
                        !selectMode && <Icon name="chevronRight" size={16} color={colors.faint} />
                      )}
                    </TouchableOpacity>
                  </SwipeRow>
                </View>
              );
            })}
          </View>

          {!selectMode && (
            <Mono className="-mt-1 text-center text-caption text-faint">
              Swipe a row left to delete
            </Mono>
          )}
        </>
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
  const demo = useDemo();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed once from the server, then edit locally until saved.
  useEffect(() => {
    if (data && !prefs) setPrefs(data);
  }, [data, prefs]);

  const state = prefs ?? NOTIFICATION_DEFAULTS;

  const toggle = (channel: NotificationChannel, key: string, value: boolean) => {
    if (demo.block()) return;
    setPrefs((p) => {
      const base = p ?? NOTIFICATION_DEFAULTS;
      return { ...base, [channel]: { ...base[channel], [key]: value } };
    });
  };

  const save = async () => {
    if (demo.block()) return;
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
  const demo = useDemo();
  const { colors } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (demo.block()) return;
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
    if (demo.block()) return;
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
    if (demo.block()) return;
    try {
      await updateSecuritySettings({ [key]: v });
      invalidateFor(qc, 'security');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update setting');
    }
  };

  const revokeMany = async (scope: 'others' | 'all') => {
    // Every demo visitor shares one Django user — "log out all sessions"
    // would sign every other visitor's demo session out too.
    if (demo.block()) return;
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
    if (demo.block()) return;
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
        <TextField
          label="Current password"
          placeholder="Current password"
          secureTextEntry
          icon="lock"
          value={current}
          onChangeText={setCurrent}
        />
        <TextField
          label="New password"
          placeholder="At least 8 characters"
          secureTextEntry
          icon="lock"
          value={next}
          onChangeText={setNext}
        />
        <TextField
          label="Confirm new password"
          placeholder="Re-enter the new password"
          secureTextEntry
          icon="lock"
          value={confirmPw}
          onChangeText={setConfirmPw}
        />
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
        <TouchableOpacity
          onPress={() => setShowDelete(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          className="min-h-[52px] flex-row items-center gap-3 px-4 py-3"
        >
          <Icon name="x" size={18} color={colors.dangerDot} />
          <Txt className="flex-1 text-body text-danger">Delete account</Txt>
        </TouchableOpacity>
      </Group>

      {/* The endpoint requires the current password, and Alert.alert can't
          collect input — hence a real modal rather than a system dialog. */}
      {showDelete && (
        <Modal visible transparent animationType="fade" onRequestClose={closeDelete}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeDelete}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
              {/* Swallows taps on the card so only the backdrop dismisses. */}
              <TouchableOpacity
                activeOpacity={1}
                accessible={false}
                onPress={() => {}}
                className="rounded-panel border border-line bg-surface p-5"
              >
                <Txt className="text-heading font-semibold text-fg">Delete account</Txt>
                <Txt className="mt-1.5 text-sub text-muted">
                  This deactivates your account, signs you out of every device, and cannot be
                  undone. Enter your password to confirm.
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
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
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
                <Mono className="mt-0.5 text-caption text-faint">
                  {s.current ? 'This device' : s.lastSeen}
                </Mono>
              </View>
              {!s.current && (
                <TouchableOpacity
                  hitSlop={8}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Revoke session on ${s.device}`}
                  className="min-h-[44px] justify-center"
                  onPress={() => revoke(s.id)}
                >
                  <Mono className="text-caption font-medium text-danger">Revoke</Mono>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={otherCount > 0 ? 'Log out other sessions' : 'Log out all sessions'}
            onPress={() =>
              otherCount > 0
                ? Alert.alert(
                    'Sign out other sessions',
                    `Sign out ${otherCount} other device${otherCount === 1 ? '' : 's'}? They'll need to log in again.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign out',
                        style: 'destructive',
                        onPress: () => revokeMany('others'),
                      },
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
            className="min-h-[44px] justify-center border-t border-line-row px-4 py-3.5"
          >
            <Mono className="text-caption font-medium text-danger">
              {otherCount > 0 ? 'Log out other sessions' : 'Log out all sessions'}
            </Mono>
          </TouchableOpacity>
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
                style={{ backgroundColor: colors[ACTIVITY_TONE[a.event] ?? 'infoDot'] }}
              />
              <View className="flex-1">
                <Txt className="text-caption text-fg">
                  {ACTIVITY_LABEL[a.event] ?? (a.action === 'LOGIN' ? 'Signed in' : 'Signed out')}
                </Txt>
                <Mono className="mt-0.5 text-caption text-faint" numberOfLines={1}>
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
const ACTIVITY_TONE: Record<string, 'successDot' | 'infoDot' | 'dangerDot'> = {
  login: 'successDot',
  logout: 'infoDot',
  revoked: 'dangerDot',
  revoked_others: 'dangerDot',
  revoked_all: 'dangerDot',
};

const PROVINCE_OPTIONS = ['GP', 'WC', 'KZN', 'EC', 'LP', 'MP', 'NW', 'FS', 'NC'].map((p) => ({
  label: p,
  value: p,
}));
// The backend's factory default for Company.fuel_price_per_litre. Used both as
// the blank-box fallback on save and to recognise an untouched diesel price when
// the live feed offers a fresher one — those two uses must stay in step, or the
// "don't overwrite a deliberate price" guard inverts.
const DIESEL_DEFAULT_PRICE = 23.5;

function CompanySection() {
  const { data } = useCompanyProfile();
  const qc = useQueryClient();
  const demo = useDemo();
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
  // How many border crossings this fleet makes a year, each leg counted
  // separately — drives how the annual SA C-BRTA permit is amortised across
  // a cross-border quote's crossing.
  const [crossingsPerYear, setCrossingsPerYear] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [tollRate, setTollRate] = useState('');
  const [slaHours, setSlaHours] = useState('');
  // One default price per fuel type. Diesel keeps the legacy field name
  // (fuel_price_per_litre) because it predates the other three, and it's the
  // only one the column can't hold NULL for.
  const [fuelPrice, setFuelPrice] = useState('');
  const [fuelPetrol, setFuelPetrol] = useState('');
  const [fuelElectric, setFuelElectric] = useState('');
  const [fuelHybrid, setFuelHybrid] = useState('');
  // Which gazetted diesel price this fleet buys at — coastal (Cape Town,
  // Durban, Gqeberha, East London) or inland (Gauteng and the interior),
  // roughly R0.87/L apart. Only diesel is split this way.
  const [fuelZone, setFuelZone] = useState<'INLAND' | 'COASTAL'>('INLAND');
  const [livePrice, setLivePrice] = useState<Record<string, unknown> | null>(null);
  const [fetchingLive, setFetchingLive] = useState(false);
  // Banking details, shown in a "How to pay" block on invoices (PDF, email and
  // the online copy) once a bank name and account number are both filled in.
  const [bankName, setBankName] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankType, setBankType] = useState('none');
  const [payRefHint, setPayRefHint] = useState('');
  // An invoice is raised when a load is delivered. 'no' leaves it as a draft to
  // check and send; 'yes' emails the customer straight away.
  const [autoEmail, setAutoEmail] = useState('no');

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
    seedNum(['cross_border_crossings_per_year'], setCrossingsPerYear);
    setFuelZone(str(pick(data, ['fuel_zone'])) === 'COASTAL' ? 'COASTAL' : 'INLAND');
    setAllowCrossBorder(pick(data, ['allow_cross_border']) === false ? 'no' : 'yes');
    setBankName(str(pick(data, ['bank_name'])));
    setBankHolder(str(pick(data, ['bank_account_holder'])));
    setBankAccount(str(pick(data, ['bank_account_number'])));
    setBankBranch(str(pick(data, ['bank_branch_code'])));
    setBankType(str(pick(data, ['bank_account_type']), 'none') || 'none');
    setPayRefHint(str(pick(data, ['payment_reference_hint'])));
    setAutoEmail(pick(data, ['auto_email_invoices']) === true ? 'yes' : 'no');
    const logo = str(pick(data, ['logo_url']));
    if (logo && !logo.endsWith('/brand/logo.svg')) setLogoUrl(logo);
    setSeeded(true);
  }, [data, seeded]);

  const save = async () => {
    if (demo.block()) return;
    // Every numeric box is validated through parseNum first. The old guards
    // compared Number(v) against bounds, and BOTH sides of a comparison are
    // false for NaN — so a comma value passed every check and NaN went to the
    // API, which is not a JSON number at all.
    const numericFields: [string, string][] = [
      ['Quote validity', validityDays],
      ['Base rate / km', baseRate],
      ['Toll rate / km', tollRate],
      ['Diesel price', fuelPrice],
      ['Petrol price', fuelPetrol],
      ['Electric price', fuelElectric],
      ['Hybrid price', fuelHybrid],
      ['SLA hours', slaHours],
      ['Border crossings per year', crossingsPerYear],
    ];
    for (const [label, v] of numericFields) {
      if (v.trim() && parseNum(v) == null) return toast.error(`${label} is not a number`);
    }

    // Same bounds the web company page enforces.
    const validityNum = parseNum(validityDays);
    if (validityNum != null && (validityNum < 1 || validityNum > 365)) {
      return toast.error('Quote validity must be between 1 and 365 days');
    }
    for (const [label, v] of numericFields) {
      const n = parseNum(v);
      if (n != null && n < 0) return toast.error(`${label} can't be negative`);
    }
    // Mirrors web's CompanySettings.tsx bound on Default SLA (Hours) — a
    // value present must be a sane whole number of hours; blank is still
    // allowed (falls back to the model default on save).
    const slaHoursNum = parseNum(slaHours);
    if (slaHoursNum != null && (slaHoursNum < 1 || slaHoursNum > 720)) {
      return toast.error('Default SLA must be between 1 and 720 hours');
    }
    // Mirrors web's CompanySettings.tsx bound on Border Crossings Per Year.
    const crossingsNum = parseNum(crossingsPerYear);
    if (crossingsNum != null && (crossingsNum < 1 || crossingsNum > 5000)) {
      return toast.error('Border crossings per year must be between 1 and 5000');
    }
    // validityDays/slaHours/crossingsPerYear are all plain IntegerFields — a
    // comma value like "7,5" passes every check above (parseNum reads it as
    // 7.5, well inside every range) but 400s server-side as "A valid integer
    // is required.", not the DecimalField digit-count message but the same
    // class of bug.
    for (const [label, n] of [
      ['Quote validity', validityNum],
      ['SLA hours', slaHoursNum],
      ['Border crossings per year', crossingsNum],
    ] as const) {
      if (n != null && !Number.isInteger(n)) return toast.error(`${label} must be a whole number`);
    }

    // Banking details: spaces and hyphens are fine (the server strips them), but
    // what is left must be digits. Blank clears the field. A bank name and an
    // account number only make sense together.
    const accountDigits = bankAccount.replace(/[\s-]/g, '');
    if (accountDigits && !/^\d{6,20}$/.test(accountDigits)) {
      return toast.error('Account number must be 6 to 20 digits');
    }
    const branchDigits = bankBranch.replace(/[\s-]/g, '');
    if (branchDigits && !/^\d{4,10}$/.test(branchDigits)) {
      return toast.error('Branch code must be 4 to 10 digits');
    }
    if (!!bankName.trim() !== !!accountDigits) {
      return toast.error('Enter both a bank name and an account number, or leave both blank');
    }

    // Company's rate/price columns are DecimalField(…, decimal_places=N)
    // with no server-side rounding — round to each column's own precision so
    // a value with more decimals than that (a still-focused field's blur
    // reformat hasn't run, or the field has no `decimals` prop at all)
    // doesn't get the whole save rejected.
    //
    // Only send a numeric field when it has a value — an empty box must leave
    // the stored default alone rather than zeroing it.
    const optionalNum = (v: string, dp: number) =>
      v.trim() ? (parseNum(v) != null ? roundTo(parseNum(v)!, dp) : undefined) : undefined;
    // For the nullable per-fuel-type prices, blank has to mean "clear it", which
    // needs an explicit null: optionalNum omits the key entirely, so a price
    // could be set but never removed.
    const clearableNum = (v: string, dp: number) =>
      v.trim() ? (parseNum(v) != null ? roundTo(parseNum(v)!, dp) : null) : null;

    // default_base_rate_per_km (8,2), default_toll_rate_per_km (6,3), the
    // four fuel prices (8,4) — an oversized typed value (more whole digits
    // than the column allows) is caught here rather than round-tripping to a
    // server 400, same reasoning as decimalMax elsewhere in this file.
    const BASE_RATE_MAX = decimalMax(8, 2);
    const TOLL_RATE_MAX = decimalMax(6, 3);
    const FUEL_PRICE_MAX = decimalMax(8, 4);
    for (const [label, v, max] of [
      ['Base rate / km', baseRate, BASE_RATE_MAX],
      ['Toll rate / km', tollRate, TOLL_RATE_MAX],
      ['Diesel price', fuelPrice, FUEL_PRICE_MAX],
      ['Petrol price', fuelPetrol, FUEL_PRICE_MAX],
      ['Electric price', fuelElectric, FUEL_PRICE_MAX],
      ['Hybrid price', fuelHybrid, FUEL_PRICE_MAX],
    ] as const) {
      const n = parseNum(v);
      if (n != null && n > max) return toast.error(`${label} is too large`);
    }

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
        address: {
          street: street.trim(),
          city: city.trim(),
          province,
          postal_code: postalCode.trim(),
          country: 'South Africa',
        },
        contact: { phone: phone.trim(), email: email.trim(), support_email: supportEmail.trim() },
        allow_cross_border: allowCrossBorder === 'yes',
        auto_email_invoices: autoEmail === 'yes',
        // Blank is sent as null so a field can be cleared as well as set.
        bank_name: bankName.trim() || null,
        bank_account_holder: bankHolder.trim() || null,
        bank_account_number: accountDigits || null,
        bank_branch_code: branchDigits || null,
        bank_account_type: bankType === 'none' ? null : bankType,
        payment_reference_hint: payRefHint.trim() || null,
        // PositiveIntegerField, NOT NULL with a factory default of 24 — a
        // blank box falls back to that rather than clearing, same shape as
        // diesel below.
        cross_border_crossings_per_year: optionalNum(crossingsPerYear, 0) ?? 24,
        default_quote_validity_days: optionalNum(validityDays, 0),
        default_base_rate_per_km: optionalNum(baseRate, 2),
        default_toll_rate_per_km: optionalNum(tollRate, 3),
        fuel_zone: fuelZone,
        // Diesel is NOT NULL with a 23.50 factory default, so a blank box falls
        // back to that rather than clearing — matching the web page.
        fuel_price_per_litre: optionalNum(fuelPrice, 4) ?? DIESEL_DEFAULT_PRICE,
        fuel_price_petrol: clearableNum(fuelPetrol, 4),
        fuel_price_electric: clearableNum(fuelElectric, 4),
        fuel_price_hybrid: clearableNum(fuelHybrid, 4),
        default_sla_hours: optionalNum(slaHours, 0),
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
   *
   * `zoneOverride` is passed by the zone selector so the fetch prices at the
   * zone just chosen rather than whatever `fuelZone` still holds — reading it
   * back from state would let a fast response land before the setFuelZone
   * commit and write the wrong zone's price. `dieselOnly` keeps a zone switch
   * off the petrol field — petrol has no coastal/inland split, so a zone
   * change has no business rewriting it.
   */
  const loadLivePrice = async (manual: boolean, zoneOverride?: string, dieselOnly = false) => {
    const zone = zoneOverride ?? fuelZone;
    if (manual) setFetchingLive(true);
    try {
      const d = (await fetchFuelPrices(manual)) as Record<string, unknown>;
      setLivePrice(d);
      if (pick(d, ['success']) === false) {
        if (manual) toast.error(str(pick(d, ['error']), 'Could not fetch live fuel prices'));
        return;
      }
      // Diesel is gazetted per zone — reading inland_price unconditionally
      // over-charged every coastal fleet by the coastal/inland gap. Falls
      // back to inland_price when coastal_price is absent (an older backend).
      const diesel = zone === 'COASTAL' ? (pick(d, ['coastal_price']) ?? pick(d, ['inland_price'])) : pick(d, ['inland_price']);
      if (diesel != null) {
        // On the silent load, only fill what still looks untouched — blank, or
        // still sitting on the factory default. A manual fetch is an explicit
        // request, so it always wins. Never quietly overwrite a real price.
        setFuelPrice((prev) => {
          const n = parseNum(prev);
          const untouched =
            !prev.trim() || (n != null && Math.abs(n - DIESEL_DEFAULT_PRICE) < 0.001);
          return manual || untouched ? String(num(diesel)) : prev;
        });
      }
      // petrol_95 comes back as 0 (not null) when there's no data — writing that
      // would store a zero price.
      const petrol = num(pick(d, ['petrol_95']));
      if (petrol > 0 && !dieselOnly) {
        setFuelPetrol((prev) => (manual || !prev.trim() ? String(petrol) : prev));
      }
      if (manual) {
        if (dieselOnly) toast.success(`Diesel updated to the ${zone === 'COASTAL' ? 'coastal' : 'inland'} price`);
        else toast.success('Fuel prices refreshed');
      }
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
  const liveDiesel = num(
    pick(
      livePrice ?? {},
      fuelZone === 'COASTAL' ? ['coastal_price', 'inland_price'] : ['inland_price'],
    ),
  );
  const liveNote = (() => {
    if (!livePrice || pick(livePrice, ['success']) === false || liveDiesel <= 0) return '';
    // The price is the 50ppm wholesale list price from a given day; say which
    // day (effective_from, in SAST), falling back to the month it was fetched.
    const effective = str(pick(livePrice, ['effective_from']));
    const updated = str(pick(livePrice, ['last_updated']));
    const grade = str(pick(livePrice, ['diesel_grade']));
    const warning = str(pick(livePrice, ['stale_warning']));
    const zoneLabel = fuelZone === 'COASTAL' ? 'coastal' : 'inland';
    const parts = [
      `Live national diesel ${formatCurrency(liveDiesel)}/L (${[grade, zoneLabel].filter(Boolean).join(' ')})`,
    ];
    if (effective) parts.push(`effective ${formatDate(effective.slice(0, 10))}`);
    else if (updated) parts.push(`updated ${formatDate(updated)}`);
    if (warning) parts.push(warning);
    return parts.join(' · ');
  })();

  const uploadLogo = async () => {
    if (demo.block()) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const out = (await updateCompanyLogo({
        uri: asset.uri,
        name: 'logo.jpg',
        type: 'image/jpeg',
      })) as Record<string, unknown>;
      const url = str(pick(out ?? {}, ['logo_url']));
      if (url) setLogoUrl(url);
      invalidateFor(qc, 'company');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload logo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <Label className="text-muted">Company logo</Label>
      <View className="flex-row items-center gap-3">
        <Avatar name={companyName} uri={mediaUrl(logoUrl)} size={56} />
        <UploadButton label="Upload logo" icon="download" uploading={busy} onPress={uploadLogo} />
      </View>

      <Label className="mt-1 text-muted">Business information</Label>
      <TextField
        label="Company name"
        placeholder="Your company"
        icon="building"
        value={companyName}
        onChangeText={setCompanyName}
      />
      <SelectField
        label="Industry"
        options={INDUSTRY_OPTIONS}
        value={industry}
        onSelect={setIndustry}
      />
      <TextField
        label="Registration number"
        placeholder="YYYY/XXXXXX/XX"
        value={regNumber}
        onChangeText={setRegNumber}
      />
      <TextField
        label="VAT number"
        placeholder="4XXXXXXXXX"
        value={vatNumber}
        onChangeText={setVatNumber}
      />
      <TextField
        label="Website"
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        value={website}
        onChangeText={setWebsite}
      />
      <TextField
        label="Description"
        placeholder="What your company does"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Label className="mt-1 text-muted">Business address</Label>
      <TextField label="Street address" value={street} onChangeText={setStreet} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField label="City" value={city} onChangeText={setCity} />
        </View>
        <View className="flex-1">
          <SelectField
            label="Province"
            options={PROVINCE_OPTIONS}
            value={province}
            onSelect={setProvince}
          />
        </View>
      </View>
      <TextField
        label="Postal code"
        keyboardType="number-pad"
        value={postalCode}
        onChangeText={setPostalCode}
      />

      <Label className="mt-1 text-muted">Contact</Label>
      <TextField
        label="Phone"
        icon="phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextField
        label="Business email"
        icon="send"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Support email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={supportEmail}
        onChangeText={setSupportEmail}
      />

      <Label className="mt-1 text-muted">Banking details</Label>
      <Txt className="-mt-2 text-caption text-faint">
        Shown in a &quot;How to pay&quot; section on the invoices you send (PDF, invoice email and
        online invoice) once a bank name and account number are filled in. Until then, invoices ask
        customers to contact you for banking details.
      </Txt>
      <TextField
        label="Bank name"
        placeholder="e.g. FNB"
        maxLength={100}
        value={bankName}
        onChangeText={setBankName}
      />
      <TextField
        label="Account holder"
        placeholder={companyName || 'Registered account name'}
        maxLength={200}
        value={bankHolder}
        onChangeText={setBankHolder}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="Account number"
            placeholder="Digits only"
            keyboardType="number-pad"
            maxLength={30}
            value={bankAccount}
            onChangeText={setBankAccount}
          />
        </View>
        <View className="flex-1">
          <TextField
            label="Branch code"
            placeholder="e.g. 250655"
            keyboardType="number-pad"
            maxLength={14}
            value={bankBranch}
            onChangeText={setBankBranch}
          />
        </View>
      </View>
      <SelectField
        label="Account type"
        options={[
          { label: 'Not specified', value: 'none' },
          { label: 'Cheque / current', value: 'CHEQUE' },
          { label: 'Savings', value: 'SAVINGS' },
          { label: 'Transmission', value: 'TRANSMISSION' },
        ]}
        value={bankType}
        onSelect={setBankType}
      />
      <TextField
        label="Payment reference wording (optional)"
        placeholder="Please use the invoice number as your payment reference."
        maxLength={200}
        value={payRefHint}
        onChangeText={setPayRefHint}
      />
      <Txt className="-mt-1 text-caption text-faint">Replaces the default wording on invoices.</Txt>

      <Label className="mt-1 text-muted">Invoicing</Label>
      <SelectField
        label="Email invoices on delivery"
        options={[
          { label: 'No, keep as a draft', value: 'no' },
          { label: 'Yes, email the customer', value: 'yes' },
        ]}
        value={autoEmail}
        onSelect={setAutoEmail}
      />
      <Txt className="-mt-1 text-caption text-faint">
        An invoice is raised automatically when a load is delivered. With No, it waits as a draft
        for you to check and send. With Yes, it is emailed to the customer straight away and marked
        sent. A customer with no email address always gets a draft.
      </Txt>

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
        &quot;No&quot; and any quote whose route actually crosses a border is refused rather than
        priced.
      </Txt>
      <TextField
        label="Border crossings per year"
        placeholder="e.g. 24"
        keyboardType="number-pad"
        value={crossingsPerYear}
        onChangeText={setCrossingsPerYear}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Count each leg separately &mdash; a return trip is two. A C-BRTA permit is bought for a
        year, so a quote charges its share of one crossing: the more you cross, the less each load
        carries.
      </Txt>
      <TextField
        label="Quote validity (days)"
        placeholder="e.g. 7"
        keyboardType="number-pad"
        value={validityDays}
        onChangeText={setValidityDays}
      />
      <TextField
        label="Base rate / km"
        prefix="R"
        placeholder="e.g. 33.00"
        keyboardType="decimal-pad"
        value={baseRate}
        onChangeText={setBaseRate}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Used when the vehicle type on a quote has no rate of its own (Settings → Vehicle Types).
        A type&apos;s own rate always wins.
      </Txt>
      <TextField
        label="Toll rate / km"
        prefix="R"
        placeholder="e.g. 0.50"
        keyboardType="decimal-pad"
        value={tollRate}
        onChangeText={setTollRate}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Fallback only — used when the routing service can&apos;t itemise the toll plazas on a
        route.
      </Txt>
      <TextField
        label="Default SLA (hours)"
        placeholder="e.g. 48"
        icon="clock"
        keyboardType="number-pad"
        value={slaHours}
        onChangeText={setSlaHours}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Delivery time promised on a new quote. Can be overridden per quote.
      </Txt>

      {/* ── Fuel price defaults ───────────────────────────────────────────── */}
      <View className="mt-1 flex-row items-center justify-between">
        <Label className="text-muted">Fuel price defaults</Label>
        {/* A real button: as a bare label this read as a heading and nobody
            knew it was the way to pull the national price. */}
        <Button
          label={fetchingLive ? 'Fetching' : 'Fetch live'}
          icon="download"
          variant="secondary"
          size="sm"
          loading={fetchingLive}
          onPress={() => loadLivePrice(true)}
        />
      </View>
      <Txt className="-mt-2 text-caption text-faint">
        Used when a vehicle type of that fuel runs a quote. Diesel and petrol can be pulled from the
        live national price; electric and hybrid have no feed, so set those yourself.
      </Txt>
      <SelectField
        label="Fuel pricing zone"
        options={[
          { label: 'Inland', value: 'INLAND', sub: 'Gauteng and the interior' },
          { label: 'Coastal', value: 'COASTAL', sub: 'Cape Town, Durban, Gqeberha, East London' },
        ]}
        value={fuelZone}
        onSelect={(v) => {
          const zone = v === 'COASTAL' ? 'COASTAL' : 'INLAND';
          setFuelZone(zone);
          // The zone goes in as an argument, not read back off state — a fast
          // response could otherwise land before setFuelZone commits and
          // write the price for the zone just left.
          void loadLivePrice(true, zone, true);
        }}
      />
      <Txt className="-mt-1 text-caption text-faint">
        Diesel is gazetted at two prices: it arrives at the coastal ports and costs more inland
        once the transport differential is added &mdash; about R0.87/L at the moment. Changing
        this fetches the current price for the zone and updates Diesel below.
      </Txt>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="Diesel (R/L)"
            prefix="R"
            placeholder="e.g. 23,50"
            keyboardType="decimal-pad"
            value={fuelPrice}
            onChangeText={setFuelPrice}
          />
        </View>
        <View className="flex-1">
          <TextField
            label="Petrol (R/L)"
            prefix="R"
            placeholder="Not set"
            keyboardType="decimal-pad"
            value={fuelPetrol}
            onChangeText={setFuelPetrol}
          />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="Electric (R/kWh)"
            prefix="R"
            placeholder="Not set"
            keyboardType="decimal-pad"
            value={fuelElectric}
            onChangeText={setFuelElectric}
          />
        </View>
        <View className="flex-1">
          <TextField
            label="Hybrid (R/L)"
            prefix="R"
            placeholder="Not set"
            keyboardType="decimal-pad"
            value={fuelHybrid}
            onChangeText={setFuelHybrid}
          />
        </View>
      </View>
      {liveNote && (
        <Txt className={`-mt-1 text-caption ${liveStale ? 'text-warning' : 'text-faint'}`}>
          {liveNote}
        </Txt>
      )}

      <Button label="Save changes" loading={busy} onPress={save} fullWidth />
    </View>
  );
}

// Web's six. CUSTOMER and PARTNER exist on the model but neither client
// exposes them for staff invites.
const ROLES = ['ADMIN', 'MANAGER', 'OPERATOR', 'DISPATCHER', 'VIEWER', 'DRIVER'].map((r) => ({
  label: r.charAt(0) + r.slice(1).toLowerCase(),
  value: r,
}));

function UsersSection() {
  const { data } = useUsers();
  const meId = useAuthStore((st) => st.user?.id);
  const qc = useQueryClient();
  const demo = useDemo();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [busy, setBusy] = useState(false);
  const refresh = () => invalidateFor(qc, 'user');

  const invite = async () => {
    if (demo.block()) return;
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
    if (demo.block()) return;
    try {
      await updateUserRole(id, r);
      await refresh();
      toast.success('Role updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update role');
    }
  };

  const remove = (id: string, name: string) => {
    if (demo.block()) return;
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
  };

  return (
    <View className="gap-5">
      <View className="gap-3">
        <Label className="text-muted">Invite a teammate</Label>
        <TextField
          label="Email"
          placeholder="colleague@company.co.za"
          icon="send"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
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
                <Mono className="text-caption font-medium text-faint">You</Mono>
              ) : (
                <>
                  <View style={{ width: 120 }}>
                    <SelectField
                      options={ROLES}
                      value={u.role}
                      onSelect={(r) => changeRole(u.id, r)}
                    />
                  </View>
                  <IconButton
                    name="x"
                    size={16}
                    accessibilityLabel="Remove user"
                    onPress={() => remove(u.id, u.name)}
                  />
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

/** One charge row, shared by the preview and the full-history screen. */
function ChargeRow({ c, last }: { c: BillingCharge; last?: boolean }) {
  const { colors } = useTheme();
  const chargeTone = (status: string) =>
    status === 'complete' ? colors.success : status === 'pending' ? colors.warning : colors.danger;
  return (
    <View className={`px-4 py-3 ${last ? '' : 'border-b border-line-row'}`}>
      <View className="flex-row items-center justify-between">
        <Txt className="flex-1 pr-3 text-caption text-fg" numberOfLines={1}>
          {c.label}
        </Txt>
        <Mono className="text-caption text-fg">{formatCurrency(c.amount)}</Mono>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        <Mono className="text-caption text-faint">
          {[c.createdAt ? formatDate(c.createdAt) : '', c.reference].filter(Boolean).join(' · ')}
        </Mono>
        <Mono className="text-caption capitalize" style={{ color: chargeTone(c.status) }}>
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
  const { colors } = useTheme();
  const { data } = useBillingStatus();
  const { data: history } = useBillingHistory();
  const d = data ?? {};
  const flatPlan = (pick(d, ['flat_plan']) ?? {}) as Record<string, unknown>;
  const card = (pick(d, ['card']) ?? {}) as Record<string, unknown>;
  const grace = (pick(d, ['grace']) ?? {}) as Record<string, unknown>;
  const updateCard = (pick(d, ['update_card']) ?? {}) as Record<string, unknown>;
  const failedItems = asArray<Record<string, unknown>>(pick(updateCard, ['items']));
  const failedTotal = num(pick(updateCard, ['total']));

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
        <Banner
          tone="danger"
          message="Your subscription is suspended. You can still view existing data and manage drivers and vehicles, but new quotes and invoices are blocked until payment is settled."
        />
      )}
      {!suspended && cancelling && (
        <Banner
          tone="warning"
          message={`Cancelling${subEnd ? `. Access continues until ${formatDate(subEnd)}` : ''}. Quoting and invoicing keep working until then.`}
        />
      )}
      {!suspended && !cancelling && graceDays > 0 && (
        <Banner
          tone="warning"
          message={`Payment is overdue. ${graceDays} day${graceDays === 1 ? '' : 's'} of grace remaining${graceExpires ? ` (until ${formatDate(graceExpires)})` : ''}.`}
        />
      )}

      {failedItems.length > 0 && (
        <>
          <Group label="Failed charges">
            {failedItems.map((item, i) => (
              <DetailRow
                key={i}
                label={str(pick(item, ['label']), 'Charge')}
                hint={`Failed ${formatDate(str(pick(item, ['failed_at'])))}`}
                value={formatCurrency(num(pick(item, ['amount'])))}
                valueColor={colors.warning}
                mono={false}
              />
            ))}
            <DetailRow
              label="Total to clear everything"
              value={formatCurrency(failedTotal)}
              boldValue
              last
            />
          </Group>
          <Txt className="text-caption text-faint">
            These clear together once you update your payment method on the web dashboard.
          </Txt>
        </>
      )}

      <Txt className="text-caption text-faint">
        {subscriptionStatusDetail(status, cancelling)}
      </Txt>

      <Group>
        <DetailRow label="Plan" value={planLabel} mono={false} />
        <DetailRow label="Status" value={subscriptionStatusLabel(status, cancelling)} />
        {amount > 0 ? <DetailRow label="Amount" value={formatCurrency(amount)} /> : null}
        {last4 ? (
          <DetailRow label="Card" value={`${cardType || 'Card'} •••• ${last4}`} mono={false} />
        ) : null}
        {/* Was reading `renews_at`, which this endpoint never returns — the
            row was permanently blank. */}
        <DetailRow
          label="Renews"
          value={nextBillingDate ? formatDate(nextBillingDate) : '—'}
          last
        />
      </Group>

      {!!countdown && (
        <Mono className="text-caption text-muted" style={{ fontVariant: ['tabular-nums'] }}>
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
          <Mono className={`text-caption font-medium ${connected ? 'text-success' : 'text-faint'}`}>
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
