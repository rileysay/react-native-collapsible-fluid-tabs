import { Platform } from 'react-native';
import {
  scrollTo,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

const IS_IOS = Platform.OS === 'ios';

export function scrollToMountedRef(
  ref: AnimatedRef<any> | undefined,
  mounted: SharedValue<boolean> | undefined,
  x: number,
  y: number,
  animated: boolean
) {
  'worklet';
  // Reanimated 4.7 maps animated refs to non-callable shareables on the UI runtime.
  if (!ref || !mounted?.value) return false;
  scrollTo(ref, x, y, animated);
  return true;
}

/** Interrupt vertical momentum even when RN would skip an unchanged offset. */
export function stopScrollAtOffset(
  ref: AnimatedRef<any> | undefined,
  mounted: SharedValue<boolean> | undefined,
  y: number,
  maxOffset: number
) {
  'worklet';
  if (!ref || !mounted?.value) return false;
  if (IS_IOS) {
    // Leave bounce recovery to UIKit. A zero/unknown extent has no in-bounds
    // direction in which to nudge without creating overscroll of our own.
    if (
      !Number.isFinite(maxOffset) ||
      maxOffset <= 0 ||
      y < 0 ||
      y > maxOffset
    ) {
      return false;
    }
    // RN iOS returns before calling UIKit when the requested offset is equal.
    // Issue a distinct offset first, then restore the target in the same worklet.
    // Move toward zero for positive offsets to avoid nudging past the bottom.
    scrollTo(
      ref,
      0,
      y > 0 ? Math.max(0, y - 1) : Math.min(1, maxOffset),
      false
    );
  }
  scrollTo(ref, 0, y, false);
  return true;
}

/** AnimatedRef retains its last native tag after null; track attachment separately. */
export function setScrollRef<T>(
  ref: (instance: T | null) => unknown,
  mounted: SharedValue<boolean>,
  instance: T | null
): void {
  if (instance === null) {
    mounted.value = false;
    ref(null);
    return;
  }

  ref(instance);
  mounted.value = true;
}
