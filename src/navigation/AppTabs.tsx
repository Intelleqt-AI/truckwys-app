import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TabParamList } from './types';
import { TabBar } from './TabBar';
import { HomeScreen } from '@/features/home/HomeScreen';
import { BookingsScreen } from '@/features/bookings/BookingsScreen';
import { FleetScreen } from '@/features/fleet/FleetScreen';
import { FinanceScreen } from '@/features/finance/FinanceScreen';
import { useRole, visibleTabs } from '@/lib/access';

const Tab = createBottomTabNavigator<TabParamList>();

export function AppTabs() {
  // Drivers only get Home + Bookings; viewers lose Finance (web NAV_ACCESS).
  const role = useRole();
  const allowed = visibleTabs(role);
  const shows = (name: string) => allowed.includes(name);

  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      {shows('Fleet') && <Tab.Screen name="Fleet" component={FleetScreen} />}
      {shows('Finance') && <Tab.Screen name="Finance" component={FinanceScreen} />}
    </Tab.Navigator>
  );
}
