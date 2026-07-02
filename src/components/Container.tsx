import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
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
  InterceptingGestureDetector,
  useCompetingGestures,
  useNativeGesture,
  usePanGesture,
  VirtualGestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  scrollTo,
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
import {
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

const DEFAULT_TAB_BAR_HEIGHT = 56;
const DEFAULT_SWIPE_ACTIVATION = 15;
const DEFAULT_SWIPE_FAIL = 10;
const DEFAULT_MOMENTUM_SWIPE_FAIL = 40;

// Detector strategy differs by platform. On native we host the gesture system
// once at the root with InterceptingGestureDetector and attach the pager pan
// and tab taps as VirtualGestureDetectors — these don't insert host views, so
// they don't disrupt touch routing (which left tab buttons unresponsive until
// a gesture reset the tree). The per-list Native gestures are the exception:
// they need host GestureDetectors or they never receive events on Android
// (see the listNativeGestures note below). On web that intercepting model
// routes pointer events differently and breaks the pager swipe, so we use the
// standalone host GestureDetector for the pager, while list wrappers keep
// their scroll views as plain DOM scrollers so horizontal drags can reach the
// pager.
const IS_WEB = Platform.OS === 'web';
const PagerGestureDetector = IS_WEB ? GestureDetector : VirtualGestureDetector;
// Width of the left-edge zone where the tab pan gesture refuses to activate,
// leaving room for iOS edge-swipe-back / Android gesture-nav.
const EDGE_SWIPE_MARGIN = 20;
// Android's ScrollView aborts a fling natively when a new touch lands on it
// (the catch happens inside the gesture orchestrator — see listNativeGestures).
// On iOS the scroll view's own pan recognizer is failure-required on the pager
// pan, so it cannot begin (and catch the deceleration) while the pan is still
// undetermined — the grab has to stop the fling explicitly via scrollTo.
const IS_ANDROID = Platform.OS === 'android';
const NEEDS_EXPLICIT_GRAB_STOP = !IS_ANDROID;

// Android `stretch` pull-to-refresh: Android lists have no native bounce, so
// the Container drives the pull itself — a pan that only engages when the
// active list sits at its top writes negative values into scrollY (the same
// signal iOS overscroll produces), the chrome's existing stretch math rides
// down, and a custom indicator is revealed under the pinned bar. Distances
// are dp of *pull* (finger travel × resistance).
const PULL_RESISTANCE = 0.5;
const PULL_TRIGGER_DISTANCE = 72;
const PULL_HOLD_OFFSET = 56;
const PULL_ACTIVATION = 12;
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

function scrollToMountedRef(
  ref: AnimatedRef<any> | undefined,
  x: number,
  y: number,
  animated: boolean
) {
  'worklet';
  if (!ref || !ref()) return false;
  scrollTo(ref, x, y, animated);
  return true;
}

function clampTabIndex(index: number, tabCount: number) {
  'worklet';
  return Math.max(0, Math.min(Math.round(index), tabCount - 1));
}

export const Container = forwardRef<TabsRef, ContainerProps>(
  function Container(props, ref) {
    const tabs = useMemo(() => extractTabs(props.children), [props.children]);
    // Per-tab state below is built with hook loops keyed on tab count. Remount
    // the implementation whenever the count changes so React never sees a
    // different number of hooks across renders (which would crash). Swapping
    // tabs without changing the count keeps state and does not remount.
    return (
      <ContainerImpl
        key={tabs.length}
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
      if (!lazy) return;
      setMountedTabIndices((current) => {
        const next = new Set(current);
        addMountedTabs(next, index, tabCount, resolvedLazyPreloadDistance);
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
}: {
  tabCount: number;
  activeIndex: SharedValue<number>;
  scrollY: SharedValue<number>;
  headerHeight: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  usesCustomPullSV: SharedValue<boolean>;
}) {
  const scrollToTopIndex = useSharedValue(-1);
  const scrollToTopOffset = useSharedValue(0);
  // Tab count is stable for the lifetime of ContainerImpl because the outer
  // Container remounts it on count changes, so these hook loops keep a stable
  // shape while still giving every page its own animated ref and scroll value.
  const listRefs: AnimatedRef<any>[] = [];
  const perPageScrollY: SharedValue<number>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    listRefs.push(useAnimatedRef<Animated.FlatList<any>>());
    perPageScrollY.push(useSharedValue(0));
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  const scrollHandlers: any[] = [];
  for (let i = 0; i < tabCount; i++) {
    const pageScrollY = perPageScrollY[i]!;
    /* eslint-disable react-hooks/rules-of-hooks */
    scrollHandlers.push(
      useAnimatedScrollHandler({
        onScroll: (e) => {
          'worklet';
          if (scrollToTopIndex.value === i) return;
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
        return scrollToTopIndex.value === i ? scrollToTopOffset.value : null;
      },
      (target) => {
        'worklet';
        if (target == null) return;
        scrollToMountedRef(ref, 0, target, false);
      }
    );
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  // Stop every list dead at its current offset. Kills background flings and
  // in-flight animated scrolls so no page drifts away from where syncLists put
  // it.
  const freezeLists = useCallback(
    () => {
      'worklet';
      for (let i = 0; i < listRefs.length; i++) {
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) continue;
        const target =
          scrollToTopIndex.value === i ? scrollToTopOffset.value : y.value;
        if (scrollToMountedRef(ref, 0, target, false)) {
          y.value = target;
        }
      }
    },
    // listRefs / perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

  const cancelScrollToTop = useCallback(
    () => {
      'worklet';
      const i = scrollToTopIndex.value;
      if (i < 0 || i >= listRefs.length) return;
      cancelAnimation(scrollToTopOffset);
      cancelAnimation(scrollY);

      const ref = listRefs[i];
      const y = perPageScrollY[i];
      const target = Math.max(0, scrollToTopOffset.value);
      if (ref && y && scrollToMountedRef(ref, 0, target, false)) {
        y.value = target;
        if (activeIndex.value === i) scrollY.value = target;
      }
      scrollToTopIndex.value = -1;
    },
    // listRefs / perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

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
        if (target !== null) {
          if (scrollToMountedRef(ref, 0, target, false)) {
            y.value = target;
          }
        }
      }
    },
    // listRefs / perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

  return {
    listRefs,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    scrollHandlers,
    freezeLists,
    cancelScrollToTop,
    syncLists,
  };
}

function usePagerGestures({
  swipeEnabled,
  swipeActivationDistance,
  swipeFailDistance,
  momentumSwipeFailDistance,
  pagerPanHitSlop,
  spring,
  tabCount,
  activeIndex,
  momentumActive,
  grabCatch,
  listRefs,
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
  triggerActiveRefresh,
}: {
  swipeEnabled: boolean;
  swipeActivationDistance: number;
  swipeFailDistance: number;
  momentumSwipeFailDistance: number;
  pagerPanHitSlop: { left: number; top?: number };
  spring: Required<NonNullable<ContainerProps['springConfig']>>;
  tabCount: number;
  activeIndex: SharedValue<number>;
  momentumActive: SharedValue<boolean>;
  grabCatch: SharedValue<boolean>;
  listRefs: AnimatedRef<any>[];
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
  triggerActiveRefresh: () => void;
}) {
  // A finger that lands on a moving list drifts vertically (it instinctively
  // tracks the content) far more than one starting a swipe at rest, so the
  // tight at-rest failOffsetY would almost always fail the pager pan before
  // activeOffsetX could activate it - making mid-momentum page swipes nearly
  // impossible with a real finger. While momentum is running (and for the rest
  // of a touch that grabbed it) swap in a relaxed fail distance.
  //
  // The momentum/grab-catch flag lives on the UI thread (momentumActive /
  // grabCatch); we mirror it into React state and hand usePanGesture
  // plain-number offsets. Passing shared values directly in `failOffsetY`
  // makes RNGH's dev-time config validation read their `.value` during render,
  // which trips Reanimated's strict "reading during render" warning. The flag
  // only flips on momentum start/stop / grab-catch (never per frame), so the
  // JS round-trip to reconfigure the gesture is negligible.
  const resolvedGestureMomentumFail = Math.max(
    momentumSwipeFailDistance,
    swipeFailDistance
  );
  const [momentumFailActive, setMomentumFailActive] = useState(false);
  useAnimatedReaction(
    () => {
      'worklet';
      return momentumActive.value || grabCatch.value;
    },
    (next, previous) => {
      'worklet';
      if (next !== previous) {
        scheduleOnRN(setMomentumFailActive, next);
      }
    }
  );
  const failOffsetYDistance = momentumFailActive
    ? resolvedGestureMomentumFail
    : swipeFailDistance;

  // Gesture Handler v3 hooks memoize internally - no useMemo wrapper needed.
  const pagerPanGesture = usePanGesture({
    enabled: swipeEnabled,
    activeOffsetX: [-swipeActivationDistance, swipeActivationDistance],
    failOffsetY: [-failOffsetYDistance, failOffsetYDistance],
    hitSlop: pagerPanHitSlop,
    onTouchesDown: () => {
      'worklet';
      if (!momentumActive.value) return;
      grabCatch.value = true;
      momentumActive.value = false;
      if (NEEDS_EXPLICIT_GRAB_STOP) {
        const i = clampTabIndex(activeIndex.value, tabCount);
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (ref && y && y.value > 0) {
          scrollToMountedRef(ref, 0, y.value, false);
        }
      }
    },
    onActivate: () => {
      'worklet';
      isPanning.value = true;
      startX.value = translateX.value;
      cancelScrollToTop();
      // A horizontal swipe instantly dismisses the custom pull's indicator
      // (the X behavior — the refresh itself keeps running; landing on a
      // new page also clears the hold via handleIndexChange). Gated to the
      // custom pull: on iOS a negative scrollY is a real bounce offset.
      if (usesCustomPullSV.value && scrollY.value < 0) {
        cancelAnimation(scrollY);
        scrollY.value = 0;
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
      const w = pageWidth.value;
      const velocity = e.velocityX;
      const prevIndex = activeIndex.value;
      const nextIndex = resolveSnapIndex(
        prevIndex,
        e.translationX,
        velocity,
        w,
        tabCount
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
  });
  const panGestureWaitRef = useMemo(
    () => ({ handlerTag: pagerPanGesture.handlerTag }),
    [pagerPanGesture.handlerTag]
  );

  // Each scroll view gets its own Native gesture. Wrapping the RN scroll view
  // in a Native gesture is required on Android - otherwise RNGH consumes the
  // touch at the native level and the list never scrolls inside the pan's
  // detector region.
  //
  // `requireToFail: panGesture` makes the scroll wait for the pan to fail
  // before it activates: a horizontal drag activates the pan (the pan never
  // fails) so the list stays frozen during a page swipe (no scroll flick),
  // while a vertical drag fails the pan quickly (failOffsetY) and the scroll
  // takes over. Do NOT add `disallowInterruption` here - it cancels every
  // other handler, including the tab-button taps, while the list is scrolling.
  //
  // These gestures MUST be hosted in a host GestureDetector by the list
  // wrappers, not a VirtualGestureDetector. Virtually-attached Native gestures
  // never receive touch events on Android (the handler never leaves
  // UNDETERMINED, verified on RNGH 3.0.0), which leaves the scroll view running
  // outside RNGH arbitration. That breaks the X-style momentum grab: touching a
  // decelerating list makes the ScrollView intercept at ACTION_DOWN (the native
  // fling catch) and its requestDisallowInterceptTouchEvent makes RNGH cancel
  // every handler - including this pan - before a horizontal drag can be
  // recognized, so mid-momentum page swipes die at touch-down. With a host
  // detector the Native handler performs the catch inside the gesture
  // orchestrator (where requestDisallowIntercept is ignored): the fling is
  // aborted on touch-down and the pan survives to win the horizontal race.
  //
  // Android RefreshControl (SwipeRefreshLayout) conflicts with this Native
  // wrapper (RNGH issue #1067: the spinner shows but only commits on a second
  // touch). useAutoRefreshControl works around it by cloning the consumer's
  // gesture-aware RefreshControl with a `block` relation on this gesture.
  //
  // tabCount is stable for this component's lifetime.
  const nativeListGestures: ReturnType<typeof useNativeGesture>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    nativeListGestures.push(
      useNativeGesture({
        requireToFail: panGestureWaitRef as unknown as typeof pagerPanGesture,
      })
    );
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  // The custom pull pan (Android stretch mode). Engages only when the active
  // list sits at its top; activates on a downward drag (the pager pan has
  // already failed by then via its failOffsetY) and fails fast on horizontal
  // or upward movement so paging and scrolling are untouched. Simultaneous
  // with the list Native gestures: at offset 0 a downward drag can't scroll,
  // but the scroll handler may still claim the touch - it must not cancel us.
  const customPullEnabled = useSharedValue(false);
  useAnimatedReaction(
    () => {
      'worklet';
      if (!usesCustomPullSV.value) return false;
      const i = clampTabIndex(activeIndex.value, tabCount);
      const y = perPageScrollY[i];
      return (y ? y.value : 1) <= 1;
    },
    (enabled) => {
      'worklet';
      customPullEnabled.value = enabled;
    },
    [tabCount]
  );

  const customPullPan = usePanGesture({
    enabled: customPullEnabled,
    activeOffsetY: PULL_ACTIVATION,
    failOffsetY: -1,
    failOffsetX: [-16, 16],
    simultaneousWith: nativeListGestures,
    onActivate: () => {
      'worklet';
      isPulling.value = true;
      cancelAnimation(scrollY);
    },
    onUpdate: (e) => {
      'worklet';
      if (!isPulling.value) return;
      const pull = Math.max(0, e.translationY) * PULL_RESISTANCE;
      scrollY.value = -pull;
    },
    onFinalize: () => {
      'worklet';
      if (!isPulling.value) return;
      isPulling.value = false;
      const pulled = -scrollY.value;
      if (pulled <= 0) return;
      if (refreshingHold.value) {
        // Already refreshing - settle back onto the hold position.
        scrollY.value = withTiming(-PULL_HOLD_OFFSET, { duration: 180 });
      } else if (pulled >= PULL_TRIGGER_DISTANCE) {
        refreshingHold.value = true;
        scrollY.value = withTiming(-PULL_HOLD_OFFSET, { duration: 180 });
        scheduleOnRN(triggerActiveRefresh);
      } else {
        scrollY.value = withTiming(0, { duration: 220 });
      }
    },
  });

  // One detector hosts both pager gestures as a race: stacking a second
  // VirtualGestureDetector on the same child silently starves the inner
  // gesture of touches (both try to attach to the same host view), so the
  // pull pan must ride the same detector as the pager pan. The race adds no
  // relations - their offsets keep them mutually exclusive, and the pull's
  // `enabled` shared value keeps it inert outside Android stretch mode.
  const combinedPagerGestures = useCompetingGestures(
    pagerPanGesture,
    customPullPan
  );

  // Release the indicator hold when the active tab's refresh completes.
  useAnimatedReaction(
    () => {
      'worklet';
      return refreshingHold.value;
    },
    (current, previous) => {
      'worklet';
      if (
        previous === true &&
        current === false &&
        !isPulling.value &&
        scrollY.value < 0
      ) {
        scrollY.value = withTiming(0, { duration: 220 });
      }
    }
  );

  return {
    listNativeGestures: nativeListGestures,
    pagerGestures: combinedPagerGestures,
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
  pagerOffset: DerivedValue<number>;
  pillWidth: SharedValue<number>;
  pullDownBehavior: ContainerProps['pullDownBehavior'];
  onTabPress: (index: number) => void;
  onContainerHeight: (height: number) => void;
  onPinnedHeaderHeight: (height: number) => void;
  onHeaderHeight: (height: number) => void;
  collapsibleHeaderStyle: any;
  pullIndicatorStyle: any;
  pagerGestures: any;
  screenWidth: number;
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
  pagerOffset,
  pillWidth,
  pullDownBehavior,
  onTabPress,
  onContainerHeight,
  onPinnedHeaderHeight,
  onHeaderHeight,
  collapsibleHeaderStyle,
  pullIndicatorStyle,
  pagerGestures,
  screenWidth,
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

  return (
    <View
      style={[styles.container, containerStyle]}
      onLayout={(e) => onContainerHeight(e.nativeEvent.layout.height)}
    >
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

      <View style={styles.pagerHost}>
        <PagerGestureDetector gesture={pagerGestures} touchAction="pan-y">
          <Animated.View
            style={[
              styles.pager,
              { width: screenWidth * tabCount },
              pagerStyle,
            ]}
          >
            {tabs.map((tab, index) => {
              const shouldRender = !lazy || mountedTabIndices.has(index);

              return (
                <View
                  key={tab.key}
                  style={[styles.page, { width: screenWidth }]}
                  collapsable={false}
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
        </PagerGestureDetector>
      </View>
    </View>
  );
}

// The `momentumActive`/`grabCatch` flag is mirrored into React state
// (`momentumFailActive`) so the pager pan can be handed plain-number
// `failOffsetY` offsets without tripping Reanimated's read-during-render
// warning. That state flips on every fling's momentum begin/end, so without a
// memo boundary the whole pager + list subtree reconciles on each up/down
// flick, stuttering the header. ContainerContent is therefore memoized.
//
// `pagerGestures` is the one prop that legitimately changes on that toggle:
// RNGH rebuilds the composed gesture object every render (its config is an
// inline object) and the relaxed `failOffsetYDistance` is folded into it on a
// grab-catch. That reconfiguration is applied to the *native* handler by the
// gesture hooks' own effects in ContainerImpl (setGestureHandlerConfig), not by
// this detector re-rendering — the underlying handler tags are stable for the
// component's lifetime. Comparing `pagerGestures` by `handlerTags` lets the
// memo bail on the per-fling momentum toggle (killing the stutter) while the
// intercept-and-swipe feature keeps reconfiguring through ContainerImpl.
function arePropsEqual(
  prev: ContainerContentProps,
  next: ContainerContentProps
) {
  const prevRecord = prev as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  for (const key in nextRecord) {
    if (key === 'pagerGestures') continue;
    if (!Object.is(prevRecord[key], nextRecord[key])) return false;
  }
  for (const key in prevRecord) {
    if (!(key in nextRecord)) return false;
  }
  const prevTags: unknown = prev.pagerGestures?.handlerTags;
  const nextTags: unknown = next.pagerGestures?.handlerTags;
  if (prevTags === nextTags) return true;
  if (
    !Array.isArray(prevTags) ||
    !Array.isArray(nextTags) ||
    prevTags.length !== nextTags.length
  ) {
    return prev.pagerGestures === next.pagerGestures;
  }
  for (let i = 0; i < prevTags.length; i++) {
    if (prevTags[i] !== nextTags[i]) return false;
  }
  return true;
}

const ContainerContent = memo(ContainerContentBase, arePropsEqual);

function useTabNavigation({
  controlledIndex,
  containerRef,
  tabCount,
  activeIndex,
  pageWidth,
  translateX,
  reduceMotionSV,
  syncLists,
  perPageScrollY,
  scrollY,
  scrollToTopIndex,
  scrollToTopOffset,
  cancelScrollToTop,
  headerHeight,
  listRefs,
  scrollToTopOnTabPress,
  handleIndexChange,
}: {
  controlledIndex: number | undefined;
  containerRef: Ref<TabsRef>;
  tabCount: number;
  activeIndex: SharedValue<number>;
  pageWidth: SharedValue<number>;
  translateX: SharedValue<number>;
  reduceMotionSV: SharedValue<boolean>;
  syncLists: (excludeIndex?: number) => void;
  perPageScrollY: SharedValue<number>[];
  scrollY: SharedValue<number>;
  scrollToTopIndex: SharedValue<number>;
  scrollToTopOffset: SharedValue<number>;
  cancelScrollToTop: () => void;
  headerHeight: SharedValue<number>;
  listRefs: AnimatedRef<any>[];
  scrollToTopOnTabPress: boolean;
  handleIndexChange: (index: number, notifyParent?: boolean) => void;
}) {
  const runSyncListsNow = useCallback(
    (excludeIndex: number = -1) => {
      if (Platform.OS === 'web') {
        syncLists(excludeIndex);
      } else {
        const sync = () => {
          'worklet';
          syncLists(excludeIndex);
        };
        runOnUISync(sync);
      }
    },
    [syncLists]
  );

  const runPrepareForIndexChangeNow = useCallback(
    (currentIndex: number, nextIndex: number) => {
      const prepare = () => {
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

          if (
            target !== null &&
            (target !== y.value || i === currentIndex) &&
            scrollToMountedRef(ref, 0, target, false)
          ) {
            y.value = target;
          }
        }

        const nextY = perPageScrollY[nextIndex];
        if (nextY) scrollY.value = nextY.value;
      };
      if (Platform.OS === 'web') {
        prepare();
      } else {
        runOnUISync(prepare);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollY, headerHeight, tabCount]
  );

  const goToIndex = useCallback(
    (index: number, animated: boolean = true, notifyParent: boolean = true) => {
      const clamped = clampTabIndex(index, tabCount);
      const current = activeIndex.value;
      const distance = Math.abs(clamped - current);
      const target = -clamped * pageWidth.value;

      const cancelTopScroll = () => {
        'worklet';
        cancelScrollToTop();
      };
      if (Platform.OS === 'web') {
        cancelTopScroll();
      } else {
        runOnUISync(cancelTopScroll);
      }

      activeIndex.value = clamped;
      cancelAnimation(translateX);
      runPrepareForIndexChangeNow(current, clamped);

      if (!animated || reduceMotionSV.value) {
        translateX.value = target;
        runSyncListsNow(clamped);
      } else {
        const duration = SNAP_DURATION_BASE + distance * SNAP_DURATION_PER_PAGE;
        translateX.value = withTiming(
          target,
          { duration, easing: Easing.out(Easing.quad) },
          () => {
            'worklet';
            syncLists(clamped);
          }
        );
      }
      handleIndexChange(clamped, notifyParent);
    },
    [
      activeIndex,
      translateX,
      pageWidth,
      syncLists,
      runSyncListsNow,
      runPrepareForIndexChangeNow,
      handleIndexChange,
      tabCount,
      reduceMotionSV,
      cancelScrollToTop,
    ]
  );

  const scrollActiveTabToTop = useCallback(
    () => {
      const scrollTop = () => {
        'worklet';
        const i = clampTabIndex(activeIndex.value, tabCount);
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) return;
        scrollToMountedRef(ref, 0, y.value, false);
        cancelAnimation(scrollToTopOffset);
        cancelAnimation(scrollY);
        const currentY = Math.max(0, y.value);
        scrollToTopIndex.value = i;
        if (currentY <= 0 || reduceMotionSV.value) {
          scrollToTopOffset.value = 0;
          y.value = 0;
          if (activeIndex.value === i) scrollY.value = 0;
          scrollToMountedRef(ref, 0, 0, false);
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
          scrollToMountedRef(ref, 0, 0, false);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tabCount,
      activeIndex,
      scrollY,
      scrollToTopIndex,
      scrollToTopOffset,
      reduceMotionSV,
    ]
  );

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

  useEffect(() => {
    if (controlledIndex == null) return;
    const clamped = clampTabIndex(controlledIndex, tabCount);
    if (clamped !== clampTabIndex(activeIndex.value, tabCount)) {
      goToIndex(clamped, true, false);
    }
  }, [controlledIndex, tabCount, activeIndex, goToIndex]);

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
  hasPinnedHeader,
  estimatedHeaderHeight,
  minPageContentHeight,
  screenHeight,
  tabBarHeight,
  swipeGestureTopInset,
  headerHeight,
}: {
  pinnedHeaderHeight: ContainerProps['pinnedHeaderHeight'];
  hasPinnedHeader: boolean;
  estimatedHeaderHeight: number;
  minPageContentHeight: ContainerProps['minPageContentHeight'];
  screenHeight: number;
  tabBarHeight: number;
  swipeGestureTopInset: ContainerProps['swipeGestureTopInset'];
  headerHeight: SharedValue<number>;
}) {
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const [measuredPinnedTotal, setMeasuredPinnedTotal] = useState(0);
  const pinnedTotal =
    pinnedHeaderHeight != null
      ? pinnedHeaderHeight + topInset
      : hasPinnedHeader
        ? Math.max(measuredPinnedTotal, topInset)
        : topInset;
  const resolvedPinnedHeaderHeight = Math.max(0, pinnedTotal - topInset);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(
    estimatedHeaderHeight
  );
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(0);

  useEffect(() => {
    if (estimatedHeaderHeight > 0 && headerHeight.value === 0) {
      headerHeight.value = estimatedHeaderHeight;
    }
    if (estimatedHeaderHeight > 0 && measuredHeaderHeight === 0) {
      setMeasuredHeaderHeight(estimatedHeaderHeight);
    }
  }, [estimatedHeaderHeight, headerHeight, measuredHeaderHeight]);

  const resolvedMinContentHeight =
    minPageContentHeight ??
    (measuredContainerHeight || screenHeight) + measuredHeaderHeight;
  const resolvedSwipeGestureTopInset =
    swipeGestureTopInset === 'auto'
      ? pinnedTotal + measuredHeaderHeight + tabBarHeight
      : Math.max(0, swipeGestureTopInset ?? 0);
  const pagerPanHitSlop = {
    left: -EDGE_SWIPE_MARGIN,
    ...(resolvedSwipeGestureTopInset > 0
      ? {
          top: -Math.min(
            Math.max(0, screenHeight - 1),
            resolvedSwipeGestureTopInset
          ),
        }
      : null),
  };

  return {
    topInset,
    bottomInset,
    pinnedTotal,
    resolvedPinnedHeaderHeight,
    setMeasuredHeaderHeight,
    setMeasuredContainerHeight,
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
    return {
      opacity: reveal,
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
    [tabCount]
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
    momentumSwipeFailDistance = DEFAULT_MOMENTUM_SWIPE_FAIL,
    swipeGestureTopInset = 'auto',
    springConfig,
    minPageContentHeight,
    estimatedHeaderHeight = 0,
    lazy = false,
    lazyPreloadDistance = 1,
    pullDownBehavior = 'static',
  } = props;

  const tabCount = tabs.length;
  const startIndex = controlledIndex ?? initialIndex;
  const resolvedLazyPreloadDistance = Math.max(
    0,
    Math.floor(lazyPreloadDistance)
  );

  const headerHeight = useSharedValue(estimatedHeaderHeight);
  const {
    topInset,
    bottomInset,
    pinnedTotal,
    resolvedPinnedHeaderHeight,
    setMeasuredHeaderHeight,
    setMeasuredContainerHeight,
    setMeasuredPinnedTotal,
    measuredHeaderHeight,
    resolvedMinContentHeight,
    pagerPanHitSlop,
  } = useContainerMeasurements({
    pinnedHeaderHeight,
    hasPinnedHeader: !!renderPinnedHeader,
    estimatedHeaderHeight,
    minPageContentHeight,
    screenHeight,
    tabBarHeight,
    swipeGestureTopInset,
    headerHeight,
  });

  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(startIndex);
  const translateX = useSharedValue(-startIndex * screenWidth);
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
  const isPulling = useSharedValue(false);

  const { mountedTabIndices, mountTabsAround } = useMountedTabs({
    startIndex,
    tabCount,
    lazy,
    resolvedLazyPreloadDistance,
    activeIndex,
  });

  const pageWidth = useSharedValue(screenWidth);
  useEffect(() => {
    pageWidth.value = screenWidth;
    cancelAnimation(translateX);
    translateX.value = -activeIndex.value * screenWidth;
  }, [screenWidth, activeIndex, pageWidth, translateX]);

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
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    scrollHandlers,
    freezeLists,
    cancelScrollToTop,
    syncLists,
  } = usePagerListState({
    tabCount,
    activeIndex,
    scrollY,
    headerHeight,
    momentumActive,
    usesCustomPullSV,
  });

  const spring = useMemo(
    () => ({ ...DEFAULT_SPRING, ...(springConfig ?? {}) }),
    [springConfig]
  );

  const handleIndexChange = useCallback(
    (index: number, notifyParent: boolean = true) => {
      mountTabsAround(index);
      // Switching tabs dismisses the pull-to-refresh hold outright, even if
      // the landing tab reports `refreshing` — its data keeps loading, just
      // without the indicator (the X/Instagram behavior, and what iOS's
      // native RefreshControl does by default).
      refreshingHold.value = false;
      if (notifyParent) onIndexChange?.(index);
    },
    [mountTabsAround, onIndexChange, refreshingHold]
  );

  const reportRefreshConfig = useCallback(
    (
      index: number,
      config: { refreshing: boolean; onRefresh?: () => void } | null
    ) => {
      refreshConfigs.current[index] = config;
      if (index === clampTabIndex(activeIndex.value, tabCount)) {
        const nowRefreshing = !!config?.refreshing;
        if (refreshingHold.value !== nowRefreshing) {
          refreshingHold.value = nowRefreshing;
        }
      }
    },
    [tabCount, activeIndex, refreshingHold]
  );

  const triggerActiveRefresh = useCallback(() => {
    const i = clampTabIndex(activeIndex.value, tabCount);
    const config = refreshConfigs.current[i];
    if (config?.onRefresh) {
      config.onRefresh();
    } else {
      refreshingHold.value = false;
    }
  }, [tabCount, activeIndex, refreshingHold]);

  const { listNativeGestures, pagerGestures } = usePagerGestures({
    swipeEnabled,
    swipeActivationDistance,
    swipeFailDistance,
    momentumSwipeFailDistance,
    pagerPanHitSlop,
    spring,
    tabCount,
    activeIndex,
    momentumActive,
    grabCatch,
    listRefs,
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
      pullDownBehavior,
      headerHeight,
    });

  const handleTabPress = useTabNavigation({
    controlledIndex,
    containerRef,
    tabCount,
    activeIndex,
    pageWidth,
    translateX,
    reduceMotionSV,
    syncLists,
    perPageScrollY,
    scrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    cancelScrollToTop,
    headerHeight,
    listRefs,
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
      perPageScrollY,
      scrollToTopIndex,
      scrollToTopOffset,
      scrollHandlers,
      listNativeGestures,
      pullDownBehavior,
      usesCustomPullSV,
      usesCustomPull,
      reportRefreshConfig,
    }),
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
      pagerOffset={pagerOffset}
      pillWidth={pillWidth}
      pullDownBehavior={pullDownBehavior}
      onTabPress={handleTabPress}
      onContainerHeight={setMeasuredContainerHeight}
      onPinnedHeaderHeight={setMeasuredPinnedTotal}
      onHeaderHeight={handleHeaderHeight}
      collapsibleHeaderStyle={collapsibleHeaderStyle}
      pullIndicatorStyle={pullIndicatorStyle}
      pagerGestures={pagerGestures}
      screenWidth={screenWidth}
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
        <InterceptingGestureDetector>{content}</InterceptingGestureDetector>
      )}
    </TabsContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  pagerHost: { flex: 1 },
  // direction:'ltr' pins the pager row so the manual translateX math stays
  // valid under RTL locales (RN otherwise auto-flips row layout). It is a
  // valid Yoga style on native, but react-native-web rejects `direction` as a
  // style prop, so apply it on native only — web is LTR by default.
  pager: {
    flexDirection: 'row',
    flex: 1,
    ...(Platform.OS === 'web' ? null : { direction: 'ltr' as const }),
  },
  page: { height: '100%' },
});
