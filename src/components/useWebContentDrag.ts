import type { usePanGesture } from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import type { DirectionConfig } from '../utils/gestureDirection';
import type { HeaderScroll } from './useHeaderScroll';

export type WebContentDragOptions = {
  directionConfig: DirectionConfig;
  activeIndex: SharedValue<number>;
  listRefs: AnimatedRef<any>[];
  headerScroll: HeaderScroll;
  cancelScrollToTop: () => void;
};

/** Native lists already handle finger dragging. */
export function useWebContentDrag(
  _options: WebContentDragOptions
): ReturnType<typeof usePanGesture> | undefined {
  return undefined;
}
