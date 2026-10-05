import { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  Card,
  TextField,
  SelectField,
  SegmentedControl,
  Button,
  Icon,
  Txt,
  Mono,
  type Option,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency } from '@/lib/formatters';
import { computeLine, toNumber } from '@/lib/finance/tax';
import { blankLine, type EditorLine } from '@/lib/finance/lines';
import { REVENUE_TYPES, type RevenueType, type TaxCode, type TaxCodeOption } from '@/lib/finance/types';
import type { DiscountMode } from '@/lib/finance/tax';

// The invoice's lines: what each charges for, how much, any discount, and the
// VAT treatment. Amounts shown under each line are computed with the same
// rounding as the server (lib/finance/tax), so the preview never disagrees with
// what is saved. Quantity takes 3 decimals and unit price 4, the columns'
// precision; extra digits are cut off as they're typed rather than rounded
// differently by the database.

const REVENUE_OPTIONS: Option[] = REVENUE_TYPES.map((r) => ({ label: r.label, value: r.value }));
const DISCOUNT_MODES: { label: string; value: DiscountMode }[] = [
  { label: 'R', value: 'amount' },
  { label: '%', value: 'percent' },
];

/** Cut a typed decimal off after `dp` places (either "." or "," as the separator). */
export function limitDecimals(text: string, dp: number): string {
  const i = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  return i === -1 ? text : text.slice(0, i + 1 + dp);
}

const money = (v: string) => formatCurrency(toNumber(v));

export function InvoiceLineEditor({
  lines,
  onChange,
  taxCodes,
  defaultTaxCode,
}: {
  lines: EditorLine[];
  onChange: (next: EditorLine[]) => void;
  taxCodes: TaxCodeOption[];
  defaultTaxCode: TaxCode;
}) {
  const { colors } = useTheme();
  const taxOptions: Option[] = useMemo(
    () => taxCodes.map((c) => ({ label: c.label, value: c.code })),
    [taxCodes],
  );

  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // A new line starts on the previous line's tax code: invoices are mostly one
  // treatment, so this saves a tap per line.
  const addLine = () => {
    const last = lines[lines.length - 1];
    onChange([...lines, blankLine(last?.tax_code ?? defaultTaxCode)]);
  };

  return (
    <View className="gap-3">
      {lines.map((l, i) => {
        const a = computeLine(l, taxCodes);
        const discountShown = toNumber(a.discount);
        return (
          <Card key={l.key} className="gap-3 p-3.5">
            <View className="flex-row items-center justify-between">
              <Mono className="text-sub font-medium text-muted">Line {i + 1}</Mono>
              {lines.length > 1 && (
                <TouchableOpacity
                  onPress={() => onChange(lines.filter((x) => x.key !== l.key))}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove line ${i + 1}`}
                >
                  <Icon name="trash" size={17} color={colors.faint} />
                </TouchableOpacity>
              )}
            </View>

            <TextField
              label="Description"
              value={l.description}
              onChangeText={(t) => update(l.key, { description: t })}
              placeholder="e.g. Freight JHB to DBN"
              maxLength={500}
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="Qty"
                  value={l.quantity}
                  onChangeText={(t) => update(l.key, { quantity: limitDecimals(t, 3) })}
                  keyboardType="decimal-pad"
                  placeholder="1"
                />
              </View>
              <View className="flex-[2]">
                <TextField
                  label="Unit price (excl. VAT)"
                  value={l.unit_price}
                  onChangeText={(t) => update(l.key, { unit_price: limitDecimals(t, 4) })}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  prefix="R"
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <SelectField
                  label="Type"
                  value={l.revenue_type}
                  options={REVENUE_OPTIONS}
                  onSelect={(v) => update(l.key, { revenue_type: v as RevenueType })}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label="Tax"
                  value={l.tax_code}
                  options={taxOptions}
                  onSelect={(v) => update(l.key, { tax_code: v as TaxCode })}
                />
              </View>
            </View>

            <View className="flex-row items-end gap-3">
              <View className="flex-1">
                <TextField
                  label="Discount"
                  value={l.discount}
                  onChangeText={(t) => update(l.key, { discount: limitDecimals(t, 2) })}
                  keyboardType="decimal-pad"
                  placeholder={l.discount_mode === 'percent' ? '0' : '0,00'}
                />
              </View>
              <View style={{ width: 92, paddingBottom: 2 }}>
                <SegmentedControl
                  options={DISCOUNT_MODES}
                  value={l.discount_mode}
                  onChange={(m) => update(l.key, { discount_mode: m })}
                />
              </View>
            </View>

            <View className="flex-row items-center justify-between rounded-control bg-raised px-3 py-2.5">
              <View className="shrink pr-3">
                <Txt className="text-callout text-muted">Amount excl. VAT</Txt>
                {(discountShown > 0 || toNumber(a.vat) > 0) && (
                  <Txt className="mt-0.5 text-micro text-faint" numberOfLines={1}>
                    {[
                      discountShown > 0 ? `after −${money(a.discount)}` : null,
                      toNumber(a.vat) > 0 ? `VAT ${money(a.vat)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Txt>
                )}
              </View>
              <Mono className="text-body font-semibold text-fg">{money(a.net)}</Mono>
            </View>
          </Card>
        );
      })}

      <Button label="Add a line" icon="plus" variant="secondary" onPress={addLine} fullWidth />
    </View>
  );
}
