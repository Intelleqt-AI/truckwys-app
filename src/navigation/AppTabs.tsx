import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TabParamList } from './types';
import { TabBar } from './TabBar';
import { HomeScreen } from '@/features/home/HomeScreen';
import { BookingsScreen } from '@/features/bookings/BookingsScreen';
import { FleetScreen } from '@/features/fleet/FleetScreen';
import { FinanceScreen } from '@/features/finance/FinanceScreen';
import { MoreScreen } from '@/features/more/MoreScreen';

const Tab = createBottomTabNavigator<TabParamList>();

export function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Fleet" component={FleetScreen} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
