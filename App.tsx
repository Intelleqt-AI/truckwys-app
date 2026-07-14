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
import { queryClient } from '@/lib/queryClient';

// Keep the splash up until auth state is hydrated (RootNavigator hides it).
void SplashScreen.preventAutoHideAsync();

export default function App() {
  useEffect(() => {
    // Safety net: never let the splash hang if hydration errors out.
    const t = setTimeout(() => void SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(t);
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
