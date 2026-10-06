import { useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppSheet, Icon, SheetScreen, Txt } from '@/components/ui';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useLedger } from '@/lib/useLedger';
import { useCompanyProfile } from '@/features/more/api';
import type { AppStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CashMovement } from './CashMovement';
import { CustomerStatement } from './CustomerStatement';
import { DebtorsAge } from './DebtorsAge';
import { ExpenseReport } from './ExpenseReport';
import { LaneMargin } from './LaneMargin';
import { ProfitLoss } from './ProfitLoss';
import { RevenueByCustomer } from './RevenueByCustomer';
import { RevenueByLane } from './RevenueByLane';
import { SalesByMonth } from './SalesByMonth';
import { VatReport } from './VatReport';
import { REPORTS, type ReportProps } from './library';
import { Partial, ReportExportContext, ReportState } from './ui';
import type { ReportExport } from './types';

type Props = NativeStackScreenProps<AppStackParamList, 'FinanceReport'>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * One report from the library. The shell loads the ledgers the report needs,
 * shows partial-load notes and load/error states, and owns the header's
 * "Export and print" menu; the report itself (controls, statement, tiles) is
 * drawn by its own component.
 */
export function ReportScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const id = route.params.report;
  const def = REPORTS.find((r) => r.id === id);
  const ledger = useLedger(def?.needs ?? []);
  const profile = useCompanyProfile();
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all((def?.needs ?? []).map((k) => queryClient.refetchQueries({ queryKey: [`ledger-${k}`] }))),
  );

  const exportRef = useRef<ReportExport | null>(null);
  const [menu, setMenu] = useState(false);
  // The tapped action waits for the sheet to finish leaving: iOS won't present
  // the print dialog or share sheet while this modal is still on its way out.
  const pending = useRef<(() => void) | null>(null);
  const run = (fn: () => void) => {
    pending.current = fn;
    setMenu(false);
  };
  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  const company = profile.data ?? null;
  const props: ReportProps | null = ledger.data
    ? {
        d: ledger.data,
        company,
        companyName: str(company?.company_name),
        vatNumber: str(company?.vat_number),
        openStatement: (customerId) => navigation.push('FinanceReport', { report: 'statement', customer: String(customerId) }),
        initialCustomer: route.params.customer,
        initialPeriod: route.params.period,
      }
    : null;

  const body = () => {
    if (!props) return null;
    switch (id) {
      case 'pl':
        return <ProfitLoss {...props} />;
      case 'sales':
        return <SalesByMonth {...props} />;
      case 'cash':
        return <CashMovement {...props} />;
      case 'debtors':
        return <DebtorsAge {...props} />;
      case 'statement':
        return <CustomerStatement {...props} />;
      case 'customers':
        return <RevenueByCustomer {...props} />;
      case 'lanes':
        return <RevenueByLane {...props} />;
      case 'margin':
        return <LaneMargin {...props} />;
      case 'expenses':
        return <ExpenseReport {...props} />;
      case 'vat':
        return <VatReport {...props} />;
      default:
        return null;
    }
  };

  const items: { label: string; icon: 'download' | 'share' | 'file'; onPress: () => void }[] = [
    { label: 'Export CSV', icon: 'download', onPress: () => exportRef.current?.csv() },
    { label: 'Print', icon: 'file', onPress: () => exportRef.current?.print() },
  ];

  return (
    <ReportExportContext.Provider value={exportRef}>
      <SheetScreen
        title={def?.title ?? 'Report'}
        onBack={() => navigation.goBack()}
        actionIcon={props ? 'more' : undefined}
        actionLabel="Export and print"
        onAction={props ? () => setMenu(true) : undefined}
        onRefresh={onRefresh}
        refreshing={refreshing}
      >
        {props ? (
          <>
            <Partial notes={props.d.partial} />
            {body()}
          </>
        ) : (
          <ReportState loading={ledger.loading && !ledger.error} error={ledger.error} onRetry={ledger.retry} />
        )}
      </SheetScreen>
      <AppSheet open={menu} onClose={() => setMenu(false)} onDismissed={runPending}>
        <View className="px-3 pt-1">
          {items.map((a) => (
            <TouchableOpacity
              key={a.label}
              onPress={() => run(a.onPress)}
              activeOpacity={0.6}
              accessibilityRole="button"
              className="min-h-[48px] flex-row items-center gap-3 rounded-chip px-2.5 py-2"
            >
              <Icon name={a.icon} size={18} color={colors.fg} />
              <Txt className="text-body">{a.label}</Txt>
            </TouchableOpacity>
          ))}
        </View>
      </AppSheet>
    </ReportExportContext.Provider>
  );
}
