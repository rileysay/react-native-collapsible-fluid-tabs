import { useCallback, useMemo } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
  type ScrollHandlerProcessed,
  type SharedValue,
} from 'react-native-reanimated';
import { useHeaderScroll } from './useHeaderScroll';
import { scrollToMountedRef, stopScrollAtOffset } from '../utils/scrollRef';
import {
  INITIAL_SCROLL_METRICS,
  type ListScrollMetrics,
} from '../utils/scrollMetrics';

export function usePagerListState({
  tabCount,
  activeIndex,
  scrollY,
  headerHeight,
  momentumActive,
  usesCustomPullSV,
  reduceMotionSV,
}: {
  tabCount: number;
  activeIndex: SharedValue<number>;
  scrollY: SharedValue<number>;
  headerHeight: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  usesCustomPullSV: SharedValue<boolean>;
  reduceMotionSV: SharedValue<boolean>;
}) {
  const scrollToTopIndex = useSharedValue(-1);
  const scrollToTopOffset = useSharedValue(0);
  // Tab count is stable for the lifetime of ContainerImpl because the outer
  // Container remounts it on count changes, so these hook loops keep a stable
  // shape while still giving every page its own animated ref and scroll value.
  const nextListRefs: AnimatedRef<any>[] = [];
  const nextPerPageScrollY: SharedValue<number>[] = [];
  const nextListMounted: SharedValue<boolean>[] = [];
  const nextScrollMetrics: SharedValue<ListScrollMetrics>[] = [];
  const nextPendingScrollY: SharedValue<number | null>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    nextListRefs.push(useAnimatedRef<Animated.FlatList<any>>());
    nextPerPageScrollY.push(useSharedValue(0));
    nextListMounted.push(useSharedValue(false));
    nextScrollMetrics.push(useSharedValue({ ...INITIAL_SCROLL_METRICS }));
    nextPendingScrollY.push(useSharedValue<number | null>(null));
    /* eslint-enable react-hooks/rules-of-hooks */
  }
  // Hook results are stable for this component's lifetime. Keep their array
  // identities stable too, otherwise every momentum toggle defeats the memoized
  // content boundary by passing a newly allocated perPageScrollY prop.
  const {
    listRefs,
    perPageScrollY,
    listMounted,
    listScrollMetrics,
    pendingScrollY,
  } = useMemo(
    () => ({
      listRefs: nextListRefs,
      perPageScrollY: nextPerPageScrollY,
      listMounted: nextListMounted,
      listScrollMetrics: nextScrollMetrics,
      pendingScrollY: nextPendingScrollY,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

  const headerScroll = useHeaderScroll({
    activeIndex,
    listRefs,
    listMounted,
    listScrollMetrics,
    perPageScrollY,
    scrollY,
    usesCustomPullSV,
    reduceMotionSV,
  });

  const scrollHandlers: ScrollHandlerProcessed[] = [];
  for (let i = 0; i < tabCount; i++) {
    const pageScrollY = perPageScrollY[i]!;
    /* eslint-disable react-hooks/rules-of-hooks */
    scrollHandlers.push(
      useAnimatedScrollHandler({
        onBeginDrag: (e) => {
          'worklet';
          if (headerScroll.index.value === i) {
            headerScroll.cancel(false);
            pageScrollY.value = e.contentOffset.y;
            if (activeIndex.value === i) scrollY.value = e.contentOffset.y;
          }
          if (scrollToTopIndex.value !== i) return;
          // The finger owns the native offset now. Stop both animated signals
          // without issuing another scroll command that could fight the drag.
          scrollToTopIndex.value = -1;
          cancelAnimation(scrollToTopOffset);
          cancelAnimation(scrollY);
          pageScrollY.value = e.contentOffset.y;
          if (activeIndex.value === i) scrollY.value = e.contentOffset.y;
        },
        onScroll: (e) => {
          'worklet';
          if (
            pendingScrollY[i]!.value !== null ||
            scrollToTopIndex.value === i ||
            headerScroll.index.value === i
          )
            return;
          const nextY = e.contentOffset.y;
          pageScrollY.value = nextY;
          if (activeIndex.value === i) {
            const preserveCustomPull =
              usesCustomPullSV.value && scrollY.value < 0 && nextY <= 1;
            if (!preserveCustomPull) {
              scrollY.value = nextY;
            }
          }
        },
        onMomentumBegin: () => {
          'worklet';
          if (activeIndex.value === i) {
            momentumActive.value = true;
          }
        },
        onMomentumEnd: () => {
          'worklet';
          // Unguarded: only one list can be flinging, and during a page swipe
          // the end event may arrive after activeIndex already changed.
          momentumActive.value = false;
        },
      })
    );
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  for (let i = 0; i < tabCount; i++) {
    const ref = listRefs[i]!;
    /* eslint-disable react-hooks/rules-of-hooks */
    useAnimatedReaction(
      () => {
        'worklet';
        return {
          pendingOffset: pendingScrollY[i]!.value,
          mounted: listMounted[i]!.value,
          metrics: listScrollMetrics[i]!.value,
        };
      },
      ({ pendingOffset, mounted, metrics }) => {
        'worklet';
        if (
          pendingOffset === null ||
          !mounted ||
          metrics.viewportHeight <= 0 ||
          metrics.contentHeight <= 0
        )
          return;
        // A lazy page cannot accept its offset until both its native view and
        // content geometry exist. Keep the header at the requested offset in
        // the meantime, then respect any explicit short-content height limit.
        const target = Math.min(
          pendingOffset,
          Math.max(0, metrics.contentHeight - metrics.viewportHeight)
        );
        if (!scrollToMountedRef(ref, listMounted[i], 0, target, false)) return;
        perPageScrollY[i]!.value = target;
        if (activeIndex.value === i) scrollY.value = target;
        pendingScrollY[i]!.value = null;
      }
    );
    useAnimatedReaction(
      () => {
        'worklet';
        return scrollToTopIndex.value === i ? scrollToTopOffset.value : null;
      },
      (target) => {
        'worklet';
        if (target == null) return;
        scrollToMountedRef(ref, listMounted[i], 0, target, false);
      }
    );
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  const alignList = useCallback(
    (index: number, target: number) => {
      'worklet';
      const pending = pendingScrollY[index]!;
      const metrics = listScrollMetrics[index]?.value;
      const measured =
        !!metrics && metrics.viewportHeight > 0 && metrics.contentHeight > 0;
      // Same readiness and range policy as a lazily mounted page: a list whose
      // geometry is known takes a clamped offset now, and any other list keeps
      // the logical offset pending until it is mounted and measured.
      const applied = measured
        ? Math.min(
            target,
            Math.max(0, metrics.contentHeight - metrics.viewportHeight)
          )
        : target;
      if (
        pending.value !== null ||
        !measured ||
        !scrollToMountedRef(
          listRefs[index],
          listMounted[index],
          0,
          applied,
          false
        )
      ) {
        pending.value = target;
        // Unmounted pages still need a logical offset: navigation reads it
        // before React mounts the page and its native list becomes measurable.
        perPageScrollY[index]!.value = target;
        return;
      }
      perPageScrollY[index]!.value = applied;
    },
    [listRefs, listMounted, listScrollMetrics, pendingScrollY, perPageScrollY]
  );

  // Stop a page's native momentum at `target`. iOS skips a scroll to the
  // current offset, so a same-offset alignment alone would not stop it.
  const stopList = useCallback(
    (index: number, target: number) => {
      'worklet';
      const ref = listRefs[index];
      const y = perPageScrollY[index];
      if (!ref || !y) return false;
      const metrics = listScrollMetrics[index]?.value;
      const maxOffset =
        metrics && metrics.viewportHeight > 0
          ? Math.max(0, metrics.contentHeight - metrics.viewportHeight)
          : 0;
      if (!stopScrollAtOffset(ref, listMounted[index], target, maxOffset)) {
        return false;
      }
      y.value = target;
      return true;
    },
    [listRefs, listMounted, listScrollMetrics, perPageScrollY]
  );

  // Interrupt native momentum before synchronizing pages for a swipe.
  const freezeLists = useCallback(() => {
    'worklet';
    for (let i = 0; i < listRefs.length; i++) {
      const y = perPageScrollY[i];
      if (!listRefs[i] || !y) continue;
      stopList(
        i,
        scrollToTopIndex.value === i ? scrollToTopOffset.value : y.value
      );
    }
  }, [listRefs, perPageScrollY, scrollToTopIndex, scrollToTopOffset, stopList]);

  const cancelScrollToTop = useCallback(() => {
    'worklet';
    // Both forms of programmatic scrolling yield to navigation or a finger.
    headerScroll.cancel();
    const i = scrollToTopIndex.value;
    if (i < 0 || i >= listRefs.length) return;
    cancelAnimation(scrollToTopOffset);
    cancelAnimation(scrollY);

    const ref = listRefs[i];
    const y = perPageScrollY[i];
    const target = Math.max(0, scrollToTopOffset.value);
    if (ref && y && scrollToMountedRef(ref, listMounted[i], 0, target, false)) {
      y.value = target;
      if (activeIndex.value === i) scrollY.value = target;
    }
    scrollToTopIndex.value = -1;
  }, [
    activeIndex,
    headerScroll,
    listRefs,
    listMounted,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    scrollY,
  ]);

  const syncLists = useCallback(
    (excludeIndex: number = -1) => {
      'worklet';
      // Clamp: a negative scrollY is overscroll (custom pull / iOS bounce),
      // not a real list position — parking pages at it would leave a stuck
      // pulled-down state on arrival (the list emits no events until touched).
      const sourceY = Math.max(0, scrollY.value);
      for (let i = 0; i < listRefs.length; i++) {
        if (i === excludeIndex) continue;
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) continue;
        const target =
          sourceY < headerHeight.value
            ? sourceY
            : y.value < headerHeight.value
              ? headerHeight.value
              : null;
        // freezeLists/prepareForIndexChange handle momentum cancellation.
        // Alignment itself needs no native command when the offset matches.
        if (target !== null && target !== y.value) {
          alignList(i, target);
        }
      }
    },
    [alignList, headerHeight, listRefs, perPageScrollY, scrollY]
  );

  return {
    listRefs,
    listMounted,
    listScrollMetrics,
    headerScroll,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    scrollHandlers,
    freezeLists,
    stopList,
    cancelScrollToTop,
    syncLists,
    alignList,
  };
}
