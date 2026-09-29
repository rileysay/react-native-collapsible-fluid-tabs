import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type {
  NativeHeaderScrollHostProps,
  NativeHeaderScrollPageProps,
  NativeHeaderScrollViews,
} from 'react-native-collapsible-fluid-tabs';

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<{
        isSupported: boolean;
        capabilityVersion: number;
      }>('FluidTabsNativeScroll')
    : null;

/**
 * The native host and page views, or null when this build does not include
 * the module (Android, web, or an iOS client built before it was added).
 */
export const nativeHeaderScrollViews: NativeHeaderScrollViews | null =
  native?.isSupported === true && native.capabilityVersion === 1
    ? {
        Host: requireNativeView<NativeHeaderScrollHostProps>(
          'FluidTabsNativeScroll',
          'FluidTabsNativeScrollHost'
        ),
        Page: requireNativeView<NativeHeaderScrollPageProps>(
          'FluidTabsNativeScroll',
          'FluidTabsNativeScrollPage'
        ),
      }
    : null;
