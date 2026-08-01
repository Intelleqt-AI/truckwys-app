import './global.css';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { ToastHost } from '@/lib/toast';
import { queryClient, startAppStateFocusBridge, startNetworkBridge } from '@/lib/queryClient';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// Keep the splash up until auth state is hydrated (RootNavigator hides it).
void SplashScreen.preventAutoHideAsync();

// Background/quit-state message handler. MUST be registered at module scope,
// outside any component: when a push wakes a killed app, React has not mounted
// yet and Firebase looks for this handler immediately.
//
// The OS already draws the notification (the backend sends a `notification`
// block), so there is nothing to display here — returning promptly keeps the
// wake-up cheap. The tap itself is handled by getInitialNotification() /
// onNotificationOpenedApp in usePushNotifications.
setBackgroundMessageHandler(getMessaging(), async () => {
  // Intentionally a no-op.
});

export default function App() {
  useEffect(() => {
    // Safety net: never let the splash hang if hydration errors out.
    const t = setTimeout(() => void SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(t);
  }, []);

  // Teach React Query what "focused" and "online" mean on a phone — without
  // these its refetch-on-focus and refetch-on-reconnect never fire at all.
  // Both replace the manager's single listener, so there's nothing to unwind.
  useEffect(() => {
    startAppStateFocusBridge();
    startNetworkBridge();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ErrorBoundary>
              <ThemedStatusBar />
              <RootNavigator />
              <ToastHost />
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
