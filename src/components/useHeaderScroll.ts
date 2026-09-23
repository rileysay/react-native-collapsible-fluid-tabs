import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { scrollToMountedRef } from '../utils/scrollRef';
import type { ListScrollMetrics } from '../utils/scrollMetrics';
import { getScrollMomentum } from '../utils/scrollMomentum';

const IS_ANDROID = Platform.OS === 'android';

type Options = {
  activeIndex: SharedValue<number>;
  listRefs: AnimatedRef<any>[];
  listMounted: SharedValue<boolean>[];
  listScrollMetrics: SharedValue<ListScrollMetrics>[];
  perPageScrollY: SharedValue<number>[];
  scrollY: SharedValue<number>;
  usesCustomPullSV: SharedValue<boolean>;
  reduceMotionSV: SharedValue<boolean>;
};

/** Drives the list and header together for chrome drags and web mouse input. */
export function useHeaderScroll({
  activeIndex,
  listRefs,
  listMounted,
  listScrollMetrics,
  perPageScrollY,
  scrollY,
  usesCustomPullSV,
  reduceMotionSV,
}: Options) {
  const index = useSharedValue(-1);
  const offset = useSharedValue(0);
  const dragging = useSharedValue(false);
  const generation = useSharedValue(0);

  const canScroll = useCallback(() => {
    'worklet';
    const i = activeIndex.value;
    const metrics = listScrollMetrics[i]?.value;
    return (
      !!listMounted[i]?.value &&
      !!metrics?.enabled &&
      metrics.viewportHeight > 0
    );
  }, [activeIndex, listMounted, listScrollMetrics]);
  const maxOffset = useCallback(() => {
    'worklet';
    const metrics = listScrollMetrics[activeIndex.value]?.value;
    return metrics
      ? Math.max(0, metrics.contentHeight - metrics.viewportHeight)
      : 0;
  }, [activeIndex, listScrollMetrics]);
  const drive = useCallback(
    (i: number, value: number) => {
      'worklet';
      const y = Math.max(0, Math.min(maxOffset(), value));
      if (scrollToMountedRef(listRefs[i], listMounted[i], 0, y, false)) {
        perPageScrollY[i]!.value = y;
        if (!(usesCustomPullSV.value && y === 0 && scrollY.value < 0)) {
          scrollY.value = y;
        }
      }
      return y;
    },
    [
      listMounted,
      listRefs,
      maxOffset,
      perPageScrollY,
      scrollY,
      usesCustomPullSV,
    ]
  );
  const cancel = useCallback(
    (commit = true) => {
      'worklet';
      generation.value += 1;
      cancelAnimation(offset);
      if (commit && index.value === activeIndex.value)
        drive(index.value, offset.value);
      index.value = -1;
      dragging.value = false;
    },
    [activeIndex, dragging, drive, generation, index, offset]
  );
  const begin = useCallback(() => {
    'worklet';
    cancel();
    if (!canScroll()) return false;
    const i = activeIndex.value;
    index.value = i;
    dragging.value = true;
    offset.value = drive(i, perPageScrollY[i]?.value ?? 0);
    return true;
  }, [
    activeIndex,
    canScroll,
    cancel,
    dragging,
    drive,
    index,
    offset,
    perPageScrollY,
  ]);
  const move = useCallback(
    (value: number) => {
      'worklet';
      if (index.value !== activeIndex.value || !canScroll()) return;
      offset.value = drive(index.value, value);
    },
    [activeIndex, canScroll, drive, index, offset]
  );
  const finish = useCallback(
    (velocity: number) => {
      'worklet';
      if (index.value < 0 || index.value !== activeIndex.value) return;
      // Gesture release can arrive before the invalidation reaction. A disabled
      // or detached list must not start another trajectory in that interval.
      if (!canScroll()) {
        cancel(false);
        return;
      }
      dragging.value = false;
      const limit = maxOffset();
      if (reduceMotionSV.value || Math.abs(velocity) < 20 || limit === 0) {
        cancel();
        return;
      }
      const owner = index.value;
      const token = generation.value;
      const motion = getScrollMomentum({
        position: offset.value,
        velocity,
        maxOffset: limit,
        deceleration: listScrollMetrics[owner]!.value.deceleration,
        android: IS_ANDROID,
      });
      if (!motion) {
        cancel();
        return;
      }
      const { target, duration, easing } = motion;
      offset.value = withTiming(target, { duration, easing }, (finished) => {
        if (
          !finished ||
          generation.value !== token ||
          index.value !== owner ||
          activeIndex.value !== owner
        )
          return;
        drive(owner, target);
        index.value = -1;
      });
    },
    [
      activeIndex,
      canScroll,
      cancel,
      dragging,
      drive,
      generation,
      index,
      listScrollMetrics,
      maxOffset,
      offset,
      reduceMotionSV,
    ]
  );

  useAnimatedReaction(
    () => {
      const i = index.value;
      return i < 0
        ? null
        : {
            i,
            offset: offset.value,
            dragging: dragging.value,
            valid: i === activeIndex.value && canScroll(),
            limit: maxOffset(),
          };
    },
    (current) => {
      'worklet';
      if (!current) return;
      if (!current.valid) {
        cancel(false);
      } else if (current.offset > current.limit) {
        // Content can shrink while a glide is running. Commit the new bound
        // and relinquish ownership; the next reaction sees an idle controller.
        drive(current.i, current.limit);
        cancel(false);
      } else if (!current.dragging) {
        drive(current.i, current.offset);
      }
    }
  );

  return useMemo(
    () => ({
      index,
      offset,
      canScroll,
      maxOffset,
      begin,
      move,
      finish,
      cancel,
    }),
    [index, offset, canScroll, maxOffset, begin, move, finish, cancel]
  );
}

export type HeaderScroll = ReturnType<typeof useHeaderScroll>;
