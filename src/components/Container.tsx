import { useCallback, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  scrollTo,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIndexContext, TabsContext } from '../context';
import { extractTabs } from '../utils/children';
import type {
  ContainerProps,
  InternalTabsContextValue,
  TabBarRenderProps,
} from '../types';
import { DefaultTabBar } from './DefaultTabBar';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const DEFAULT_TAB_BAR_HEIGHT = 56;
const DEFAULT_SWIPE_ACTIVATION = 15;
const DEFAULT_SWIPE_FAIL = 10;
const DEFAULT_SPRING: Required<NonNullable<ContainerProps['springConfig']>> = {
  damping: 30,
  stiffness: 200,
  mass: 1,
  overshootClamping: true,
};

export function Container(props: ContainerProps) {
  const {
    children,
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
    minPageContentHeight = SCREEN_HEIGHT * 1.3,
  } = props;

  const tabs = useMemo(() => extractTabs(children), [children]);
  const tabCount = tabs.length;

  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const pinnedTotal = pinnedHeaderHeight + topInset;

  const headerHeight = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(initialIndex);
  const translateX = useSharedValue(-initialIndex * SCREEN_WIDTH);
  const startX = useSharedValue(0);
  const isPanning = useSharedValue(false);
  const pillWidth = useSharedValue(0);

  const pagerOffset = useDerivedValue(() =>
    Math.max(0, Math.min(-translateX.value / SCREEN_WIDTH, tabCount - 1))
  );

  // Pre-allocate refs and per-page scrollY values. Tab count must be stable
  // across renders or React's hook order will break.
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

  const spring = { ...DEFAULT_SPRING, ...(springConfig ?? {}) };

  const panGesture = Gesture.Pan()
    .enabled(swipeEnabled)
    .activeOffsetX([-swipeActivationDistance, swipeActivationDistance])
    .failOffsetY([-swipeFailDistance, swipeFailDistance])
    .onStart(() => {
      'worklet';
      isPanning.value = true;
      startX.value = translateX.value;
      for (let i = 0; i < listRefs.length; i++) {
        const ref = listRefs[i];
        const y = perPageScrollY[i];
        if (ref && y) scrollTo(ref, 0, y.value, false);
      }
      syncLists(activeIndex.value);
    })
    .onUpdate((e) => {
      'worklet';
      if (!isPanning.value) return;
      translateX.value = startX.value + e.translationX;
    })
    .onEnd((e) => {
      'worklet';
      const moved = e.translationX;
      const velocity = e.velocityX;

      if (moved < -SCREEN_WIDTH / 4 || velocity < -800) {
        activeIndex.value = Math.min(activeIndex.value + 1, tabCount - 1);
      } else if (moved > SCREEN_WIDTH / 4 || velocity > 800) {
        activeIndex.value = Math.max(activeIndex.value - 1, 0);
      }

      translateX.value = withSpring(-activeIndex.value * SCREEN_WIDTH, spring);
      syncLists(activeIndex.value);
    })
    .onFinalize(() => {
      'worklet';
      isPanning.value = false;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, Gesture.Native());

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const scrollEnabledProps = useAnimatedProps(() => ({
    scrollEnabled: !isPanning.value,
  })) as unknown as { scrollEnabled: boolean };

  const handleTabPress = useCallback(
    (index: number) => {
      const distance = Math.abs(index - activeIndex.value);
      const duration = 250 + distance * 50;
      activeIndex.value = index;
      cancelAnimation(translateX);
      translateX.value = withTiming(
        -index * SCREEN_WIDTH,
        { duration, easing: Easing.out(Easing.quad) },
        () => {
          'worklet';
          syncLists();
        }
      );
      onIndexChange?.(index);
    },
    [activeIndex, translateX, syncLists, onIndexChange]
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
      minPageContentHeight,
      listRefs,
      perPageScrollY,
      scrollHandlers,
      panGesture: composedGesture,
      scrollEnabledProps,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pinnedHeaderHeight,
      tabBarHeight,
      topInset,
      bottomInset,
      minPageContentHeight,
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
              { height: pinnedHeaderHeight + topInset, paddingTop: topInset },
            ]}
            pointerEvents="box-none"
          >
            {renderPinnedHeader()}
          </View>
        ) : null}

        {renderHeader ? (
          <View
            style={[styles.collapsibleHeader, { top: pinnedTotal }]}
            pointerEvents="box-none"
            onLayout={(e) => {
              headerHeight.value = e.nativeEvent.layout.height;
            }}
          >
            {renderHeader()}
          </View>
        ) : null}

        <View
          style={[styles.tabBarSlot, { top: pinnedTotal }]}
          pointerEvents="box-none"
        >
          {tabBarNode}
        </View>

        <View style={styles.pagerHost}>
          <GestureDetector gesture={composedGesture}>
            <Animated.View
              style={[
                styles.pager,
                { width: SCREEN_WIDTH * tabCount },
                pagerStyle,
              ]}
            >
              {tabs.map((t, index) => (
                <View key={t.key} style={styles.page} collapsable={false}>
                  <TabIndexContext.Provider value={index}>
                    {t.children}
                  </TabIndexContext.Provider>
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
        </View>

        <View pointerEvents="box-only" style={styles.edgeBlocker} />
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
    left: 0,
    right: 0,
    zIndex: 20,
  },
  pagerHost: { flex: 1 },
  pager: { flexDirection: 'row', flex: 1 },
  page: { width: SCREEN_WIDTH, height: '100%' },
  edgeBlocker: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
});
