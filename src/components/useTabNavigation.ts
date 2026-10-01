import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
  type RefObject,
} from 'react';
import { Platform } from 'react-native';
import {
  Easing,
  cancelAnimation,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnUISync } from 'react-native-worklets';
import { clampTabIndex } from '../utils/paging';
import type { TabsRef } from '../types';
import { scrollToMountedRef } from '../utils/scrollRef';

// Timed (non-spring) snap used for programmatic tab changes (tap / imperative
// setIndex): a base duration plus a per-page increment, so jumping across more
// pages animates a little longer instead of snapping at the same speed.
const SNAP_DURATION_BASE = 250;

const SNAP_DURATION_PER_PAGE = 50;

const SCROLL_TO_TOP_DURATION = 280;

export function useTabNavigation({
  controlledIndex,
  lastNotifiedIndex,
  containerRef,
  tabCount,
  activeIndex,
  pageWidth,
  translateX,
  isPanning,
  nativePaging,
  reduceMotionSV,
  syncLists,
  alignList,
  stopList,
  perPageScrollY,
  scrollY,
  scrollToTopIndex,
  scrollToTopOffset,
  cancelScrollToTop,
  headerHeight,
  listRefs,
  listMounted,
  scrollToTopOnTabPress,
  handleIndexChange,
}: {
  controlledIndex: number | undefined;
  lastNotifiedIndex: RefObject<number | undefined>;
  containerRef: Ref<TabsRef> | undefined;
  tabCount: number;
  activeIndex: SharedValue<number>;
  pageWidth: SharedValue<number>;
  translateX: SharedValue<number>;
  isPanning: SharedValue<boolean>;
  nativePaging: SharedValue<boolean>;
  reduceMotionSV: SharedValue<boolean>;
  syncLists: (excludeIndex?: number) => void;
  alignList: (index: number, target: number) => void;
  stopList: (index: number, target: number) => boolean;
  perPageScrollY: SharedValue<number>[];
  scrollY: SharedValue<number>;
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  cancelScrollToTop: () => void;
  headerHeight: SharedValue<number>;
  listRefs: AnimatedRef<any>[];
  listMounted: SharedValue<boolean>[];
  scrollToTopOnTabPress: boolean;
  handleIndexChange: (index: number, notifyParent?: boolean) => void;
}) {
  const prepareForIndexChange = useCallback(
    (currentIndex: number, nextIndex: number) => {
      'worklet';
      // Clamped for the same reason as syncLists: never propagate a
      // synthetic negative pull offset into the pages' scroll state.
      const sourceY = Math.max(0, scrollY.value);
      const collapseRange = headerHeight.value;

      for (let i = 0; i < listRefs.length; i++) {
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) continue;

        let target: number | null = null;
        if (sourceY < collapseRange) {
          target = sourceY;
        } else if (y.value < collapseRange) {
          target = collapseRange;
        } else if (i === currentIndex) {
          target = y.value;
        }

        if (target === null) continue;
        if (target !== y.value) {
          alignList(i, target);
        } else if (i === currentIndex) {
          // A same-offset scroll is skipped natively, so stop the outgoing
          // page's momentum explicitly. When the stop declines (overscrolled,
          // unmeasured or unmounted), the page stays put and UIKit finishes
          // any bounce, as an unchanged alignment always did.
          stopList(i, target);
        }
      }

      const nextY = perPageScrollY[nextIndex];
      if (nextY) scrollY.value = nextY.value;
    },
    [alignList, stopList, scrollY, headerHeight, listRefs, perPageScrollY]
  );

  const goToIndex = useCallback(
    (index: number, animated: boolean = true, notifyParent: boolean = true) => {
      const clamped = clampTabIndex(index, tabCount);
      // Start navigation in one UI task. Separate RN-side shared-value writes
      // can interleave with a gesture or a frame from the previous animation.
      const navigate = () => {
        'worklet';
        const current = activeIndex.value;
        const distance = Math.abs(clamped - current);
        const target = -clamped * pageWidth.value;
        cancelScrollToTop();
        // A release/cancel event from an older swipe must not replace this
        // tap/imperative animation with a second spring to another target.
        isPanning.value = false;
        nativePaging.value = true;
        cancelAnimation(translateX);
        activeIndex.value = clamped;
        prepareForIndexChange(current, clamped);

        if (!animated || reduceMotionSV.value) {
          translateX.value = target;
          syncLists(clamped);
          nativePaging.value = false;
        } else {
          const duration =
            SNAP_DURATION_BASE + distance * SNAP_DURATION_PER_PAGE;
          translateX.value = withTiming(
            target,
            { duration, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (!finished) return;
              syncLists(clamped);
              nativePaging.value = false;
            }
          );
        }
      };
      if (Platform.OS === 'web') {
        navigate();
      } else {
        runOnUISync(navigate);
      }
      handleIndexChange(clamped, notifyParent);
    },
    [
      activeIndex,
      translateX,
      isPanning,
      nativePaging,
      pageWidth,
      syncLists,
      prepareForIndexChange,
      handleIndexChange,
      tabCount,
      reduceMotionSV,
      cancelScrollToTop,
    ]
  );

  const scrollActiveTabToTop = useCallback(() => {
    const scrollTop = () => {
      'worklet';
      cancelScrollToTop();
      const i = clampTabIndex(activeIndex.value, tabCount);
      const ref = listRefs[i];
      const y = perPageScrollY[i];
      if (!ref || !y || !listMounted[i]?.value) return;
      scrollToMountedRef(ref, listMounted[i], 0, y.value, false);
      cancelAnimation(scrollToTopOffset);
      cancelAnimation(scrollY);
      const currentY = Math.max(0, y.value);
      scrollToTopIndex.value = i;
      if (currentY <= 0 || reduceMotionSV.value) {
        scrollToTopOffset.value = 0;
        y.value = 0;
        if (activeIndex.value === i) scrollY.value = 0;
        scrollToMountedRef(ref, listMounted[i], 0, 0, false);
        scrollToTopIndex.value = -1;
        return;
      }
      scrollToTopOffset.value = currentY;
      if (activeIndex.value === i) scrollY.value = currentY;
      const timing = {
        duration: SCROLL_TO_TOP_DURATION,
        easing: Easing.out(Easing.quad),
      };
      scrollToTopOffset.value = withTiming(0, timing, (finished) => {
        if (!finished || scrollToTopIndex.value !== i) return;
        y.value = 0;
        if (activeIndex.value === i) scrollY.value = 0;
        scrollToMountedRef(ref, listMounted[i], 0, 0, false);
        scrollToTopIndex.value = -1;
      });
      if (activeIndex.value === i) {
        scrollY.value = withTiming(0, timing);
      }
    };
    if (Platform.OS === 'web') {
      scrollTop();
    } else {
      runOnUISync(scrollTop);
    }
  }, [
    tabCount,
    activeIndex,
    listRefs,
    listMounted,
    perPageScrollY,
    scrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    reduceMotionSV,
    cancelScrollToTop,
  ]);

  const handleTabPress = useCallback(
    (index: number) => {
      if (
        clampTabIndex(index, tabCount) ===
        clampTabIndex(activeIndex.value, tabCount)
      ) {
        if (scrollToTopOnTabPress) scrollActiveTabToTop();
        return;
      }
      goToIndex(index, true);
    },
    [
      goToIndex,
      scrollToTopOnTabPress,
      scrollActiveTabToTop,
      activeIndex,
      tabCount,
    ]
  );

  const previousControlledIndex = useRef(controlledIndex);
  useLayoutEffect(() => {
    const previous = previousControlledIndex.current;
    previousControlledIndex.current = controlledIndex;
    // A changed callback/config can rerun this effect without a new command.
    if (Object.is(previous, controlledIndex)) return;
    if (controlledIndex == null) {
      lastNotifiedIndex.current = undefined;
      return;
    }
    const clamped = clampTabIndex(controlledIndex, tabCount);
    const isAcknowledgement =
      previous != null && clamped === lastNotifiedIndex.current;
    lastNotifiedIndex.current = undefined;
    // React may acknowledge tab 3 after a second swipe already targets tab 4.
    // That echo must not cancel the newer gesture or its settling animation.
    if (isAcknowledgement) return;
    if (clamped !== clampTabIndex(activeIndex.value, tabCount)) {
      goToIndex(clamped, true, false);
    }
  }, [controlledIndex, tabCount, activeIndex, goToIndex, lastNotifiedIndex]);

  useImperativeHandle(
    containerRef,
    () => ({
      setIndex: (index: number, animated: boolean = true) =>
        goToIndex(index, animated),
      getIndex: () => clampTabIndex(activeIndex.value, tabCount),
    }),
    [goToIndex, activeIndex, tabCount]
  );

  return handleTabPress;
}
