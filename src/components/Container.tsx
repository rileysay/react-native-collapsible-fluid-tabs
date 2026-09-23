import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type Ref,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  GestureDetector,
  GestureStateManager,
  InterceptingGestureDetector,
  useCompetingGestures,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnUISync, scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIndexContext, TabsContext } from '../context';
import { extractTabs, type ExtractedTab } from '../utils/children';
import { PULL_HOLD_OFFSET, type RefreshTabState } from '../utils/refresh';
import {
  clampTabIndex,
  collapseTranslateY,
  getHeaderScrollOffset,
  resolveSnapIndex,
  rubberBand,
} from '../utils/paging';
import type {
  ContainerProps,
  InternalTabsContextValue,
  TabBarRenderProps,
  TabsRef,
} from '../types';
import { DefaultTabBar } from './DefaultTabBar';
import { useCustomPullGesture } from './useCustomPullGesture';
import { useDirectionalPan } from './useDirectionalPan';
import { useHeaderScroll, type HeaderScroll } from './useHeaderScroll';
import { useWebContentDrag } from './useWebContentDrag';
import { useWebWheelScroll } from './useWebWheelScroll';
import { scrollToMountedRef } from '../utils/scrollRef';
import {
  INITIAL_SCROLL_METRICS,
  type ListScrollMetrics,
} from '../utils/scrollMetrics';
import {
  DEFAULT_SWIPE_ACTIVATION,
  DEFAULT_SWIPE_FAIL,
  DEFAULT_SWIPE_DIRECTION_RATIO,
} from '../utils/gestureDirection';

const DEFAULT_TAB_BAR_HEIGHT = 56;

// Native pager/pull handlers attach above both the page row and its sibling
// chrome overlays. Tab taps use virtual detectors under that intercepting
// root; each list hosts its own Native gesture on the scrollable component.
// Web attaches the pager to the stationary viewport and leaves list scrollers
// without a Native detector so their pointer drags can reach the pager.
const IS_WEB = Platform.OS === 'web';
// Width of the left-edge zone where the tab pan gesture refuses to activate,
// leaving room for iOS edge-swipe-back / Android gesture-nav.
const EDGE_SWIPE_MARGIN = 20;
// The Android host Native gesture lets ScrollView handle a momentum catch.
// On iOS we explicitly stop deceleration while the list recognizer waits for
// the pager's directional decision. This path still needs device coverage.
const IS_ANDROID = Platform.OS === 'android';
const NEEDS_EXPLICIT_GRAB_STOP = !IS_ANDROID;

// Android `stretch` pull-to-refresh: Android lists have no native bounce, so
// the Container drives the pull itself — a pan that only engages when the
// active list sits at its top writes negative values into scrollY (the same
// signal iOS overscroll produces), the chrome's existing stretch math rides
// down, and a custom indicator is revealed under the pinned bar. Distances
// are dp of *pull* (finger travel × resistance).
const DEFAULT_SPRING: Required<NonNullable<ContainerProps['springConfig']>> = {
  damping: 30,
  stiffness: 200,
  mass: 1,
  overshootClamping: true,
};

// Timed (non-spring) snap used for programmatic tab changes (tap / imperative
// setIndex): a base duration plus a per-page increment, so jumping across more
// pages animates a little longer instead of snapping at the same speed.
const SNAP_DURATION_BASE = 250;
const SNAP_DURATION_PER_PAGE = 50;
const SCROLL_TO_TOP_DURATION = 280;
function addMountedTabs(
  mounted: Set<number>,
  centerIndex: number,
  tabCount: number,
  preloadDistance: number
) {
  const clampedCenter = Math.max(0, Math.min(centerIndex, tabCount - 1));
  const start = Math.max(0, clampedCenter - preloadDistance);
  const end = Math.min(tabCount - 1, clampedCenter + preloadDistance);

  for (let i = start; i <= end; i++) {
    mounted.add(i);
  }
}

function createMountedTabs(
  centerIndex: number,
  tabCount: number,
  preloadDistance: number
) {
  const mounted = new Set<number>();
  addMountedTabs(mounted, centerIndex, tabCount, preloadDistance);
  return mounted;
}

/** Coordinates named tab pages, a collapsing header, and an optional pinned header. */
export const Container = forwardRef<TabsRef, ContainerProps>(
  function Container(props, ref) {
    const tabs = useMemo(() => extractTabs(props.children), [props.children]);
    // Per-tab state below is built with hook loops keyed on tab count. Remount
    // the implementation whenever tab identity or order changes so React never
    // sees a different number of hooks, and offsets/refs cannot migrate to a
    // different tab after reordering or replacing tabs at the same count.
    return (
      <ContainerImpl
        key={JSON.stringify(tabs.map((tab) => tab.key))}
        {...props}
        tabs={tabs}
        containerRef={ref}
      />
    );
  }
);

interface ContainerImplProps extends ContainerProps {
  tabs: ExtractedTab[];
  containerRef: Ref<TabsRef>;
}

function useMountedTabs({
  startIndex,
  tabCount,
  lazy,
  resolvedLazyPreloadDistance,
  activeIndex,
}: {
  startIndex: number;
  tabCount: number;
  lazy: boolean;
  resolvedLazyPreloadDistance: number;
  activeIndex: SharedValue<number>;
}) {
  const [mountedTabIndices, setMountedTabIndices] = useState(() =>
    createMountedTabs(
      startIndex,
      tabCount,
      lazy ? resolvedLazyPreloadDistance : tabCount
    )
  );

  const mountTabsAround = useCallback(
    (index: number) => {
      setMountedTabIndices((current) => {
        const next = new Set(current);
        addMountedTabs(
          next,
          index,
          tabCount,
          lazy ? resolvedLazyPreloadDistance : tabCount
        );
        return next.size === current.size ? current : next;
      });
    },
    [lazy, resolvedLazyPreloadDistance, tabCount]
  );

  useEffect(() => {
    mountTabsAround(Math.round(activeIndex.value));
  }, [activeIndex, mountTabsAround]);

  return { mountedTabIndices, mountTabsAround };
}

function usePagerListState({
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

  const scrollHandlers: any[] = [];
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
      if (
        pending.value !== null ||
        !scrollToMountedRef(
          listRefs[index],
          listMounted[index],
          0,
          target,
          false
        )
      ) {
        pending.value = target;
      }
      // Unmounted pages still need a logical offset: navigation reads it
      // before React mounts the page and its native list becomes measurable.
      perPageScrollY[index]!.value = target;
    },
    [listRefs, listMounted, pendingScrollY, perPageScrollY]
  );

  // Stop every list dead at its current offset. Kills background flings and
  // in-flight animated scrolls so no page drifts away from where syncLists put
  // it.
  const freezeLists = useCallback(() => {
    'worklet';
    for (let i = 0; i < listRefs.length; i++) {
      const ref = listRefs[i];
      const y = perPageScrollY[i];
      if (!ref || !y) continue;
      const target =
        scrollToTopIndex.value === i ? scrollToTopOffset.value : y.value;
      if (scrollToMountedRef(ref, listMounted[i], 0, target, false)) {
        y.value = target;
      }
    }
  }, [
    listRefs,
    listMounted,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
  ]);

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
    cancelScrollToTop,
    syncLists,
    alignList,
  };
}

function usePagerGestures({
  swipeEnabled,
  swipeActivationDistance,
  swipeFailDistance,
  swipeDirectionRatio,
  headerScrollEnabled,
  headerScroll,
  pagerPanHitSlop,
  swipeGestureTopInset,
  tabBarHeight,
  headerHeight,
  scrollToTopIndex,
  scrollToTopOffset,
  pullDownBehavior,
  pinnedTotal,
  spring,
  tabCount,
  activeIndex,
  momentumActive,
  grabCatch,
  listRefs,
  listMounted,
  perPageScrollY,
  isPanning,
  startX,
  translateX,
  pageWidth,
  reduceMotionSV,
  freezeLists,
  cancelScrollToTop,
  syncLists,
  scrollY,
  handleIndexChange,
  usesCustomPullSV,
  isPulling,
  refreshingHold,
  refreshStates,
  triggerActiveRefresh,
}: {
  swipeEnabled: boolean;
  swipeActivationDistance: number;
  swipeFailDistance: number;
  swipeDirectionRatio: number;
  headerScrollEnabled: boolean;
  headerScroll: HeaderScroll;
  pagerPanHitSlop: { left: number; top?: number };
  swipeGestureTopInset: ContainerProps['swipeGestureTopInset'];
  tabBarHeight: number;
  headerHeight: SharedValue<number>;
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  pullDownBehavior: ContainerProps['pullDownBehavior'];
  pinnedTotal: number;
  spring: Required<NonNullable<ContainerProps['springConfig']>>;
  tabCount: number;
  activeIndex: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  grabCatch: SharedValue<boolean>;
  listRefs: AnimatedRef<any>[];
  listMounted: SharedValue<boolean>[];
  perPageScrollY: SharedValue<number>[];
  isPanning: SharedValue<boolean>;
  startX: SharedValue<number>;
  translateX: SharedValue<number>;
  pageWidth: SharedValue<number>;
  reduceMotionSV: SharedValue<boolean>;
  freezeLists: () => void;
  cancelScrollToTop: () => void;
  syncLists: (excludeIndex?: number) => void;
  scrollY: SharedValue<number>;
  handleIndexChange: (index: number, notifyParent?: boolean) => void;
  usesCustomPullSV: SharedValue<boolean>;
  isPulling: SharedValue<boolean>;
  refreshingHold: SharedValue<boolean>;
  refreshStates: SharedValue<RefreshTabState[]>;
  triggerActiveRefresh: (index: number) => void;
}) {
  const directionConfig = useMemo(
    () => ({
      horizontalDistance: Number.isFinite(swipeActivationDistance)
        ? Math.max(0, swipeActivationDistance)
        : DEFAULT_SWIPE_ACTIVATION,
      verticalDistance: Number.isFinite(swipeFailDistance)
        ? Math.max(0, swipeFailDistance)
        : DEFAULT_SWIPE_FAIL,
      ratio: Number.isFinite(swipeDirectionRatio)
        ? Math.max(1, swipeDirectionRatio)
        : DEFAULT_SWIPE_DIRECTION_RATIO,
    }),
    [swipeActivationDistance, swipeFailDistance, swipeDirectionRatio]
  );
  const pagerDirection = useDirectionalPan('horizontal', directionConfig);
  const containsHeaderTouch = useCallback(
    (y: number) => {
      'worklet';
      const offset = getHeaderScrollOffset(
        activeIndex.value,
        tabCount,
        perPageScrollY,
        scrollY,
        scrollToTopIndex.value,
        scrollToTopOffset.value
      );
      const bottom =
        pinnedTotal +
        tabBarHeight +
        headerHeight.value +
        collapseTranslateY(
          offset,
          headerHeight.value,
          pullDownBehavior === 'stretch'
        );
      return y >= pinnedTotal && y < bottom;
    },
    [
      activeIndex,
      tabCount,
      perPageScrollY,
      scrollY,
      scrollToTopIndex,
      scrollToTopOffset,
      pinnedTotal,
      tabBarHeight,
      headerHeight,
      pullDownBehavior,
    ]
  );

  // Memoize the hook input so unrelated React renders do not re-register its
  // native configuration and callbacks. Threshold changes still update it.
  const pagerPanGesture = usePanGesture(
    useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
      () => ({
        enabled: swipeEnabled,
        testID: 'fluid-tabs-pager',
        manualActivation: true,
        ...pagerDirection,
        hitSlop: pagerPanHitSlop,
        onTouchesDown: (e) => {
          'worklet';
          headerScroll.cancel();
          if (swipeGestureTopInset === 'auto' && !isPanning.value) {
            // Qualify the start against the visible chrome on UI. A static hitSlop
            // based on expanded height wrongly excludes list content after collapse.
            const touch = e.allTouches[0];
            const offset = getHeaderScrollOffset(
              activeIndex.value,
              tabCount,
              perPageScrollY,
              scrollY,
              scrollToTopIndex.value,
              scrollToTopOffset.value
            );
            const chromeBottom =
              pinnedTotal +
              tabBarHeight +
              headerHeight.value +
              collapseTranslateY(
                offset,
                headerHeight.value,
                pullDownBehavior === 'stretch'
              );
            if (touch && touch.y < chromeBottom) {
              GestureStateManager.fail(e.handlerTag);
              return;
            }
          }
          pagerDirection.onTouchesDown(e);
          if (!momentumActive.value) return;
          grabCatch.value = true;
          momentumActive.value = false;
          if (NEEDS_EXPLICIT_GRAB_STOP) {
            const i = clampTabIndex(activeIndex.value, tabCount);
            const ref = listRefs[i];
            const y = perPageScrollY[i];
            if (ref && y && y.value > 0) {
              scrollToMountedRef(ref, listMounted[i], 0, y.value, false);
            }
          }
        },
        onActivate: () => {
          'worklet';
          isPanning.value = true;
          cancelAnimation(translateX);
          startX.value = translateX.value;
          cancelScrollToTop();
          // Paging dismisses the custom pull's visible hold while its data request
          // continues. The pull hook also invalidates a hold on index changes.
          // On iOS a negative scrollY belongs to native overscroll.
          if (usesCustomPullSV.value) {
            isPulling.value = false;
            refreshingHold.value = false;
            if (scrollY.value < 0) {
              cancelAnimation(scrollY);
              scrollY.value = 0;
            }
          }
          freezeLists();
          syncLists(activeIndex.value);
        },
        onUpdate: (e) => {
          'worklet';
          if (!isPanning.value) return;
          const w = pageWidth.value;
          const raw = startX.value + e.translationX;
          translateX.value = rubberBand(raw, -(tabCount - 1) * w, 0);
        },
        onDeactivate: (e) => {
          'worklet';
          if (!isPanning.value) return;
          const w = pageWidth.value;
          const velocity = e.canceled ? 0 : e.velocityX;
          const prevIndex = activeIndex.value;
          const nextIndex = resolveSnapIndex(
            prevIndex,
            e.translationX,
            velocity,
            w,
            tabCount,
            e.canceled
          );
          activeIndex.value = nextIndex;

          const target = -nextIndex * w;
          const minX = -(tabCount - 1) * w;
          const overscrolled = translateX.value > 0 || translateX.value < minX;
          if (reduceMotionSV.value) {
            translateX.value = target;
          } else {
            translateX.value = withSpring(target, {
              ...spring,
              velocity: overscrolled ? 0 : velocity,
            });
          }
          syncLists(nextIndex);
          const landedY = perPageScrollY[nextIndex];
          if (landedY) scrollY.value = landedY.value;
          if (nextIndex !== prevIndex) {
            scheduleOnRN(handleIndexChange, nextIndex);
          }
        },
        onFinalize: () => {
          'worklet';
          isPanning.value = false;
          grabCatch.value = false;
        },
      }),
      [
        swipeEnabled,
        pagerDirection,
        headerScroll,
        pagerPanHitSlop,
        swipeGestureTopInset,
        isPanning,
        activeIndex,
        tabCount,
        perPageScrollY,
        scrollY,
        scrollToTopIndex,
        scrollToTopOffset,
        pinnedTotal,
        tabBarHeight,
        headerHeight,
        pullDownBehavior,
        momentumActive,
        grabCatch,
        listRefs,
        listMounted,
        translateX,
        startX,
        cancelScrollToTop,
        usesCustomPullSV,
        isPulling,
        refreshingHold,
        freezeLists,
        syncLists,
        pageWidth,
        reduceMotionSV,
        spring,
        handleIndexChange,
      ]
    )
  );
  const panGestureWaitRef = useMemo(
    () => ({ handlerTag: pagerPanGesture.handlerTag }),
    [pagerPanGesture.handlerTag]
  );
  const nativeListConfig = useMemo(
    () => ({
      requireToFail: panGestureWaitRef as unknown as typeof pagerPanGesture,
      onTouchesDown: () => {
        'worklet';
        headerScroll.cancel();
      },
    }),
    [panGestureWaitRef, headerScroll]
  );

  // A host Native gesture brings each scroll view into RNGH arbitration.
  // requireToFail gives the pager first chance to recognize horizontal intent;
  // a vertical failure releases the list. disallowInterruption would also
  // cancel competing taps/pulls, so it is deliberately left off.
  // Android's gesture-aware RefreshControl blocks this list gesture through
  // useAutoRefreshControl. Host attachment is the tested adapter arrangement,
  // not a claim that virtual Native gestures never work in RNGH 3.
  // tabCount is stable for this component's lifetime.
  const nativeListGestures: ReturnType<typeof useNativeGesture>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    nativeListGestures.push(useNativeGesture(nativeListConfig));
    /* eslint-enable react-hooks/rules-of-hooks */
  }
  // Native handler tags and their wait relation stay fixed until remount.
  const listNativeGestures = useMemo(
    () => nativeListGestures,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

  const customPullPan = useCustomPullGesture({
    directionConfig,
    headerScroll,
    headerScrollEnabled,
    containsHeaderTouch,
    usesCustomPullSV,
    activeIndex,
    tabCount,
    perPageScrollY,
    scrollY,
    isPanning,
    isPulling,
    refreshingHold,
    refreshStates,
    pinnedTotal,
    nativeListGestures: listNativeGestures,
    cancelScrollToTop,
    triggerActiveRefresh,
  });

  const webContentPan = useWebContentDrag({
    directionConfig,
    activeIndex,
    listRefs,
    headerScroll,
    cancelScrollToTop,
  });

  // Both pans wait for the same direction rule before manual activation. The
  // vertical pan scrolls chrome touches or pulls at the top on Android; the
  // competing relation enforces ownership after the direction decision.
  const combinedPagerGestures = useCompetingGestures(
    pagerPanGesture,
    webContentPan ?? customPullPan
  );

  return {
    listNativeGestures,
    pagerPanGesture,
    // Web content gets a mouse-only vertical pan; touch keeps browser pan-y.
    // Chrome has its own vertical gesture instance, attached separately.
    pagerGestures: combinedPagerGestures,
    // The real gesture object (relations like simultaneousWith need its
    // gestureRelations — a bare { handlerTag } ref crashes RNGH's relation
    // merging). Its identity changes per render, but relations resolve by
    // handlerTag, which is stable for the component's lifetime, so holding
    // an older instance (e.g. via the context memo) is fine.
    pullPanGesture: customPullPan,
  };
}

interface ContainerContentProps {
  tabs: ExtractedTab[];
  renderHeader: ContainerProps['renderHeader'];
  renderPinnedHeader: ContainerProps['renderPinnedHeader'];
  renderTabBar: ContainerProps['renderTabBar'];
  containerStyle: ContainerProps['containerStyle'];
  pinnedHeaderHeight: ContainerProps['pinnedHeaderHeight'];
  pinnedTotal: number;
  resolvedPinnedHeaderHeight: number;
  tabBarHeight: number;
  topInset: number;
  scrollY: SharedValue<number>;
  perPageScrollY: SharedValue<number>[];
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  headerHeight: SharedValue<number>;
  activeIndex: SharedValue<number>;
  selectedIndex: number;
  pagerOffset: DerivedValue<number>;
  pillWidth: SharedValue<number>;
  pullDownBehavior: ContainerProps['pullDownBehavior'];
  onTabPress: (index: number) => void;
  onWebScrollStart: (index: number) => void;
  webScrollRef: Ref<ComponentRef<typeof View>> | undefined;
  onContainerLayout: (width: number, height: number) => void;
  onPinnedHeaderHeight: (height: number) => void;
  onHeaderHeight: (height: number) => void;
  collapsibleHeaderStyle: any;
  pullIndicatorStyle: any;
  pagerGestures: any;
  verticalGesture: any;
  layoutWidth: number;
  tabCount: number;
  pagerStyle: any;
  lazy: boolean;
  mountedTabIndices: Set<number>;
}

function ContainerContentBase({
  tabs,
  renderHeader,
  renderPinnedHeader,
  renderTabBar,
  containerStyle,
  pinnedHeaderHeight,
  pinnedTotal,
  resolvedPinnedHeaderHeight,
  tabBarHeight,
  topInset,
  scrollY,
  perPageScrollY,
  scrollToTopIndex,
  scrollToTopOffset,
  headerHeight,
  activeIndex,
  selectedIndex,
  pagerOffset,
  pillWidth,
  pullDownBehavior,
  onTabPress,
  onWebScrollStart,
  webScrollRef,
  onContainerLayout,
  onPinnedHeaderHeight,
  onHeaderHeight,
  collapsibleHeaderStyle,
  pullIndicatorStyle,
  pagerGestures,
  verticalGesture,
  layoutWidth,
  tabCount,
  pagerStyle,
  lazy,
  mountedTabIndices,
}: ContainerContentProps) {
  const tabBarProps: TabBarRenderProps = {
    tabs: tabs.map((t) => t.config),
    scrollY,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    tabCount,
    headerHeight,
    activeIndex,
    pagerOffset,
    pillWidth,
    pinnedHeaderHeight: resolvedPinnedHeaderHeight,
    tabBarHeight,
    topInset,
    pullDownBehavior: pullDownBehavior ?? 'static',
    onTabPress,
  };

  const tabBarNode = renderTabBar ? (
    renderTabBar(tabBarProps)
  ) : (
    <DefaultTabBar {...tabBarProps} />
  );

  const chrome = (
    <>
      {renderPinnedHeader ? (
        <View
          style={[
            styles.pinnedHeader,
            pinnedHeaderHeight != null ? { height: pinnedTotal } : null,
          ]}
          pointerEvents="box-none"
          onLayout={
            pinnedHeaderHeight == null
              ? (e) => onPinnedHeaderHeight(e.nativeEvent.layout.height)
              : undefined
          }
        >
          {renderPinnedHeader({
            scrollY,
            headerHeight,
            topInset,
            pinnedHeaderHeight: resolvedPinnedHeaderHeight,
          })}
        </View>
      ) : null}

      {renderHeader ? (
        <Animated.View
          style={[
            styles.collapsibleHeader,
            { top: pinnedTotal },
            collapsibleHeaderStyle,
          ]}
          pointerEvents="box-none"
          onLayout={(e) => onHeaderHeight(e.nativeEvent.layout.height)}
        >
          {renderHeader({
            scrollY,
            headerHeight,
            topInset,
            pinnedHeaderHeight: resolvedPinnedHeaderHeight,
          })}
        </Animated.View>
      ) : null}

      {IS_ANDROID && pullDownBehavior === 'stretch' ? (
        <Animated.View
          style={[
            styles.pullIndicator,
            { top: pinnedTotal + 12 },
            pullIndicatorStyle,
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" />
        </Animated.View>
      ) : null}

      <View style={styles.tabBarSlot} pointerEvents="box-none">
        {tabBarNode}
      </View>
    </>
  );

  const pagerRow = (
    <Animated.View
      style={[styles.pager, { width: layoutWidth * tabCount }, pagerStyle]}
    >
      {tabs.map((tab, index) => {
        const shouldRender = !lazy || mountedTabIndices.has(index);

        return (
          <View
            key={tab.key}
            style={[styles.page, { width: layoutWidth }]}
            collapsable={false}
            accessibilityElementsHidden={index !== selectedIndex}
            importantForAccessibility={
              index === selectedIndex ? 'auto' : 'no-hide-descendants'
            }
            {...(IS_WEB
              ? {
                  'aria-hidden': index !== selectedIndex,
                  'inert': index !== selectedIndex,
                  'dataSet': { fluidTabsPage: String(index) },
                  // RN Web does not synthesize onScrollBeginDrag. Cancel on
                  // user input, since programmatic scroll events are ambiguous.
                  'onPointerDown': () => onWebScrollStart(index),
                }
              : null)}
          >
            {shouldRender ? (
              <TabIndexContext.Provider value={index}>
                {tab.children}
              </TabIndexContext.Provider>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );

  const pagerHost = <View style={styles.pagerHost}>{pagerRow}</View>;

  return (
    <View
      ref={webScrollRef}
      style={[styles.container, containerStyle]}
      onLayout={(e) =>
        onContainerLayout(
          e.nativeEvent.layout.width,
          e.nativeEvent.layout.height
        )
      }
    >
      {IS_WEB ? (
        <GestureDetector gesture={verticalGesture} touchAction="pan-x">
          <View style={styles.webChrome} pointerEvents="box-none">
            {chrome}
          </View>
        </GestureDetector>
      ) : (
        chrome
      )}
      {IS_WEB ? (
        <GestureDetector gesture={pagerGestures} touchAction="pan-y">
          {pagerHost}
        </GestureDetector>
      ) : (
        pagerHost
      )}
    </View>
  );
}

// Avoid reconciling the content solely for a native gesture config update.
// Native gestures attach at ContainerImpl's root and their hooks update the
// handler configuration there. The content only hosts a detector on web,
// where its complete gesture object must participate in the comparison.
function arePropsEqual(
  prev: ContainerContentProps,
  next: ContainerContentProps
) {
  const prevRecord = prev as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  for (const key in nextRecord) {
    if ((key === 'pagerGestures' || key === 'verticalGesture') && !IS_WEB)
      continue;
    if (!Object.is(prevRecord[key], nextRecord[key])) return false;
  }
  for (const key in prevRecord) {
    if (!(key in nextRecord)) return false;
  }
  return true;
}

const ContainerContent = memo(ContainerContentBase, arePropsEqual);

function useTabNavigation({
  controlledIndex,
  lastNotifiedIndex,
  containerRef,
  tabCount,
  activeIndex,
  pageWidth,
  translateX,
  isPanning,
  reduceMotionSV,
  syncLists,
  alignList,
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
  containerRef: Ref<TabsRef>;
  tabCount: number;
  activeIndex: SharedValue<number>;
  pageWidth: SharedValue<number>;
  translateX: SharedValue<number>;
  isPanning: SharedValue<boolean>;
  reduceMotionSV: SharedValue<boolean>;
  syncLists: (excludeIndex?: number) => void;
  alignList: (index: number, target: number) => void;
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

        if (target !== null && (target !== y.value || i === currentIndex)) {
          alignList(i, target);
        }
      }

      const nextY = perPageScrollY[nextIndex];
      if (nextY) scrollY.value = nextY.value;
    },
    [alignList, scrollY, headerHeight, listRefs, perPageScrollY]
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
        cancelAnimation(translateX);
        activeIndex.value = clamped;
        prepareForIndexChange(current, clamped);

        if (!animated || reduceMotionSV.value) {
          translateX.value = target;
          syncLists(clamped);
        } else {
          const duration =
            SNAP_DURATION_BASE + distance * SNAP_DURATION_PER_PAGE;
          translateX.value = withTiming(
            target,
            { duration, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (!finished) return;
              syncLists(clamped);
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

function useContainerMeasurements({
  pinnedHeaderHeight,
  topInsetOverride,
  hasPinnedHeader,
  hasHeader,
  estimatedHeaderHeight,
  minPageContentHeight,
  screenHeight,
  tabBarHeight,
  swipeGestureTopInset,
}: {
  pinnedHeaderHeight: ContainerProps['pinnedHeaderHeight'];
  topInsetOverride: ContainerProps['topInset'];
  hasPinnedHeader: boolean;
  hasHeader: boolean;
  estimatedHeaderHeight: number;
  minPageContentHeight: ContainerProps['minPageContentHeight'];
  screenHeight: number;
  tabBarHeight: number;
  swipeGestureTopInset: ContainerProps['swipeGestureTopInset'];
}) {
  const { top: safeTopInset, bottom: bottomInset } = useSafeAreaInsets();
  const topInset =
    topInsetOverride != null && Number.isFinite(topInsetOverride)
      ? Math.max(0, topInsetOverride)
      : safeTopInset;
  const [measuredPinnedTotal, setMeasuredPinnedTotal] = useState(0);
  const pinnedTotal =
    pinnedHeaderHeight != null
      ? pinnedHeaderHeight + topInset
      : hasPinnedHeader
        ? Math.max(measuredPinnedTotal, topInset)
        : topInset;
  const resolvedPinnedHeaderHeight = Math.max(0, pinnedTotal - topInset);
  const [lastHeaderHeight, setMeasuredHeaderHeight] = useState(
    estimatedHeaderHeight
  );
  const measuredHeaderHeight = hasHeader ? lastHeaderHeight : 0;
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(0);
  const [measuredContainerWidth, setMeasuredContainerWidth] = useState(0);

  const resolvedMinContentHeight =
    minPageContentHeight ??
    (measuredContainerHeight || screenHeight) + measuredHeaderHeight;
  const resolvedSwipeGestureTopInset =
    swipeGestureTopInset === 'auto'
      ? pinnedTotal + tabBarHeight
      : Math.max(0, swipeGestureTopInset ?? 0);
  const availableHeight = measuredContainerHeight || screenHeight;
  const pagerPanHitSlop = useMemo(
    () => ({
      left: -EDGE_SWIPE_MARGIN,
      ...(resolvedSwipeGestureTopInset > 0
        ? {
            top: -Math.min(
              Math.max(0, availableHeight - 1),
              resolvedSwipeGestureTopInset
            ),
          }
        : null),
    }),
    [availableHeight, resolvedSwipeGestureTopInset]
  );

  return {
    topInset,
    bottomInset,
    pinnedTotal,
    resolvedPinnedHeaderHeight,
    setMeasuredHeaderHeight,
    setMeasuredContainerHeight,
    setMeasuredContainerWidth,
    measuredContainerWidth,
    setMeasuredPinnedTotal,
    measuredHeaderHeight,
    resolvedMinContentHeight,
    pagerPanHitSlop,
  };
}

function useContainerAnimatedStyles({
  scrollY,
  activeIndex,
  perPageScrollY,
  scrollToTopIndex,
  scrollToTopOffset,
  tabCount,
  translateX,
  usesCustomPullSV,
  refreshStates,
  pullDownBehavior,
  headerHeight,
}: {
  scrollY: SharedValue<number>;
  activeIndex: SharedValue<number>;
  perPageScrollY: SharedValue<number>[];
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  tabCount: number;
  translateX: SharedValue<number>;
  usesCustomPullSV: SharedValue<boolean>;
  refreshStates: SharedValue<RefreshTabState[]>;
  pullDownBehavior: ContainerProps['pullDownBehavior'];
  headerHeight: SharedValue<number>;
}) {
  const pullIndicatorStyle = useAnimatedStyle(() => {
    'worklet';
    const offset = getHeaderScrollOffset(
      activeIndex.value,
      tabCount,
      perPageScrollY,
      scrollY,
      scrollToTopIndex.value,
      scrollToTopOffset.value
    );
    const reveal = interpolate(-offset, [0, PULL_HOLD_OFFSET], [0, 1], 'clamp');
    const refresh = refreshStates.value[activeIndex.value];
    return {
      opacity:
        refresh?.canRefresh || refresh?.refreshing || refresh?.pending
          ? reveal
          : 0,
      transform: [{ scale: 0.6 + 0.4 * reveal }],
    };
  });

  const pagerStyle = useAnimatedStyle(() => {
    'worklet';
    const offset = getHeaderScrollOffset(
      activeIndex.value,
      tabCount,
      perPageScrollY,
      scrollY,
      scrollToTopIndex.value,
      scrollToTopOffset.value
    );
    return {
      transform: [
        { translateX: translateX.value },
        {
          translateY: usesCustomPullSV.value && offset < 0 ? -offset : 0,
        },
      ],
    };
  });

  const stretch = pullDownBehavior === 'stretch';
  const collapsibleHeaderStyle = useAnimatedStyle(() => {
    'worklet';
    // Until the header height is known (measured via onLayout, or seeded by
    // estimatedHeaderHeight) hold the header at rest. Collapsing against a zero
    // height would let the very first scroll nudge the header before the list
    // spacer below has reserved the real space, producing a one-frame jump.
    if (headerHeight.value <= 0) {
      return { transform: [{ translateY: 0 }] };
    }
    const offset = getHeaderScrollOffset(
      activeIndex.value,
      tabCount,
      perPageScrollY,
      scrollY,
      scrollToTopIndex.value,
      scrollToTopOffset.value
    );
    return {
      transform: [
        {
          translateY: collapseTranslateY(offset, headerHeight.value, stretch),
        },
      ],
    };
  });

  return { pullIndicatorStyle, pagerStyle, collapsibleHeaderStyle };
}

function usePagerOffset({
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

function ContainerImpl(props: ContainerImplProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const {
    tabs,
    containerRef,
    renderHeader,
    renderPinnedHeader,
    pinnedHeaderHeight,
    topInset: topInsetOverride,
    tabBarHeight = DEFAULT_TAB_BAR_HEIGHT,
    initialIndex = 0,
    index: controlledIndex,
    onIndexChange,
    scrollToTopOnTabPress = true,
    renderTabBar,
    containerStyle,
    swipeEnabled = true,
    swipeActivationDistance = DEFAULT_SWIPE_ACTIVATION,
    swipeFailDistance = DEFAULT_SWIPE_FAIL,
    swipeDirectionRatio = DEFAULT_SWIPE_DIRECTION_RATIO,
    headerScrollEnabled = true,
    swipeGestureTopInset = 'auto',
    springConfig,
    minPageContentHeight,
    estimatedHeaderHeight = 0,
    lazy = false,
    lazyPreloadDistance = 1,
    pullDownBehavior = 'static',
  } = props;

  const tabCount = tabs.length;
  const startIndex = clampTabIndex(controlledIndex ?? initialIndex, tabCount);
  const resolvedLazyPreloadDistance = Math.max(
    0,
    Number.isFinite(lazyPreloadDistance) ? Math.floor(lazyPreloadDistance) : 1
  );

  const headerHeight = useSharedValue(renderHeader ? estimatedHeaderHeight : 0);
  const {
    topInset,
    bottomInset,
    pinnedTotal,
    resolvedPinnedHeaderHeight,
    setMeasuredHeaderHeight,
    setMeasuredContainerHeight,
    setMeasuredContainerWidth,
    measuredContainerWidth,
    setMeasuredPinnedTotal,
    measuredHeaderHeight,
    resolvedMinContentHeight,
    pagerPanHitSlop,
  } = useContainerMeasurements({
    pinnedHeaderHeight,
    topInsetOverride,
    hasPinnedHeader: !!renderPinnedHeader,
    hasHeader: !!renderHeader,
    estimatedHeaderHeight,
    minPageContentHeight,
    screenHeight,
    tabBarHeight,
    swipeGestureTopInset,
  });
  useLayoutEffect(() => {
    // Removing the header must also remove its spacer and collapse range.
    headerHeight.value = measuredHeaderHeight;
  }, [headerHeight, measuredHeaderHeight]);
  const layoutWidth = measuredContainerWidth || screenWidth;
  const handleContainerLayout = useCallback(
    (width: number, height: number) => {
      setMeasuredContainerWidth(width);
      setMeasuredContainerHeight(height);
    },
    [setMeasuredContainerWidth, setMeasuredContainerHeight]
  );

  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(startIndex);
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  const translateX = useSharedValue(-startIndex * layoutWidth);
  const startX = useSharedValue(0);
  const isPanning = useSharedValue(false);
  const pillWidth = useSharedValue(0);
  const momentumActive = useSharedValue(false);
  const grabCatch = useSharedValue(false);

  const usesCustomPull = IS_ANDROID && pullDownBehavior === 'stretch';
  const usesCustomPullSV = useSharedValue(usesCustomPull);
  useEffect(() => {
    usesCustomPullSV.value = usesCustomPull;
  }, [usesCustomPull, usesCustomPullSV]);

  const refreshConfigs = useRef<
    ({ refreshing: boolean; onRefresh?: () => void } | null)[]
  >([]);
  const refreshingHold = useSharedValue(false);
  const refreshStates = useSharedValue<RefreshTabState[]>(
    Array.from({ length: tabCount }, () => ({
      canRefresh: false,
      refreshing: false,
      pending: false,
    }))
  );
  const isPulling = useSharedValue(false);

  const { mountedTabIndices, mountTabsAround } = useMountedTabs({
    startIndex,
    tabCount,
    lazy,
    resolvedLazyPreloadDistance,
    activeIndex,
  });

  const pageWidth = useSharedValue(layoutWidth);
  useEffect(() => {
    const resizePager = () => {
      'worklet';
      pageWidth.value = layoutWidth;
      cancelAnimation(translateX);
      translateX.value = -activeIndex.value * layoutWidth;
      // Translation events belong to the previous layout until this finger
      // lifts. Ignore that gesture instead of jumping back to its old origin.
      isPanning.value = false;
    };
    if (IS_WEB) resizePager();
    else runOnUISync(resizePager);
  }, [layoutWidth, activeIndex, pageWidth, translateX, isPanning]);

  const reduceMotion = useReducedMotion();
  const reduceMotionSV = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
  }, [reduceMotion, reduceMotionSV]);

  const pagerOffset = usePagerOffset({
    startIndex,
    activeIndex,
    translateX,
    pageWidth,
    tabCount,
  });

  const {
    listRefs,
    listMounted,
    listScrollMetrics,
    headerScroll,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    scrollHandlers,
    freezeLists,
    cancelScrollToTop,
    syncLists,
    alignList,
  } = usePagerListState({
    tabCount,
    activeIndex,
    scrollY,
    headerHeight,
    momentumActive,
    usesCustomPullSV,
    reduceMotionSV,
  });
  const handleWebScrollStart = useCallback(
    (index: number) => {
      // Only used by browser event handlers; no RN/UI crossing on web.
      if (
        scrollToTopIndex.value === index ||
        headerScroll.index.value === index
      )
        cancelScrollToTop();
    },
    [scrollToTopIndex, cancelScrollToTop, headerScroll]
  );
  const webScrollRef = useWebWheelScroll({
    activeIndex,
    perPageScrollY,
    listRefs,
    headerScroll,
    cancelScrollToTop,
    headerScrollEnabled,
    reduceMotion,
  });

  const spring = useMemo(
    () => ({ ...DEFAULT_SPRING, ...(springConfig ?? {}) }),
    [springConfig]
  );

  const lastNotifiedIndex = useRef<number | undefined>(undefined);
  const handleIndexChange = useCallback(
    (index: number, notifyParent: boolean = true) => {
      // UI gestures can advance again before their RN callbacks are delivered.
      // Do not publish an obsolete selection back into the controlled index.
      if (index !== activeIndex.value) return;
      setSelectedIndex(index);
      mountTabsAround(index);
      if (notifyParent && onIndexChange) {
        lastNotifiedIndex.current = index;
        onIndexChange(index);
      }
    },
    [activeIndex, mountTabsAround, onIndexChange]
  );

  const reportRefreshConfig = useCallback(
    (
      index: number,
      config: { refreshing: boolean; onRefresh?: () => void } | null
    ) => {
      refreshConfigs.current[index] = config;
      const canRefresh = typeof config?.onRefresh === 'function';
      const nowRefreshing = !!config?.refreshing;
      // Native SharedValue setters are queued. Reading and replacing this
      // array on RN can lose registrations from sibling layout effects, or a
      // pending request set by a UI gesture. Reconcile the whole update on UI.
      const applyConfig = () => {
        'worklet';
        const next = [...refreshStates.value];
        const wasRefreshing = !!next[index]?.refreshing;
        next[index] = { canRefresh, refreshing: nowRefreshing, pending: false };
        refreshStates.value = next;
        if (index === clampTabIndex(activeIndex.value, tabCount)) {
          if (!nowRefreshing) refreshingHold.value = false;
          else if (!wasRefreshing) refreshingHold.value = true;
        }
      };
      if (IS_WEB) applyConfig();
      else runOnUISync(applyConfig);
    },
    [tabCount, activeIndex, refreshingHold, refreshStates]
  );

  const triggerActiveRefresh = useCallback(
    (index: number) => {
      // Preserve the originating tab across the asynchronous UI -> RN handoff.
      const config = refreshConfigs.current[index];
      if (config?.onRefresh && !config.refreshing) {
        // The adapter always reports again after the callback's React commit,
        // including when `refreshing` remains false or the callback throws.
        config.onRefresh();
      } else {
        // The control may have changed between the UI release and RN handoff.
        reportRefreshConfig(index, config ?? null);
      }
    },
    [reportRefreshConfig]
  );

  const { listNativeGestures, pagerGestures, pullPanGesture, pagerPanGesture } =
    usePagerGestures({
      swipeEnabled,
      swipeActivationDistance,
      swipeFailDistance,
      swipeDirectionRatio,
      headerScrollEnabled,
      headerScroll,
      pagerPanHitSlop,
      swipeGestureTopInset,
      tabBarHeight,
      headerHeight,
      scrollToTopIndex,
      scrollToTopOffset,
      pullDownBehavior,
      pinnedTotal,
      spring,
      tabCount,
      activeIndex,
      momentumActive,
      grabCatch,
      listRefs,
      listMounted,
      perPageScrollY,
      isPanning,
      startX,
      translateX,
      pageWidth,
      reduceMotionSV,
      freezeLists,
      cancelScrollToTop,
      syncLists,
      scrollY,
      handleIndexChange,
      usesCustomPullSV,
      isPulling,
      refreshingHold,
      refreshStates,
      triggerActiveRefresh,
    });

  const handleHeaderHeight = useCallback(
    (nextHeaderHeight: number) => {
      headerHeight.value = nextHeaderHeight;
      setMeasuredHeaderHeight(nextHeaderHeight);
    },
    [headerHeight, setMeasuredHeaderHeight]
  );

  const { pullIndicatorStyle, pagerStyle, collapsibleHeaderStyle } =
    useContainerAnimatedStyles({
      scrollY,
      activeIndex,
      perPageScrollY,
      scrollToTopIndex,
      scrollToTopOffset,
      tabCount,
      translateX,
      usesCustomPullSV,
      refreshStates,
      pullDownBehavior,
      headerHeight,
    });

  const handleTabPress = useTabNavigation({
    controlledIndex,
    lastNotifiedIndex,
    containerRef,
    tabCount,
    activeIndex,
    pageWidth,
    translateX,
    isPanning,
    reduceMotionSV,
    syncLists,
    alignList,
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
  });

  const contextValue: InternalTabsContextValue = useMemo(
    () => ({
      scrollY,
      headerHeight,
      activeIndex,
      momentumActive,
      pagerOffset,
      pillWidth,
      pinnedHeaderHeight: resolvedPinnedHeaderHeight,
      headerHeightValue: measuredHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      minPageContentHeight: resolvedMinContentHeight,
      listRefs,
      listMounted,
      listScrollMetrics,
      perPageScrollY,
      scrollToTopIndex,
      scrollToTopOffset,
      scrollHandlers,
      listNativeGestures,
      pullPanGesture,
      pagerPanGesture,
      pullDownBehavior,
      usesCustomPullSV,
      usesCustomPull,
      reportRefreshConfig,
    }),
    // Shared values and per-tab refs stay stable until ContainerImpl remounts.
    // Scroll handlers capture those stable values; gestures resolve relations
    // by stable handler tags. Rebuilding this context for their wrapper/array
    // identities would rerender every list on unrelated Container renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      resolvedPinnedHeaderHeight,
      measuredHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      resolvedMinContentHeight,
      tabCount,
      pullDownBehavior,
      usesCustomPull,
      reportRefreshConfig,
    ]
  );

  const content = (
    <ContainerContent
      tabs={tabs}
      renderHeader={renderHeader}
      renderPinnedHeader={renderPinnedHeader}
      renderTabBar={renderTabBar}
      containerStyle={containerStyle}
      pinnedHeaderHeight={pinnedHeaderHeight}
      pinnedTotal={pinnedTotal}
      resolvedPinnedHeaderHeight={resolvedPinnedHeaderHeight}
      tabBarHeight={tabBarHeight}
      topInset={topInset}
      scrollY={scrollY}
      perPageScrollY={perPageScrollY}
      scrollToTopIndex={scrollToTopIndex}
      scrollToTopOffset={scrollToTopOffset}
      headerHeight={headerHeight}
      activeIndex={activeIndex}
      selectedIndex={selectedIndex}
      pagerOffset={pagerOffset}
      pillWidth={pillWidth}
      pullDownBehavior={pullDownBehavior}
      onTabPress={handleTabPress}
      onWebScrollStart={handleWebScrollStart}
      webScrollRef={webScrollRef}
      onContainerLayout={handleContainerLayout}
      onPinnedHeaderHeight={setMeasuredPinnedTotal}
      onHeaderHeight={handleHeaderHeight}
      collapsibleHeaderStyle={collapsibleHeaderStyle}
      pullIndicatorStyle={pullIndicatorStyle}
      pagerGestures={pagerGestures}
      verticalGesture={pullPanGesture}
      layoutWidth={layoutWidth}
      tabCount={tabCount}
      pagerStyle={pagerStyle}
      lazy={lazy}
      mountedTabIndices={mountedTabIndices}
    />
  );

  return (
    <TabsContext.Provider value={contextValue}>
      {IS_WEB ? (
        content
      ) : (
        /* Cover both pages and overlay chrome; each pan applies its own
           exclusion zone to decide where a gesture may start. */
        <InterceptingGestureDetector
          gesture={pagerGestures}
          touchAction="pan-y"
        >
          {content}
        </InterceptingGestureDetector>
      )}
    </TabsContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  pinnedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  collapsibleHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  tabBarSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  // Below the collapsible header (zIndex 10): hidden until the header rides
  // down with a pull and reveals it.
  pullIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  pagerHost: { flex: 1, overflow: 'hidden' },
  // direction:'ltr' pins the pager row so the manual translateX math stays
  // valid under RTL locales (RN otherwise auto-flips row layout). It is a
  // valid Yoga style on native, but react-native-web rejects `direction` as a
  // style prop, so apply it on native only — web is LTR by default.
  pager: {
    flexDirection: 'row',
    flex: 1,
    ...(Platform.OS === 'web' ? null : { direction: 'ltr' as const }),
  },
  page: { height: '100%', overflow: 'hidden' },
});
