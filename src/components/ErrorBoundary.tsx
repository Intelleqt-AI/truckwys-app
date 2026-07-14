import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { Txt, Button } from '@/components/ui';

// Top-level guard so an unexpected render error shows a recoverable screen
// instead of a white crash (App Store requirement: no hard crashes).
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    if (__DEV__) console.error('Uncaught error:', error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-bg-deep px-8">
          <Txt className="text-title font-semibold text-fg">Something went wrong</Txt>
          <Txt className="text-center text-callout text-muted">
            The app hit an unexpected error. Restart to continue.
          </Txt>
          <Button label="Try again" onPress={() => this.setState({ hasError: false })} />
        </View>
      );
    }
    return this.props.children;
  }
}
