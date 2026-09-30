import { Platform } from 'react-native';
import {
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

export function usePagerOffset({
  startIndex,
  activeIndex,
  translateX,
  pageWidth,
  tabCount,
}: {
  startIndex: number;
  activeIndex: SharedValue<number>;
  translateX: SharedValue<number>;
  pageWidth: SharedValue<number>;
  tabCount: number;
}) {
  const pagerOffset = useSharedValue(startIndex);
  useAnimatedReaction(
    () => {
      'worklet';
      if (pageWidth.value <= 0) return activeIndex.value;
      return Math.max(
        0,
        Math.min(-translateX.value / pageWidth.value, tabCount - 1)
      );
    },
    (offset) => {
      'worklet';
      pagerOffset.value = offset;
    },
    Platform.OS === 'web' ? [tabCount] : undefined
  );

  return pagerOffset;
}
