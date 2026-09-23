import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const subscribe = () => () => {};
const getServerSnapshot = () => 0;

function getPreviewTopInset() {
  try {
    const value = Number(
      window.frameElement?.getAttribute('data-phone-safe-area-top')
    );
    return Number.isFinite(value) && value > 0 && value <= 120 ? value : 0;
  } catch {
    // A cross-origin embed cannot inspect its parent frame.
    return 0;
  }
}

export function PhonePreviewSafeArea({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const previewTop = useSyncExternalStore(
    subscribe,
    getPreviewTopInset,
    getServerSnapshot
  );
  const value = useMemo(
    () => ({ ...insets, top: Math.max(insets.top, previewTop) }),
    [insets, previewTop]
  );

  // The docs frame draws a notch, while the browser reports no safe area.
  // Override the context, since a web SafeAreaProvider remeasures env() as zero.
  return (
    <SafeAreaInsetsContext.Provider value={value}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
}
