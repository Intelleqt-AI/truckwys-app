import { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  DateField,
  DetailRow,
  Group,
  Icon,
  Label,
  SelectionDot,
  TextField,
  Toggle,
  Txt,
  type Tone,
} from '@/components/ui';
import { serverMessage, useSubmitApplication, useUpdateApplication } from '@/lib/capital/api';
import type { Application, ApplicationPatch, ApplicationStatus } from '@/lib/capital/types';
import { useTheme } from '@/theme/ThemeProvider';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { day, money, sentenceCase } from './capitalUi';

const STATUS: Record<ApplicationStatus, { tone: Tone; label: string }> = {
  NOT_STARTED: { tone: 'neutral', label: 'Not started' },
  SUBMITTED: { tone: 'info', label: 'With the provider' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Not approved' },
};

export function ApplicationStatusChip({ status }: { status: ApplicationStatus }) {
  const m = STATUS[status] ?? { tone: 'neutral' as Tone, label: status };
  return <Badge label={m.label} tone={m.tone} dot />;
}

function Checklist({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      {items.map((m) => (
        <View key={m} className="flex-row items-start gap-2">
          <Icon name="clock" size={14} color={colors.faint} />
          <Txt className="flex-1 text-sub text-muted">{m}</Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The Fast Pay application: what is still needed, the company facts the provider
 * asks for, and the consents with their full text. An approved or submitted
 * application collapses to a short summary. Only an admin or manager can change
 * it (the server answers 403 to anyone else), so others see it read-only.
 */
export function ApplicationCard({
  app,
  provider,
  demo,
  canEdit,
}: {
  app: Application;
  provider: string;
  demo: boolean;
  canEdit: boolean;
}) {
  const update = useUpdateApplication();
  const submit = useSubmitApplication();
  const editable = canEdit && (app.status === 'NOT_STARTED' || app.status === 'REJECTED');

  const fromApp = () => ({
    juristic_person: !!app.juristic_person,
    turnover: app.declared_annual_turnover != null ? String(app.declared_annual_turnover) : '',
    insurer: app.git_insurer ?? '',
    expiry: app.git_insurance_expiry ?? '',
  });
  const [form, setForm] = useState(fromApp);
  useEffect(() => {
    setForm(fromApp());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.juristic_person, app.declared_annual_turnover, app.git_insurer, app.git_insurance_expiry]);

  const granted = useMemo(() => new Set(app.consents.map((c) => c.purpose)), [app.consents]);
  const [consents, setConsents] = useState<Set<string>>(() => new Set(granted));
  useEffect(() => {
    setConsents(new Set(granted));
  }, [granted]);
  const [error, setError] = useState('');

  // Only what changed goes to the server.
  const patch: ApplicationPatch = {};
  if (form.juristic_person !== !!app.juristic_person) patch.juristic_person = form.juristic_person;
  const turnoverNum = form.turnover.trim() === '' ? null : parseNum(form.turnover);
  const turnoverBad = form.turnover.trim() !== '' && turnoverNum == null;
  if (!turnoverBad && turnoverNum !== app.declared_annual_turnover) patch.declared_annual_turnover = turnoverNum;
  if ((form.insurer.trim() || null) !== (app.git_insurer || null)) patch.git_insurer = form.insurer.trim() || null;
  if ((form.expiry || null) !== (app.git_insurance_expiry || null)) patch.git_insurance_expiry = form.expiry || null;
  const dirty = Object.keys(patch).length > 0;
  const allConsents = app.required_consents.every((c) => consents.has(c.purpose));
  const busy = update.isPending || submit.isPending;

  const save = async () => {
    setError('');
    try {
      await update.mutateAsync(patch);
      toast.success('Application details saved');
    } catch (e) {
      setError(serverMessage(e, 'The details could not be saved. Try again.'));
    }
  };

  const send = async () => {
    setError('');
    try {
      if (dirty) await update.mutateAsync(patch);
      await submit.mutateAsync({
        consents: app.required_consents.map((c) => c.purpose).filter((p) => consents.has(p)),
      });
      toast.success(`Application sent to ${provider}`);
    } catch (e) {
      setError(serverMessage(e, 'The application could not be sent. Try again.'));
    }
  };

  if (app.status === 'APPROVED' || app.status === 'SUBMITTED' || !canEdit) {
    return (
      <View>
        <View className="mb-2.5 flex-row items-center justify-between">
          <Label>Application</Label>
          <ApplicationStatusChip status={app.status} />
        </View>
        <Group>
          <DetailRow label="Submitted" value={day(app.submitted_at)} />
          <DetailRow
            label="Declared turnover"
            value={app.declared_annual_turnover != null ? money(app.declared_annual_turnover) : '—'}
          />
          <DetailRow
            label="Goods-in-transit cover"
            value={`${app.git_insurer || '—'}${app.git_insurance_expiry ? `, to ${day(app.git_insurance_expiry)}` : ''}`}
            mono={false}
            last
          />
        </Group>
        {app.status === 'SUBMITTED' && (
          <Txt className="mb-3 text-sub text-muted">{sentenceCase(provider)} is reviewing your application.</Txt>
        )}
        {!canEdit && app.status !== 'APPROVED' && app.status !== 'SUBMITTED' && (
          <Txt className="mb-3 text-sub text-muted">
            Only an admin or manager can fill in and send the Fast Pay application.
          </Txt>
        )}
        {app.missing.length > 0 && (
          <View className="mb-3">
            <Txt className="mb-2 text-sub font-medium text-fg">Still needed</Txt>
            <Checklist items={app.missing} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="mb-5 gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Txt className="text-heading font-semibold text-fg">Apply for Fast Pay</Txt>
          <Txt className="mt-0.5 text-sub text-muted">Reviewed by {provider}</Txt>
        </View>
        <ApplicationStatusChip status={app.status} />
      </View>

      {app.missing.length > 0 && (
        <View>
          <Txt className="mb-2 text-sub font-medium text-fg">Still needed</Txt>
          <Checklist items={app.missing} />
        </View>
      )}

      <View className="flex-row items-center justify-between rounded-control border border-line bg-surface px-3.5 py-3">
        <Txt className="mr-3 flex-1 text-body text-fg">We are a registered company or close corporation</Txt>
        <Toggle
          value={form.juristic_person}
          disabled={!editable || busy}
          onValueChange={(v) => setForm((f) => ({ ...f, juristic_person: v }))}
        />
      </View>

      <TextField
        label="Annual turnover (R)"
        value={form.turnover}
        onChangeText={(t) => setForm((f) => ({ ...f, turnover: t }))}
        keyboardType="decimal-pad"
        placeholder="e.g. 4 500 000"
        prefix="R"
        editable={editable && !busy}
        error={turnoverBad ? 'Enter a number, e.g. 4 500 000' : undefined}
      />
      <TextField
        label="Goods-in-transit insurer"
        value={form.insurer}
        onChangeText={(t) => setForm((f) => ({ ...f, insurer: t }))}
        editable={editable && !busy}
        maxLength={200}
      />
      <DateField
        label="Cover expires"
        value={form.expiry}
        onChange={(v) => setForm((f) => ({ ...f, expiry: v }))}
      />

      {app.required_consents.length > 0 && (
        <View className="gap-3">
          <Label>Consents</Label>
          {app.required_consents.map((c) => {
            const given = app.consents.find((g) => g.purpose === c.purpose);
            const on = consents.has(c.purpose);
            return (
              <Card key={c.purpose} className="gap-2 p-3.5">
                <Txt className="text-body font-medium text-fg">{c.title}</Txt>
                <Txt className="text-sub text-muted">{c.text}</Txt>
                <TouchableOpacity
                  onPress={() =>
                    setConsents((s) => {
                      const n = new Set(s);
                      if (n.has(c.purpose)) n.delete(c.purpose);
                      else n.add(c.purpose);
                      return n;
                    })
                  }
                  disabled={!editable || busy}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !editable || busy }}
                  className="mt-1 min-h-[44px] flex-row items-center gap-3"
                >
                  <SelectionDot selected={on} />
                  <Txt className="flex-1 text-body text-fg">
                    {given ? `Agreed on ${day(given.granted_at)}` : 'I agree'}
                  </Txt>
                </TouchableOpacity>
              </Card>
            );
          })}
        </View>
      )}

      {!!error && <Banner tone="danger" message={error} />}

      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button
            label={update.isPending && !submit.isPending ? 'Saving…' : 'Save'}
            variant="secondary"
            disabled={!editable || !dirty || busy || turnoverBad}
            onPress={() => void save()}
            fullWidth
          />
        </View>
        <View className="flex-[1.4]">
          <Button
            label={submit.isPending ? 'Sending…' : 'Send application'}
            loading={submit.isPending}
            disabled={!editable || busy || !allConsents || demo || turnoverBad}
            onPress={() => void send()}
            fullWidth
          />
        </View>
      </View>
      {demo ? (
        <Txt className="text-caption text-faint">{"No money moves in the demo, so the application can't be sent."}</Txt>
      ) : !allConsents ? (
        <Txt className="text-caption text-faint">Agree to each consent to send the application.</Txt>
      ) : null}
    </View>
  );
}
