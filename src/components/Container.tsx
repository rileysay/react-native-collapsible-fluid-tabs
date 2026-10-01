import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
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
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnUISync } from 'react-native-worklets';
import { TabIndexContext, TabsContext } from '../context';
import { extractTabs, type ExtractedTab } from '../utils/children';
import type { RefreshTabState } from '../utils/refresh';
import { clampTabIndex } from '../utils/paging';
import type {
  ContainerProps,
  HeaderRenderProps,
  InternalTabsContextValue,
  TabBarRenderProps,
  TabsRef,
} from '../types';
import { DefaultTabBar } from './DefaultTabBar';
import { isNativeHeaderScrollEnabled, SingleHeaderHost } from './SingleHeader';
import { useWebWheelScroll } from './useWebWheelScroll';
import {
  DEFAULT_SWIPE_ACTIVATION,
  DEFAULT_SWIPE_FAIL,
  DEFAULT_SWIPE_DIRECTION_RATIO,
} from '../utils/gestureDirection';
import { useMountedTabs } from './useMountedTabs';
import { useNativePagerFrame } from './useNativePagerFrame';
import { usePagerListState } from './usePagerListState';
import { usePagerGestures } from './usePagerGestures';
import { useTabNavigation } from './useTabNavigation';
import { useContainerMeasurements } from './useContainerMeasurements';
import { useContainerAnimatedStyles } from './useContainerAnimatedStyles';
import { usePagerOffset } from './usePagerOffset';

const DEFAULT_TAB_BAR_HEIGHT = 56;

// Native pager/pull handlers attach above both the page row and its sibling
// chrome overlays. Tab taps use virtual detectors under that intercepting
// root; each list hosts its own Native gesture on the scrollable component.
// Web attaches the pager to the stationary viewport and leaves list scrollers
// without a Native detector so their pointer drags can reach the pager.
const IS_WEB = Platform.OS === 'web';

const IS_ANDROID = Platform.OS === 'android';

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

/** Coordinates named tab pages, a collapsing header, and an optional pinned header. */
export function Container({
  ref,
  ...props
}: ContainerProps & { ref?: Ref<TabsRef> }) {
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

interface ContainerImplProps extends ContainerProps {
  tabs: ExtractedTab[];
  containerRef: Ref<TabsRef> | undefined;
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
  onPagerLayout: (width: number) => void;
  onPinnedHeaderHeight: (height: number) => void;
  onHeaderHeight: (height: number) => void;
  collapsibleHeaderStyle: ReturnType<
    typeof useContainerAnimatedStyles
  >['collapsibleHeaderStyle'];
  pullIndicatorStyle: ReturnType<
    typeof useContainerAnimatedStyles
  >['pullIndicatorStyle'];
  pagerGestures: ReturnType<typeof usePagerGestures>['pagerGestures'];
  verticalGesture: ReturnType<typeof usePagerGestures>['pullPanGesture'];
  layoutWidth: number;
  tabCount: number;
  pagerStyle: ReturnType<typeof useContainerAnimatedStyles>['pagerStyle'];
  nativePaging: SharedValue<boolean>;
  headerScrollEnabled: boolean;
  lazy: boolean;
  mountedTabIndices: Set<number>;
}

interface HeaderRendererProps extends HeaderRenderProps {
  renderer: NonNullable<ContainerProps['renderHeader']>;
  // Width is an internal invalidation input; it is not part of the public
  // render props. Resizing must still let the renderer recreate its content.
  layoutWidth: number;
}

// Keep expensive consumer header trees out of selected-index reconciliation.
// React still propagates descendant context and local state through this memo
// boundary. Keep host wrappers and measurement callbacks outside it.
const HeaderRenderer = memo(function HeaderRenderer({
  renderer,
  scrollY,
  headerHeight,
  topInset,
  pinnedHeaderHeight,
}: HeaderRendererProps) {
  return renderer({ scrollY, headerHeight, topInset, pinnedHeaderHeight });
});

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
  onPagerLayout,
  onPinnedHeaderHeight,
  onHeaderHeight,
  collapsibleHeaderStyle,
  pullIndicatorStyle,
  pagerGestures,
  verticalGesture,
  layoutWidth,
  tabCount,
  pagerStyle,
  nativePaging,
  headerScrollEnabled,
  lazy,
  mountedTabIndices,
}: ContainerContentProps) {
  const usesNativeHost = !IS_WEB && isNativeHeaderScrollEnabled();
  const pagerFrame = useNativePagerFrame(
    containerStyle,
    usesNativeHost,
    layoutWidth
  );
  const tabBarProps: TabBarRenderProps = {
    tabs: tabs.map((t) => t.config),
    scrollY,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    tabCount,
    headerHeight,
    activeIndex,
    selectedIndex,
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

  const pinnedHeader = renderPinnedHeader ? (
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
      <HeaderRenderer
        renderer={renderPinnedHeader}
        scrollY={scrollY}
        headerHeight={headerHeight}
        topInset={topInset}
        pinnedHeaderHeight={resolvedPinnedHeaderHeight}
        layoutWidth={layoutWidth}
      />
    </View>
  ) : null;

  const chrome = (
    <>
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
          <HeaderRenderer
            renderer={renderHeader}
            scrollY={scrollY}
            headerHeight={headerHeight}
            topInset={topInset}
            pinnedHeaderHeight={resolvedPinnedHeaderHeight}
            layoutWidth={layoutWidth}
          />
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

  const pagerHost = (
    <View
      style={styles.pagerHost}
      onLayout={(e) => onPagerLayout(e.nativeEvent.layout.width)}
    >
      {pagerRow}
    </View>
  );

  // With iOS native header scroll, the host carries the active list's pan, so
  // the pinned area sits outside it and never drives the list. The region
  // behind the pinned header takes touches on its blank parts and on a bare
  // safe-area inset, as the JS header drag excludes the whole area; taps there
  // do not reach the collapsed header behind it. The host fills the root like
  // the absolute chrome it wraps. The root still resolves its own padding,
  // around an empty probe where the pager used to be, and the pager is placed
  // at the probe's measured frame. Until then it is hidden from sight, touch
  // and accessibility, unless the whole host is known to be its place.
  if (usesNativeHost) {
    return (
      <View
        style={[styles.container, containerStyle]}
        onLayout={(e) =>
          onContainerLayout(
            e.nativeEvent.layout.width,
            e.nativeEvent.layout.height
          )
        }
      >
        {pinnedHeader}
        {pinnedTotal > 0 ? (
          <View
            style={[styles.pinnedRegion, { height: pinnedTotal }]}
            pointerEvents="auto"
          />
        ) : null}
        <View
          style={styles.contentProbe}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={pagerFrame.onProbeLayout}
        />
        <SingleHeaderHost
          activeIndex={activeIndex}
          paging={nativePaging}
          headerScrollEnabled={headerScrollEnabled}
          style={styles.nativeHost}
          onLayout={pagerFrame.onHostLayout}
        >
          {chrome}
          <View
            style={[
              styles.pagerFrame,
              pagerFrame.style ?? styles.pagerFrameFill,
              pagerFrame.ready ? null : styles.unresolved,
            ]}
            pointerEvents={pagerFrame.ready ? 'box-none' : 'none'}
            accessibilityElementsHidden={!pagerFrame.ready}
            importantForAccessibility={
              pagerFrame.ready ? 'auto' : 'no-hide-descendants'
            }
          >
            {pagerHost}
          </View>
        </SingleHeaderHost>
      </View>
    );
  }

  return (
    <SingleHeaderHost
      activeIndex={activeIndex}
      paging={nativePaging}
      headerScrollEnabled={headerScrollEnabled}
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
            {pinnedHeader}
            {chrome}
          </View>
        </GestureDetector>
      ) : (
        <>
          {pinnedHeader}
          {chrome}
        </>
      )}
      {IS_WEB ? (
        <GestureDetector gesture={pagerGestures} touchAction="pan-y">
          {pagerHost}
        </GestureDetector>
      ) : (
        pagerHost
      )}
    </SingleHeaderHost>
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
    setMeasuredPagerWidth,
    measuredPagerWidth,
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
  // Pages match the pager's clipping viewport, which container padding and
  // borders make narrower than the container itself.
  const layoutWidth =
    measuredPagerWidth || measuredContainerWidth || screenWidth;
  const handleContainerLayout = useCallback(
    (width: number, height: number) => {
      setMeasuredContainerWidth(width);
      setMeasuredContainerHeight(height);
    },
    [setMeasuredContainerWidth, setMeasuredContainerHeight]
  );
  const handlePagerLayout = useCallback(
    (width: number) => {
      // A hidden container reports zero; keep the last visible viewport.
      if (width > 0) setMeasuredPagerWidth(width);
    },
    [setMeasuredPagerWidth]
  );

  const scrollY = useSharedValue(0);
  const activeIndex = useSharedValue(startIndex);
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  const translateX = useSharedValue(-startIndex * layoutWidth);
  const startX = useSharedValue(0);
  const isPanning = useSharedValue(false);
  const nativePaging = useSharedValue(false);
  const pillWidth = useSharedValue(0);
  const momentumActive = useSharedValue(false);

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
      nativePaging.value = false;
    };
    if (IS_WEB) resizePager();
    else runOnUISync(resizePager);
  }, [
    layoutWidth,
    activeIndex,
    pageWidth,
    translateX,
    isPanning,
    nativePaging,
  ]);

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
    stopList,
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
      listRefs,
      listMounted,
      perPageScrollY,
      isPanning,
      nativePaging,
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
      onPagerLayout={handlePagerLayout}
      onPinnedHeaderHeight={setMeasuredPinnedTotal}
      onHeaderHeight={handleHeaderHeight}
      collapsibleHeaderStyle={collapsibleHeaderStyle}
      pullIndicatorStyle={pullIndicatorStyle}
      pagerGestures={pagerGestures}
      verticalGesture={pullPanGesture}
      layoutWidth={layoutWidth}
      tabCount={tabCount}
      pagerStyle={pagerStyle}
      nativePaging={nativePaging}
      headerScrollEnabled={headerScrollEnabled}
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
  pinnedRegion: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  nativeHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // The root's content box, where the pager goes. The explicit cross size
  // keeps an empty view from collapsing under a non-stretching alignItems;
  // the old pager followed its row's width there instead.
  contentProbe: { flex: 1, width: '100%', height: '100%' },
  pagerFrame: { position: 'absolute', left: 0, right: 0, direction: 'ltr' },
  pagerFrameFill: { top: 0, bottom: 0 },
  unresolved: { opacity: 0 },
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
