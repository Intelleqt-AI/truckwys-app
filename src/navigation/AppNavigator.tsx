import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AppStackParamList } from './types';
import { AppTabs } from './AppTabs';
import { LoadDetailScreen } from '@/features/bookings/LoadDetailScreen';
import { QuoteDetailScreen } from '@/features/bookings/QuoteDetailScreen';
import { CreateQuoteScreen } from '@/features/bookings/CreateQuoteScreen';
import { AIQuoteChatScreen } from '@/features/bookings/AIQuoteChatScreen';
import { VehicleDetailScreen } from '@/features/fleet/VehicleDetailScreen';
import { DriverDetailScreen } from '@/features/fleet/DriverDetailScreen';
import { InvoiceDetailScreen } from '@/features/finance/InvoiceDetailScreen';
import { CreateInvoiceScreen } from '@/features/finance/CreateInvoiceScreen';
import { AddExpenseScreen } from '@/features/finance/AddExpenseScreen';
import { AddVehicleScreen } from '@/features/fleet/AddVehicleScreen';
import { AddDriverScreen } from '@/features/fleet/AddDriverScreen';
import { AdvanceDetailScreen } from '@/features/more/AdvanceDetailScreen';
import { RiskScoresScreen } from '@/features/more/RiskScoresScreen';
import { CustomersScreen } from '@/features/customers/CustomersScreen';
import { CustomerDetailScreen } from '@/features/customers/CustomerDetailScreen';
import { AddCustomerScreen } from '@/features/customers/AddCustomerScreen';
import { InsightsScreen } from '@/features/more/InsightsScreen';
import { CapitalScreen } from '@/features/more/CapitalScreen';
import { ActivityScreen } from '@/features/more/ActivityScreen';
import { NotificationsScreen } from '@/features/more/NotificationsScreen';
import { CopilotScreen } from '@/features/more/CopilotScreen';
import { SettingsScreen } from '@/features/more/SettingsScreen';
import { StubScreen } from '@/features/more/StubScreen';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} />

      {/* Detail overlays (slide-over) */}
      <Stack.Group screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen name="LoadDetail" component={LoadDetailScreen} />
        <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
        <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
        <Stack.Screen name="DriverDetail" component={DriverDetailScreen} />
        <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
        <Stack.Screen name="Customers" component={CustomersScreen} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
        <Stack.Screen name="Insights" component={InsightsScreen} />
        <Stack.Screen name="Capital" component={CapitalScreen} />
        <Stack.Screen name="Activity" component={ActivityScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Copilot" component={CopilotScreen} />
        <Stack.Screen name="AIQuoteChat" component={AIQuoteChatScreen} />
        <Stack.Screen name="AdvanceDetail" component={AdvanceDetailScreen} />
        <Stack.Screen name="RiskScores" component={RiskScoresScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Stub" component={StubScreen} />
      </Stack.Group>

      {/* Modal (slide up) */}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="CreateQuote" component={CreateQuoteScreen} />
        <Stack.Screen name="AddCustomer" component={AddCustomerScreen} />
        <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} />
        <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
        <Stack.Screen name="AddVehicle" component={AddVehicleScreen} />
        <Stack.Screen name="AddDriver" component={AddDriverScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
