import { Platform } from 'react-native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import type { AppStackParamList } from './types';
import { useTheme } from '@/theme/ThemeProvider';
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
import { MoreScreen } from '@/features/more/MoreScreen';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  const { colors, scheme } = useTheme();

  // Native iOS large-title header with a Liquid Glass blur bar and the system
  // back button (chevron + previous screen name + interactive swipe-back).
  // Each screen's SheetScreen sets its headerTitle / headerRight at runtime.
  const detailHeader: NativeStackNavigationOptions = {
    headerShown: true,
    headerLargeTitle: true,
    headerTransparent: true,
    headerBlurEffect: scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterial',
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.fg },
    headerLargeTitleStyle: { color: colors.fg },
    headerStyle: { backgroundColor: 'transparent' },
    headerBackButtonDisplayMode: 'default',
    headerTitle: '',
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgDeep },
        // Native iOS push with parallax on both platforms; swipe-back from
        // anywhere on iOS (Facebook/Twitter feel).
        animation: Platform.OS === 'ios' ? 'default' : 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="Tabs" component={AppTabs} />

      {/* Detail overlays — native push with native large-title header + back */}
      <Stack.Group screenOptions={detailHeader}>
        <Stack.Screen name="More" component={MoreScreen} />
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

      {/* Modal (slide up) — opaque native header, inline title; SheetScreen adds an X close */}
      <Stack.Group
        screenOptions={{
          ...detailHeader,
          presentation: 'modal',
          headerLargeTitle: false,
          headerTransparent: false,
          headerBlurEffect: undefined,
          headerStyle: { backgroundColor: colors.bgDeep },
        }}
      >
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
