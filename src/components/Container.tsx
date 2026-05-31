import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  type Ref,
} from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  GestureDetector,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  scrollTo,
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
// Width of the left-edge zone where the tab pan gesture refuses to activate,
// leaving room for iOS edge-swipe-back / Android gesture-nav.
const EDGE_SWIPE_MARGIN = 20;
const DEFAULT_SPRING: Required<NonNullable<ContainerProps['springConfig']>> = {
  damping: 30,
  stiffness: 200,
  mass: 1,
  overshootClamping: true,
};

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

  const {
    tabs,
    containerRef,
    renderHeader,
    renderPinnedHeader,
    pinnedHeaderHeight = 0,
    tabBarHeight = DEFAULT_TAB_BAR_HEIGHT,
    initialIndex = 0,
    onIndexChange,
    renderTabBar,
    containerStyle,
    swipeEnabled = true,
    swipeActivationDistance = DEFAULT_SWIPE_ACTIVATION,
    swipeFailDistance = DEFAULT_SWIPE_FAIL,
    springConfig,
    minPageContentHeight,
    pullDownBehavior = 'static',
  } = props;

  const resolvedMinContentHeight = minPageContentHeight ?? screenHeight * 1.3;

  const tabCount = tabs.length;

  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const pinnedTotal = pinnedHeaderHeight + topInset;

  const headerHeight = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(initialIndex);
  const translateX = useSharedValue(-initialIndex * screenWidth);
  const startX = useSharedValue(0);
  const isPanning = useSharedValue(false);
  const pillWidth = useSharedValue(0);

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
      })
    );
    /* eslint-enable react-hooks/rules-of-hooks */
  }

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
          scrollTo(ref, 0, target, false);
          y.value = target;
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
  // through goToIndex, which calls onIndexChange directly).
  const notifyIndexChange = useCallback(
    (index: number) => {
      onIndexChange?.(index);
    },
    [onIndexChange]
  );

  // Gesture Handler v3 hooks memoize internally — no useMemo wrapper needed.
  const panGesture = usePanGesture({
    enabled: swipeEnabled,
    activeOffsetX: [-swipeActivationDistance, swipeActivationDistance],
    failOffsetY: [-swipeFailDistance, swipeFailDistance],
    // Refuse to activate in the left-edge zone so iOS edge-swipe-back /
    // Android gesture-nav stay responsive.
    hitSlop: { left: -EDGE_SWIPE_MARGIN },
    onActivate: () => {
      'worklet';
      isPanning.value = true;
      startX.value = translateX.value;
      for (let i = 0; i < listRefs.length; i++) {
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (ref && y) scrollTo(ref, 0, y.value, false);
      }
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
      if (reduceMotionSV.value) {
        translateX.value = target;
      } else {
        // Hand the release velocity to the spring so the snap continues the
        // flick instead of restarting from rest.
        translateX.value = withSpring(target, { ...spring, velocity });
      }
      syncLists(nextIndex);
      // A swipe that lands on a different tab must fire onIndexChange too.
      if (nextIndex !== prevIndex) {
        scheduleOnRN(notifyIndexChange, nextIndex);
      }
    },
    onFinalize: () => {
      'worklet';
      isPanning.value = false;
    },
  });

  // Each scroll view gets its own Native gesture. Wrapping the RN scroll view
  // in a Native gesture is required on Android — otherwise RNGH consumes the
  // touch at the native level and the list never scrolls inside the pan's
  // detector region. `requireToFail: panGesture` makes the scroll wait for the
  // pan to fail before it activates: a horizontal drag activates the pan (the
  // pan never fails) so the list stays frozen during a page swipe (no scroll
  // flick), while a vertical drag fails the pan quickly (failOffsetY) and the
  // scroll takes over. tabCount is stable for this component's lifetime.
  const listNativeGestures: ReturnType<typeof useNativeGesture>[] = [];
  for (let i = 0; i < tabCount; i++) {
    /* eslint-disable react-hooks/rules-of-hooks */
    listNativeGestures.push(useNativeGesture({ requireToFail: panGesture }));
    /* eslint-enable react-hooks/rules-of-hooks */
  }

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
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

  const goToIndex = useCallback(
    (index: number, animated: boolean = true) => {
      const clamped = Math.max(0, Math.min(index, tabCount - 1));
      const current = activeIndex.value;
      const distance = Math.abs(clamped - current);
      const target = -clamped * pageWidth.value;

      activeIndex.value = clamped;
      cancelAnimation(translateX);
      runSyncListsNow();

      if (!animated || reduceMotionSV.value) {
        translateX.value = target;
        runSyncListsNow();
      } else {
        const duration = 250 + distance * 50;
        translateX.value = withTiming(
          target,
          { duration, easing: Easing.out(Easing.quad) },
          () => {
            'worklet';
            syncLists();
          }
        );
      }
      onIndexChange?.(clamped);
    },
    [
      activeIndex,
      translateX,
      pageWidth,
      syncLists,
      runSyncListsNow,
      onIndexChange,
      tabCount,
      reduceMotionSV,
    ]
  );

  const handleTabPress = useCallback(
    (index: number) => goToIndex(index, true),
    [goToIndex]
  );

  useImperativeHandle(
    containerRef,
    () => ({
      setIndex: (index: number, animated: boolean = true) =>
        goToIndex(index, animated),
      getIndex: () => Math.round(activeIndex.value),
    }),
    [goToIndex, activeIndex]
  );

  const contextValue: InternalTabsContextValue = useMemo(
    () => ({
      scrollY,
      headerHeight,
      activeIndex,
      pagerOffset,
      pillWidth,
      pinnedHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      minPageContentHeight: resolvedMinContentHeight,
      listRefs,
      perPageScrollY,
      scrollHandlers,
      listNativeGestures,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pinnedHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      resolvedMinContentHeight,
      tabCount,
    ]
  );

  const tabBarProps: TabBarRenderProps = {
    tabs: tabs.map((t) => t.config),
    scrollY,
    headerHeight,
    activeIndex,
    pagerOffset,
    pillWidth,
    pinnedHeaderHeight,
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

  return (
    <TabsContext.Provider value={contextValue}>
      <View style={[styles.container, containerStyle]}>
        {renderPinnedHeader ? (
          <View
            style={[
              styles.pinnedHeader,
              { height: pinnedHeaderHeight + topInset },
            ]}
            pointerEvents="box-none"
          >
            {renderPinnedHeader({
              scrollY,
              headerHeight,
              topInset,
              pinnedHeaderHeight,
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
              headerHeight.value = e.nativeEvent.layout.height;
            }}
          >
            {renderHeader({
              scrollY,
              headerHeight,
              topInset,
              pinnedHeaderHeight,
            })}
          </Animated.View>
        ) : null}

        <View style={styles.tabBarSlot} pointerEvents="box-none">
          {tabBarNode}
        </View>

        <View style={styles.pagerHost}>
          <GestureDetector gesture={panGesture} touchAction="pan-y">
            <Animated.View
              style={[
                styles.pager,
                { width: screenWidth * tabCount },
                pagerStyle,
              ]}
            >
              {tabs.map((t, index) => (
                <View
                  key={t.key}
                  style={[styles.page, { width: screenWidth }]}
                  collapsable={false}
                >
                  <TabIndexContext.Provider value={index}>
                    {t.children}
                  </TabIndexContext.Provider>
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
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
