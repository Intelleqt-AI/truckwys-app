import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/ThemeProvider';

// Light content on the dark canvas; dark content in light theme.
export function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}
