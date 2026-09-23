import {
  scrollTo,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

export function scrollToMountedRef(
  ref: AnimatedRef<any> | undefined,
  mounted: SharedValue<boolean> | undefined,
  x: number,
  y: number,
  animated: boolean
) {
  'worklet';
  if (!ref || !mounted?.value || !ref()) return false;
  scrollTo(ref, x, y, animated);
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
