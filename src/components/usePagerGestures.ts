import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  GestureStateManager,
  useCompetingGestures,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  withSpring,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { RefreshTabState } from '../utils/refresh';
import {
  clampTabIndex,
  collapseTranslateY,
  getHeaderScrollOffset,
  resolveSnapIndex,
  rubberBand,
} from '../utils/paging';
import type { ContainerProps } from '../types';
import { isNativeHeaderScrollEnabled } from './SingleHeader';
import { useCustomPullGesture } from './useCustomPullGesture';
import { useDirectionalPan } from './useDirectionalPan';
import type { HeaderScroll } from './useHeaderScroll';
import { useWebContentDrag } from './useWebContentDrag';
import { stopScrollAtOffset } from '../utils/scrollRef';
import {
  DEFAULT_SWIPE_ACTIVATION,
  DEFAULT_SWIPE_FAIL,
  DEFAULT_SWIPE_DIRECTION_RATIO,
} from '../utils/gestureDirection';

// The Android host Native gesture lets ScrollView handle a momentum catch.
// On iOS we explicitly stop deceleration while the list recognizer waits for
// the pager's directional decision. This path still needs device coverage.
const NEEDS_EXPLICIT_GRAB_STOP = Platform.OS !== 'android';

export function usePagerGestures({
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
  listRefs: AnimatedRef<any>[];
  listMounted: SharedValue<boolean>[];
  perPageScrollY: SharedValue<number>[];
  isPanning: SharedValue<boolean>;
  nativePaging: SharedValue<boolean>;
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
          momentumActive.value = false;
          if (NEEDS_EXPLICIT_GRAB_STOP) {
            const i = clampTabIndex(activeIndex.value, tabCount);
            const ref = listRefs[i];
            const y = perPageScrollY[i];
            if (ref && y && y.value > 0) {
              stopScrollAtOffset(
                ref,
                listMounted[i],
                y.value,
                headerScroll.maxOffset()
              );
            }
          }
        },
        onActivate: () => {
          'worklet';
          isPanning.value = true;
          nativePaging.value = true;
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
            nativePaging.value = false;
          } else {
            translateX.value = withSpring(
              target,
              { ...spring, velocity: overscrolled ? 0 : velocity },
              (finished) => {
                // Native scroll ownership moves only after the page settles.
                if (finished) nativePaging.value = false;
              }
            );
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
        },
      }),
      [
        swipeEnabled,
        pagerDirection,
        headerScroll,
        pagerPanHitSlop,
        swipeGestureTopInset,
        isPanning,
        nativePaging,
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
  // requireToFail resolves only the handlerTag. Preserve the real target across
  // pager config changes, but follow tag changes (including Fast Refresh).
  const pagerWaitTarget = useMemo(
    () => pagerPanGesture,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagerPanGesture.handlerTag]
  );
  const nativeListConfig = useMemo(
    () => ({
      requireToFail: pagerWaitTarget,
      onTouchesDown: () => {
        'worklet';
        headerScroll.cancel();
      },
    }),
    [pagerWaitTarget, headerScroll]
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
    // With native header scroll, UIKit owns header drags through the active list.
    headerScrollEnabled: headerScrollEnabled && !isNativeHeaderScrollEnabled(),
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
    // handlerTag. Context memoization must follow tag changes, including
    // tags recreated by Fast Refresh.
    pullPanGesture: customPullPan,
  };
}
