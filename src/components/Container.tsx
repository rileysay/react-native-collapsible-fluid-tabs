import {
  forwardRef,
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
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnUISync, scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIndexContext, TabsContext } from '../context';
import { extractTabs, type ExtractedTab } from '../utils/children';
import {
  collapseTranslateY,
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

// Scroll-to-top settle guard: how long after issuing the animated scroll to
// re-check the offset (covers the platform animation, ~250-400ms), and how
// far from 0 (dp) still counts as a truncated landing worth snapping. Beyond
// the tolerance the user has plainly scrolled away on purpose — leave it.
const SCROLL_TOP_SETTLE_CHECK_MS = 650;
const SCROLL_TOP_SETTLE_TOLERANCE = 24;

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

function ContainerImpl(props: ContainerImplProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Captured by the scroll-to-top worklet as a plain number.
  const viewportHeight = screenHeight;

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
  // In controlled mode the `index` prop also decides the first frame.
  const startIndex = controlledIndex ?? initialIndex;
  const resolvedLazyPreloadDistance = Math.max(
    0,
    Math.floor(lazyPreloadDistance)
  );
  const [mountedTabIndices, setMountedTabIndices] = useState(() =>
    createMountedTabs(
      startIndex,
      tabCount,
      lazy ? resolvedLazyPreloadDistance : tabCount
    )
  );

  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  // An explicit pinnedHeaderHeight wins; otherwise the rendered pinned header
  // is auto-measured (its wrapper sizes to content and reports via onLayout).
  const [measuredPinnedTotal, setMeasuredPinnedTotal] = useState(0);
  const pinnedTotal =
    pinnedHeaderHeight != null
      ? pinnedHeaderHeight + topInset
      : renderPinnedHeader
        ? Math.max(measuredPinnedTotal, topInset)
        : topInset;
  const resolvedPinnedHeaderHeight = Math.max(0, pinnedTotal - topInset);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(
    estimatedHeaderHeight
  );
  // Smallest content that lets any page hold the fully-collapsed chrome:
  // maxScroll (= content − viewport) must cover the header's collapse range,
  // or switching here from a collapsed tab pops the chrome open. Derived from
  // the measured container and header so it's exact for any header size — an
  // empty page scrolls precisely the collapse distance and no further. The
  // window height stands in until the container reports its first layout
  // (oversized, never short — a too-small minimum is the one failure mode).
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(0);
  const resolvedMinContentHeight =
    minPageContentHeight ??
    (measuredContainerHeight || screenHeight) + measuredHeaderHeight;
  const resolvedSwipeGestureTopInset =
    swipeGestureTopInset === 'auto'
      ? pinnedTotal + measuredHeaderHeight + tabBarHeight
      : Math.max(0, swipeGestureTopInset);
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

  const headerHeight = useSharedValue(estimatedHeaderHeight);
  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(startIndex);
  const translateX = useSharedValue(-startIndex * screenWidth);
  const startX = useSharedValue(0);
  const isPanning = useSharedValue(false);
  const pillWidth = useSharedValue(0);
  // True while the active list is momentum-scrolling (fling deceleration).
  const momentumActive = useSharedValue(false);
  // True for the remainder of a touch that landed during momentum (a "grab").
  const grabCatch = useSharedValue(false);

  // Custom pull-to-refresh state (Android stretch mode only).
  const usesCustomPull = IS_ANDROID && pullDownBehavior === 'stretch';
  // Mirrored into a shared value so gesture worklets read the live mode even
  // when pullDownBehavior changes at runtime.
  const usesCustomPullSV = useSharedValue(usesCustomPull);
  useEffect(() => {
    usesCustomPullSV.value = usesCustomPull;
  }, [usesCustomPull, usesCustomPullSV]);
  // Latest RefreshControl config per tab, reported by the list wrappers.
  const refreshConfigs = useRef<
    ({ refreshing: boolean; onRefresh?: () => void } | null)[]
  >([]);
  // True while the active tab is refreshing — holds the indicator down.
  const refreshingHold = useSharedValue(false);
  const isPulling = useSharedValue(false);

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

  useEffect(() => {
    if (estimatedHeaderHeight > 0 && headerHeight.value === 0) {
      headerHeight.value = estimatedHeaderHeight;
    }
    if (estimatedHeaderHeight > 0 && measuredHeaderHeight === 0) {
      setMeasuredHeaderHeight(estimatedHeaderHeight);
    }
  }, [estimatedHeaderHeight, headerHeight, measuredHeaderHeight]);

  // Mirror the live window width into a shared value so worklets read the
  // current width after rotation / split-view / foldable resizes.
  const pageWidth = useSharedValue(screenWidth);
  useEffect(() => {
    pageWidth.value = screenWidth;
    // Re-anchor the pager to the active page at the new width, no animation.
    cancelAnimation(translateX);
    translateX.value = -activeIndex.value * screenWidth;
  }, [screenWidth, activeIndex, pageWidth, translateX]);

  // Honor the OS "reduce motion" setting: snap instantly instead of springing.
  // Mirrored into a shared value so the pan worklet can read the live value.
  const reduceMotion = useReducedMotion();
  const reduceMotionSV = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
  }, [reduceMotion, reduceMotionSV]);

  const pagerOffset = useDerivedValue(() =>
    Math.max(0, Math.min(-translateX.value / pageWidth.value, tabCount - 1))
  );

  // Pre-allocate refs and per-page scrollY values. Tab count is stable for the
  // lifetime of this component (the outer Container remounts it on change), so
  // these hook loops always run the same number of times per mount.
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
          pageScrollY.value = e.contentOffset.y;
          if (activeIndex.value === i) {
            scrollY.value = e.contentOffset.y;
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

  // Stop every list dead at its current offset. Kills background flings and
  // in-flight animated scrolls (e.g. a scroll-to-top that was still running
  // when the user moved on) so no page drifts away from where syncLists put
  // it — a drifted page shows up later as a gap between header and content.
  const freezeLists = useCallback(
    () => {
      'worklet';
      for (let i = 0; i < listRefs.length; i++) {
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (ref && y) scrollToMountedRef(ref, 0, y.value, false);
      }
    },
    // listRefs / perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount]
  );

  const syncLists = useCallback(
    (excludeIndex: number = -1) => {
      'worklet';
      for (let i = 0; i < listRefs.length; i++) {
        if (i === excludeIndex) continue;
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) continue;
        const target =
          scrollY.value < headerHeight.value
            ? scrollY.value
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

  const spring = useMemo(
    () => ({ ...DEFAULT_SPRING, ...(springConfig ?? {}) }),
    [springConfig]
  );

  // Notify JS of tab changes from the pan worklet (tap/imperative changes go
  // through goToIndex, which calls this directly).
  const handleIndexChange = useCallback(
    (index: number) => {
      mountTabsAround(index);
      // The pull indicator hold belongs to the active tab.
      refreshingHold.value = !!refreshConfigs.current[index]?.refreshing;
      onIndexChange?.(index);
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
      // Nothing to call — release the optimistic hold.
      refreshingHold.value = false;
    }
  }, [tabCount, activeIndex, refreshingHold]);

  // A finger that lands on a moving list drifts vertically (it instinctively
  // tracks the content) far more than one starting a swipe at rest, so the
  // tight at-rest failOffsetY would almost always fail the pager pan before
  // activeOffsetX could activate it — making mid-momentum page swipes nearly
  // impossible with a real finger. While momentum is running (and for the rest
  // of a touch that grabbed it) swap in a relaxed fail distance. RNGH v3
  // shared-value config keeps the native handler in sync as these flip.
  const resolvedMomentumFail = Math.max(
    momentumSwipeFailDistance,
    swipeFailDistance
  );
  const failOffsetYStartSV = useDerivedValue(
    () =>
      momentumActive.value || grabCatch.value
        ? -resolvedMomentumFail
        : -swipeFailDistance,
    [resolvedMomentumFail, swipeFailDistance]
  );
  const failOffsetYEndSV = useDerivedValue(
    () =>
      momentumActive.value || grabCatch.value
        ? resolvedMomentumFail
        : swipeFailDistance,
    [resolvedMomentumFail, swipeFailDistance]
  );

  // Gesture Handler v3 hooks memoize internally — no useMemo wrapper needed.
  const panGesture = usePanGesture({
    enabled: swipeEnabled,
    activeOffsetX: [-swipeActivationDistance, swipeActivationDistance],
    failOffsetY: [failOffsetYStartSV, failOffsetYEndSV],
    // Refuse to activate in the left-edge zone so iOS edge-swipe-back /
    // Android gesture-nav stay responsive.
    hitSlop: pagerPanHitSlop,
    onTouchesDown: () => {
      'worklet';
      if (!momentumActive.value) return;
      // X-style grab: this touch caught a decelerating list. Keep the relaxed
      // fail offsets for the rest of the touch (momentumActive flips false the
      // moment the fling stops) so grab drift can't kill the horizontal pan.
      grabCatch.value = true;
      momentumActive.value = false;
      if (NEEDS_EXPLICIT_GRAB_STOP) {
        const i = clampTabIndex(activeIndex.value, tabCount);
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        // Freeze the list under the finger. Skip the overscroll/bounce zone —
        // pinning a bounced offset would fight the scroll view's snap-back.
        if (ref && y && y.value > 0) {
          scrollToMountedRef(ref, 0, y.value, false);
        }
      }
    },
    onActivate: () => {
      'worklet';
      isPanning.value = true;
      startX.value = translateX.value;
      freezeLists();
      syncLists(activeIndex.value);
    },
    onUpdate: (e) => {
      'worklet';
      if (!isPanning.value) return;
      const w = pageWidth.value;
      const raw = startX.value + e.translationX;
      // Rubber-band past first/last page: matches iOS feel.
      translateX.value = rubberBand(raw, -(tabCount - 1) * w, 0);
    },
    onDeactivate: (e) => {
      'worklet';
      const w = pageWidth.value;
      const velocity = e.velocityX;
      const prevIndex = activeIndex.value;
      // Project where the finger is heading rather than only where it
      // released, so a short fast flick still flips the page (iOS feel).
      const nextIndex = resolveSnapIndex(
        prevIndex,
        e.translationX,
        velocity,
        w,
        tabCount
      );
      activeIndex.value = nextIndex;

      const target = -nextIndex * w;
      // Rubber-band overscroll release: translateX sits past the first/last
      // page bounds. Handing the raw release velocity to the spring there
      // (with overshootClamping) can complete the snap in ~1 frame — a visible
      // jump. Drop the velocity for the overscroll snap-back so it always
      // springs smoothly; keep it for in-bounds page flicks (iOS flick feel).
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
      // Hand the header to the landing page: scrollY is only written by the
      // active page's scroll events, so without this it keeps the outgoing
      // page's value until the new page first scrolls. Normally a no-op (the
      // pages were just synced to match), it heals the cases where they
      // diverged — e.g. a background fling that syncLists couldn't see.
      const landedY = perPageScrollY[nextIndex];
      if (landedY) scrollY.value = landedY.value;
      // A swipe that lands on a different tab must fire onIndexChange too.
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

  // Each scroll view gets its own Native gesture. Wrapping the RN scroll view
  // in a Native gesture is required on Android — otherwise RNGH consumes the
  // touch at the native level and the list never scrolls inside the pan's
  // detector region.
  //
  // `requireToFail: panGesture` makes the scroll wait for the pan to fail before
  // it activates: a horizontal drag activates the pan (the pan never fails) so
  // the list stays frozen during a page swipe (no scroll flick), while a
  // vertical drag fails the pan quickly (failOffsetY) and the scroll takes over.
  // Do NOT add `disallowInterruption` here — it cancels every other handler,
  // including the tab-button taps, while the list is scrolling.
  //
  // These gestures MUST be hosted in a host GestureDetector by the list
  // wrappers, not a VirtualGestureDetector. Virtually-attached Native gestures
  // never receive touch events on Android (the handler never leaves
  // UNDETERMINED, verified on RNGH 3.0.0), which leaves the scroll view running
  // outside RNGH arbitration. That breaks the X-style momentum grab: touching a
  // decelerating list makes the ScrollView intercept at ACTION_DOWN (the native
  // fling catch) and its requestDisallowInterceptTouchEvent makes RNGH cancel
  // every handler — including this pan — before a horizontal drag can be
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
  const listNativeGestures: ReturnType<typeof useNativeGesture>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    listNativeGestures.push(useNativeGesture({ requireToFail: panGesture }));
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  // The custom pull pan (Android stretch mode). Engages only when the active
  // list sits at its top; activates on a downward drag (the pager pan has
  // already failed by then via its failOffsetY) and fails fast on horizontal
  // or upward movement so paging and scrolling are untouched. Simultaneous
  // with the list Native gestures: at offset 0 a downward drag can't scroll,
  // but the scroll handler may still claim the touch — it must not cancel us.
  const pullEnabled = useDerivedValue(() => {
    if (!usesCustomPullSV.value) return false;
    const i = clampTabIndex(activeIndex.value, tabCount);
    const y = perPageScrollY[i];
    return (y ? y.value : 1) <= 1;
  }, [tabCount]);

  const pullPan = usePanGesture({
    enabled: pullEnabled,
    activeOffsetY: PULL_ACTIVATION,
    failOffsetY: -1,
    failOffsetX: [-16, 16],
    simultaneousWith: listNativeGestures,
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
        // Already refreshing — settle back onto the hold position.
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
  // relations — their offsets keep them mutually exclusive, and the pull's
  // `enabled` shared value keeps it inert outside Android stretch mode.
  const pagerGestures = useCompetingGestures(panGesture, pullPan);

  // Release the indicator hold when the active tab's refresh completes.
  useAnimatedReaction(
    () => refreshingHold.value,
    (current, previous) => {
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

  // The pull indicator sits under the pinned bar at zIndex below the header,
  // so it is revealed naturally as the header rides down with the pull.
  const pullIndicatorStyle = useAnimatedStyle(() => {
    const reveal = interpolate(
      -scrollY.value,
      [0, PULL_HOLD_OFFSET],
      [0, 1],
      'clamp'
    );
    return {
      opacity: reveal,
      transform: [{ scale: 0.6 + 0.4 * reveal }],
    };
  });

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      // Android stretch pull: the list can't overscroll (no native bounce),
      // so ride the whole pager down with the pull — header, tab bar, and
      // content move as one surface, like the iOS bounce. scrollY is never
      // negative outside the pull, so this is 0 in all normal scrolling.
      {
        translateY:
          usesCustomPullSV.value && scrollY.value < 0 ? -scrollY.value : 0,
      },
    ],
  }));

  const stretch = pullDownBehavior === 'stretch';
  const collapsibleHeaderStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          translateY: collapseTranslateY(
            scrollY.value,
            headerHeight.value,
            stretch
          ),
        },
      ],
    };
  });

  // syncLists is a worklet that calls scrollTo (a UI-thread op on native), so
  // on native we hop to the UI thread synchronously. Web has no separate UI
  // thread and react-native-worklets does not implement runOnUISync there, so
  // we invoke the worklet inline (it runs on the JS/main thread on web).
  const runSyncListsNow = useCallback(() => {
    if (Platform.OS === 'web') {
      syncLists();
    } else {
      runOnUISync(syncLists);
    }
  }, [syncLists]);

  // Programmatic tab change (tap / imperative / controlled prop): mirror what
  // the pan gesture does — freeze any moving list, sync pages to the header
  // state, and hand scrollY to the destination page (see onDeactivate).
  const runPrepareForIndexChangeNow = useCallback(
    (nextIndex: number) => {
      const prepare = () => {
        'worklet';
        freezeLists();
        syncLists();
        const y = perPageScrollY[nextIndex];
        if (y) scrollY.value = y.value;
      };
      if (Platform.OS === 'web') {
        prepare();
      } else {
        runOnUISync(prepare);
      }
    },
    // perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [freezeLists, syncLists, scrollY, tabCount]
  );

  const goToIndex = useCallback(
    (index: number, animated: boolean = true) => {
      const clamped = clampTabIndex(index, tabCount);
      const current = activeIndex.value;
      const distance = Math.abs(clamped - current);
      const target = -clamped * pageWidth.value;

      activeIndex.value = clamped;
      cancelAnimation(translateX);
      runPrepareForIndexChangeNow(clamped);

      if (!animated || reduceMotionSV.value) {
        translateX.value = target;
        runSyncListsNow();
      } else {
        const duration = SNAP_DURATION_BASE + distance * SNAP_DURATION_PER_PAGE;
        translateX.value = withTiming(
          target,
          { duration, easing: Easing.out(Easing.quad) },
          () => {
            'worklet';
            syncLists();
          }
        );
      }
      handleIndexChange(clamped);
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
    ]
  );

  // X behavior: tapping the already-active tab scrolls its list back to the
  // top (header fully revealed).
  const scrollActiveTabToTop = useCallback(
    () => {
      const scrollTop = () => {
        'worklet';
        const i = clampTabIndex(activeIndex.value, tabCount);
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (!ref || !y) return;
        // A re-tap lands on the tab button, not the list, so an in-flight
        // fling is never touch-cancelled and races the animated scroll below
        // (settles short of 0). Stop the list dead first — same trick as
        // freezeLists.
        scrollToMountedRef(ref, 0, y.value, false);
        // The platform's animated scrollTo runs in near-constant time, so
        // from a deep offset the header-reveal range (the last headerHeight
        // of travel) flashes by in a frame or two — a visible jump. Teleport
        // to one viewport above the reveal range first, then animate, so the
        // reveal plays out at the same pace from any depth.
        const cap = headerHeight.value + viewportHeight;
        if (y.value > cap) {
          if (scrollToMountedRef(ref, 0, cap, false)) {
            y.value = cap;
            if (activeIndex.value === i) scrollY.value = cap;
          }
        }
        scrollToMountedRef(ref, 0, 0, true);
      };
      if (Platform.OS === 'web') {
        scrollTop();
        return;
      }
      runOnUISync(scrollTop);
      // A React commit landing in the animation's last frames can override
      // its final writes (reproduced with DISABLE_COMMIT_PAUSING_MECHANISM),
      // parking the list a frame short of 0 — the header rests visibly shy
      // of fully expanded. Re-check after the animation and snap the
      // remainder; the snap is a one-frame correction of at most the
      // tolerance, so it reads as the animation completing.
      setTimeout(() => {
        const settle = () => {
          'worklet';
          const i = clampTabIndex(activeIndex.value, tabCount);
          const ref = listRefs[i];
          const y = perPageScrollY[i];
          if (!ref || !y) return;
          if (y.value > 0 && y.value <= SCROLL_TOP_SETTLE_TOLERANCE) {
            scrollToMountedRef(ref, 0, 0, false);
          }
        };
        runOnUISync(settle);
      }, SCROLL_TOP_SETTLE_CHECK_MS);
    },
    // listRefs / perPageScrollY entries are stable for a given tabCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabCount, activeIndex, scrollY, headerHeight, viewportHeight]
  );

  const handleTabPress = useCallback(
    (index: number) => {
      if (
        clampTabIndex(index, tabCount) ===
        clampTabIndex(activeIndex.value, tabCount)
      ) {
        // Re-tap on the active tab: no index change to announce.
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

  // Controlled mode: follow the `index` prop whenever it diverges from the
  // pager. Gesture-driven changes report via onIndexChange and the parent's
  // state echo lands here as a no-op (clamped === active).
  useEffect(() => {
    if (controlledIndex == null) return;
    const clamped = clampTabIndex(controlledIndex, tabCount);
    if (clamped !== clampTabIndex(activeIndex.value, tabCount)) {
      goToIndex(clamped, true);
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

  const contextValue: InternalTabsContextValue = useMemo(
    () => ({
      scrollY,
      headerHeight,
      activeIndex,
      pagerOffset,
      pillWidth,
      pinnedHeaderHeight: resolvedPinnedHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      minPageContentHeight: resolvedMinContentHeight,
      listRefs,
      perPageScrollY,
      scrollHandlers,
      listNativeGestures,
      pullDownBehavior,
      usesCustomPull,
      reportRefreshConfig,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      resolvedPinnedHeaderHeight,
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

  const tabBarProps: TabBarRenderProps = {
    tabs: tabs.map((t) => t.config),
    scrollY,
    headerHeight,
    activeIndex,
    pagerOffset,
    pillWidth,
    pinnedHeaderHeight: resolvedPinnedHeaderHeight,
    tabBarHeight,
    topInset,
    pullDownBehavior,
    onTabPress: handleTabPress,
  };

  const tabBarNode = renderTabBar ? (
    renderTabBar(tabBarProps)
  ) : (
    <DefaultTabBar {...tabBarProps} />
  );

  const content = (
    <View
      style={[styles.container, containerStyle]}
      onLayout={(e) => setMeasuredContainerHeight(e.nativeEvent.layout.height)}
    >
      {renderPinnedHeader ? (
        <View
          // Explicit height when the prop is given; otherwise size to content
          // and report the measured total (content + its own inset padding).
          style={[
            styles.pinnedHeader,
            pinnedHeaderHeight != null ? { height: pinnedTotal } : null,
          ]}
          pointerEvents="box-none"
          onLayout={
            pinnedHeaderHeight == null
              ? (e) => setMeasuredPinnedTotal(e.nativeEvent.layout.height)
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
          onLayout={(e) => {
            const nextHeaderHeight = e.nativeEvent.layout.height;
            headerHeight.value = nextHeaderHeight;
            setMeasuredHeaderHeight(nextHeaderHeight);
          }}
        >
          {renderHeader({
            scrollY,
            headerHeight,
            topInset,
            pinnedHeaderHeight: resolvedPinnedHeaderHeight,
          })}
        </Animated.View>
      ) : null}

      {IS_ANDROID ? (
        // Custom pull indicator (stretch mode): zIndex below the header, so
        // the header riding down with the pull reveals it. pointerEvents none
        // — purely visual.
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
            {tabs.map((t, index) => {
              const shouldRender = !lazy || mountedTabIndices.has(index);

              return (
                <View
                  key={t.key}
                  style={[styles.page, { width: screenWidth }]}
                  collapsable={false}
                >
                  {shouldRender ? (
                    <TabIndexContext.Provider value={index}>
                      {t.children}
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

  return (
    <TabsContext.Provider value={contextValue}>
      {/* Native hosts the gesture system once at the root via
          InterceptingGestureDetector (see the IS_WEB note up top). Web uses the
          standalone host detectors directly and skips the intercepting wrapper. */}
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
