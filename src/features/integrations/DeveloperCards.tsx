import { useState } from 'react';
import { Alert, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  AppSheet,
  Button,
  Card,
  Icon,
  Mono,
  OverflowMenu,
  TextField,
  Txt,
  type OverflowAction,
} from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { toast } from '@/lib/toast';
import { formatDate, formatRelativeTime } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { useAccountingPermissions } from '@/features/accounting/permissions';
import {
  INT_KEYS,
  WEBHOOK_EVENTS,
  integrationsApi,
  intError,
  useApiKeys,
  useWebhooks,
} from './api';

function Header({ title, action }: { title: string; action: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Txt className="flex-1 text-body font-semibold text-fg">{title}</Txt>
      {action}
    </View>
  );
}

function WriteNote({ show, title }: { show: boolean; title?: string }) {
  if (!show || !title) return null;
  return <Txt className="text-caption text-faint">{title}.</Txt>;
}

/** Revoke / delete are one tap from a menu, so they always ask first. */
const confirmDestructive = (title: string, message: string, verb: string, run: () => void) =>
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: verb, style: 'destructive', onPress: run },
  ]);

// ------------------------------------------------------------------ API keys

export function ApiKeysCard() {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const qc = useQueryClient();
  const q = useApiKeys();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // The full key exists only in the create response; it is held here until the sheet closes.
  const [created, setCreated] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setName('');
    setCreated(null);
  };

  const generate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a key name');
      return;
    }
    setBusy(true);
    try {
      const k = await integrationsApi.createApiKey(name.trim());
      setCreated(k.key);
      setName('');
      toast.success('API key generated');
      void qc.invalidateQueries({ queryKey: INT_KEYS.apiKeys });
    } catch (e) {
      toast.error(intError(e, 'Failed to generate key'));
    } finally {
      setBusy(false);
    }
  };

  const copyAndClose = async () => {
    if (created) await Clipboard.setStringAsync(created);
    toast.success('Copied to clipboard');
    close();
  };

  const revoke = (id: number, keyName: string) =>
    confirmDestructive(
      `Revoke the API key "${keyName}"?`,
      'Systems using it will stop working immediately.',
      'Revoke',
      async () => {
        try {
          await integrationsApi.revokeApiKey(id);
          toast.success('API key revoked');
          void qc.invalidateQueries({ queryKey: INT_KEYS.apiKeys });
        } catch (e) {
          toast.error(intError(e, 'Failed to revoke key'));
        }
      },
    );

  const keys = q.data ?? [];

  return (
    <Card className="gap-3 p-4">
      <Header
        title="Partner API keys"
        action={<Button label="New key" size="sm" variant="secondary" disabled={!canWrite} onPress={() => setOpen(true)} />}
      />
      <WriteNote show={!canWrite} title={writeTitle} />
      {q.isLoading ? (
        <ListSkeleton rows={1} />
      ) : keys.length === 0 ? (
        <Txt className="text-caption text-muted">
          No keys yet. Create one to connect your own software to TruckWys.
        </Txt>
      ) : (
        <View className="gap-2">
          {keys.map((k) => {
            const actions: OverflowAction[] = [
              {
                label: 'Revoke',
                destructive: true,
                disabled: !canWrite,
                hint: writeTitle,
                onPress: () => revoke(k.id, k.name),
              },
            ];
            return (
              <View
                key={k.id}
                className="flex-row items-center gap-3 rounded-control border border-line bg-raised px-3 py-2.5"
              >
                <View className="flex-1">
                  <Txt className="text-body font-medium text-fg" numberOfLines={1}>
                    {k.name}
                  </Txt>
                  <Txt className="mt-0.5 text-caption text-muted">
                    {k.key} · Created {formatDate(k.created_at)}
                    {k.last_used_at ? ` · Last used ${formatRelativeTime(k.last_used_at)}` : ''}
                  </Txt>
                </View>
                <OverflowMenu actions={actions} title={k.name} accessibilityLabel={`Actions for ${k.name}`} />
              </View>
            );
          })}
        </View>
      )}

      <AppSheet open={open} onClose={close} title={created ? 'API key generated' : 'New API key'}>
        <View className="gap-3 px-4 pb-4">
          {created ? (
            <>
              <Txt className="text-caption text-muted">Copy this key now. It will only be shown once.</Txt>
              <View className="rounded-control border border-line bg-raised p-3">
                <Mono className="text-caption text-fg" selectable>
                  {created}
                </Mono>
              </View>
              <View className="flex-row gap-2.5">
                <Button label="Copy and close" size="sm" onPress={() => void copyAndClose()} />
                <Button label="Close" size="sm" variant="secondary" onPress={close} />
              </View>
            </>
          ) : (
            <>
              <TextField
                bottomSheet
                label="Key name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Production server"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => void generate()}
              />
              <View className="flex-row gap-2.5">
                <Button
                  label={busy ? 'Generating…' : 'Generate'}
                  size="sm"
                  loading={busy}
                  disabled={!canWrite}
                  onPress={() => void generate()}
                />
                <Button label="Cancel" size="sm" variant="secondary" onPress={close} />
              </View>
            </>
          )}
        </View>
      </AppSheet>
    </Card>
  );
}

// ------------------------------------------------------------------ Webhooks

export function WebhooksCard() {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useWebhooks();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setUrl('');
    setEvents([]);
  };

  const toggle = (evt: string) =>
    setEvents((cur) => (cur.includes(evt) ? cur.filter((e) => e !== evt) : [...cur, evt]));

  const create = async () => {
    if (!url.trim() || events.length === 0) {
      toast.error('Please enter URL and select events');
      return;
    }
    setBusy(true);
    try {
      await integrationsApi.createWebhook(url.trim(), events);
      toast.success('Webhook created');
      close();
      void qc.invalidateQueries({ queryKey: INT_KEYS.webhooks });
    } catch (e) {
      toast.error(intError(e, 'Failed to create webhook'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (id: number) => {
    try {
      await integrationsApi.testWebhook(id);
      toast.success('Test webhook fired');
    } catch (e) {
      toast.error(intError(e, 'Failed to test webhook'));
    }
  };

  const remove = (id: number, target: string) =>
    confirmDestructive(
      'Delete this webhook?',
      `${target} will stop receiving events.`,
      'Delete',
      async () => {
        try {
          await integrationsApi.deleteWebhook(id);
          toast.success('Webhook deleted');
          void qc.invalidateQueries({ queryKey: INT_KEYS.webhooks });
        } catch (e) {
          toast.error(intError(e, 'Failed to delete webhook'));
        }
      },
    );

  const hooks = q.data ?? [];

  return (
    <Card className="gap-3 p-4">
      <Header
        title="Webhooks"
        action={<Button label="Add webhook" size="sm" variant="secondary" disabled={!canWrite} onPress={() => setOpen(true)} />}
      />
      <WriteNote show={!canWrite} title={writeTitle} />
      {q.isLoading ? (
        <ListSkeleton rows={1} />
      ) : hooks.length === 0 ? (
        <Txt className="text-caption text-muted">
          No webhooks yet. Add one and TruckWys will notify your system when something changes.
        </Txt>
      ) : (
        <View className="gap-2">
          {hooks.map((h) => {
            const actions: OverflowAction[] = [
              { label: 'Send test', disabled: !canWrite, hint: writeTitle, onPress: () => void sendTest(h.id) },
              {
                label: 'Delete',
                destructive: true,
                disabled: !canWrite,
                hint: writeTitle,
                onPress: () => remove(h.id, h.url),
              },
            ];
            return (
              <View
                key={h.id}
                className="flex-row items-center gap-3 rounded-control border border-line bg-raised px-3 py-2.5"
              >
                <View className="flex-1 gap-1.5">
                  <Txt className="text-caption text-fg">{h.url}</Txt>
                  <View className="flex-row flex-wrap gap-1.5">
                    {h.events.map((e) => (
                      <View key={e} className="rounded-chip bg-surface px-2 py-0.5">
                        <Txt className="text-caption text-muted">{e}</Txt>
                      </View>
                    ))}
                  </View>
                </View>
                <OverflowMenu actions={actions} title={h.url} accessibilityLabel={`Actions for ${h.url}`} />
              </View>
            );
          })}
        </View>
      )}

      <AppSheet open={open} onClose={close} title="Add webhook" maxHeight={0.85} scroll>
        <View className="gap-3 px-4 pb-4">
          <TextField
            bottomSheet
            label="URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://your-app.com/webhooks/truckwys"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Txt className="text-caption font-medium text-muted">Select events</Txt>
          <View className="flex-row flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((evt) => {
              const on = events.includes(evt);
              return (
                <TouchableOpacity
                  key={evt}
                  onPress={() => toggle(evt)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={evt}
                  className={`min-h-[36px] flex-row items-center gap-1.5 rounded-control border px-3 ${
                    on ? 'border-line-strong bg-raised' : 'border-line bg-transparent'
                  }`}
                >
                  {on && <Icon name="check" size={14} color={colors.fg} strokeWidth={2.4} />}
                  <Mono className={`text-caption font-medium ${on ? 'text-fg' : 'text-muted'}`}>{evt}</Mono>
                </TouchableOpacity>
              );
            })}
          </View>
          <View className="flex-row gap-2.5">
            <Button
              label={busy ? 'Creating…' : 'Create'}
              size="sm"
              loading={busy}
              disabled={!canWrite}
              onPress={() => void create()}
            />
            <Button label="Cancel" size="sm" variant="secondary" onPress={close} />
          </View>
        </View>
      </AppSheet>
    </Card>
  );
}
