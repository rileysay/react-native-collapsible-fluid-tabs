import type { ComponentRef, Ref } from 'react';
import type { View } from 'react-native';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import type { HeaderScroll } from './useHeaderScroll';

export type WebWheelScrollOptions = {
  activeIndex: SharedValue<number>;
  perPageScrollY: SharedValue<number>[];
  listRefs: AnimatedRef<any>[];
  headerScroll: HeaderScroll;
  cancelScrollToTop: () => void;
  headerScrollEnabled: boolean;
  reduceMotion: boolean;
};

/** Native scroll events already update the header's shared values on UI. */
export function useWebWheelScroll(
  _options: WebWheelScrollOptions
): Ref<ComponentRef<typeof View>> | undefined {
  return undefined;
}
