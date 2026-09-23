import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  GestureStateManager,
  usePanGesture,
  type useNativeGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { clampTabIndex } from '../utils/paging';
import type { DirectionConfig } from '../utils/gestureDirection';
import { useDirectionalPan } from './useDirectionalPan';
import type { HeaderScroll } from './useHeaderScroll';
import {
  getPullOffset,
  PULL_HOLD_OFFSET,
  PULL_RESISTANCE,
  resolvePullRelease,
  type RefreshTabState,
} from '../utils/refresh';

type CustomPullOptions = {
  directionConfig: DirectionConfig;
  headerScroll?: HeaderScroll;
  headerScrollEnabled?: boolean;
  containsHeaderTouch?: (y: number) => boolean;
  usesCustomPullSV: SharedValue<boolean>;
  activeIndex: SharedValue<number>;
  tabCount: number;
  perPageScrollY: SharedValue<number>[];
  scrollY: SharedValue<number>;
  isPanning: SharedValue<boolean>;
  isPulling: SharedValue<boolean>;
  refreshingHold: SharedValue<boolean>;
  refreshStates: SharedValue<RefreshTabState[]>;
  pinnedTotal: number;
  nativeListGestures: ReturnType<typeof useNativeGesture>[];
  cancelScrollToTop: () => void;
  triggerActiveRefresh: (index: number) => void;
};

export function useCustomPullGesture({
  directionConfig,
  headerScroll,
  headerScrollEnabled = false,
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
  nativeListGestures,
  cancelScrollToTop,
  triggerActiveRefresh,
}: CustomPullOptions) {
  // Chrome dragging and Android stretch share the pager's direction boundary.
  // Content touches require a downward pull at the list's top. Simultaneous
  // Native list gestures let that pull survive the pager releasing its wait.
  const customPullEnabled = useSharedValue(false);
  const pullStartIndex = useSharedValue(-1);
  const pullStartOffset = useSharedValue(0);
  const pullStartTranslation = useSharedValue(0);
  const pullStartedRefreshing = useSharedValue(false);
  const headerTouch = useSharedValue(false);
  const headerDragging = useSharedValue(false);
  const headerRawOffset = useSharedValue(0);
  const headerLastTranslation = useSharedValue(0);
  const touchIndex = useSharedValue(-1);
  const releaseVelocity = useSharedValue(0);
  const cancelHeaderDrag = useCallback(() => {
    'worklet';
    headerDragging.value = false;
    // The native list may already be disabled or detached. Relinquish the
    // header's ownership without issuing a final scroll command to it.
    if (headerScroll?.index.value === pullStartIndex.value) {
      headerScroll.cancel(false);
    }
    if (isPulling.value && activeIndex.value === pullStartIndex.value) {
      isPulling.value = false;
      refreshingHold.value = false;
      scrollY.value = Math.max(
        0,
        perPageScrollY[activeIndex.value]?.value ?? 0
      );
    }
  }, [
    activeIndex,
    headerDragging,
    headerScroll,
    isPulling,
    perPageScrollY,
    pullStartIndex,
    refreshingHold,
    scrollY,
  ]);
  const canActivatePull = useCallback(() => {
    'worklet';
    const index = clampTabIndex(activeIndex.value, tabCount);
    return usesCustomPullSV.value && (perPageScrollY[index]?.value ?? 1) <= 1;
  }, [activeIndex, perPageScrollY, tabCount, usesCustomPullSV]);
  const canActivateVertical = useCallback(
    (dy: number) => {
      'worklet';
      if (touchIndex.value !== activeIndex.value) return false;
      return headerTouch.value
        ? !!headerScroll?.canScroll()
        : dy > 0 && canActivatePull();
    },
    [activeIndex, touchIndex, headerTouch, headerScroll, canActivatePull]
  );
  const pullDirection = useDirectionalPan(
    'vertical',
    directionConfig,
    canActivateVertical
  );
  useAnimatedReaction(
    () => {
      'worklet';
      if (headerScrollEnabled) return true;
      if (!usesCustomPullSV.value) return false;
      const i = clampTabIndex(activeIndex.value, tabCount);
      const y = perPageScrollY[i];
      return (y ? y.value : 1) <= 1;
    },
    (enabled) => {
      'worklet';
      customPullEnabled.value = enabled;
    },
    Platform.OS === 'web' ? [tabCount, headerScrollEnabled] : undefined
  );

  const customPullPan = usePanGesture(
    useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
      () => ({
        enabled: customPullEnabled,
        testID: 'fluid-tabs-vertical',
        manualActivation: true,
        ...pullDirection,
        // Attached at the container root, so the pull can start anywhere on the
        // page or its chrome (tab bar, header) — except the pinned bar, which is
        // fixed navigation and must not drive the pull.
        hitSlop: { top: -pinnedTotal },
        simultaneousWith: nativeListGestures,
        onTouchesDown: (e) => {
          'worklet';
          if (e.allTouches.length === 1) {
            headerScroll?.cancel();
            touchIndex.value = activeIndex.value;
            const touch = e.allTouches[0]!;
            headerTouch.value =
              headerScrollEnabled && !!containsHeaderTouch?.(touch.y);
          }
          pullDirection.onTouchesDown(e);
          if (!headerTouch.value && !canActivatePull()) {
            GestureStateManager.fail(e.handlerTag);
          }
        },
        onActivate: (e) => {
          'worklet';
          releaseVelocity.value = 0;
          const index = clampTabIndex(activeIndex.value, tabCount);
          if (headerTouch.value && headerScroll) {
            cancelScrollToTop();
            if (!headerScroll.begin()) {
              GestureStateManager.fail(e.handlerTag);
              return;
            }
            headerDragging.value = true;
            pullStartIndex.value = index;
            // Begin at the activation position without replaying the movement
            // used to distinguish a vertical drag from a tap or page swipe.
            headerLastTranslation.value = e.translationY;
            headerRawOffset.value =
              usesCustomPullSV.value && scrollY.value < 0
                ? scrollY.value / PULL_RESISTANCE
                : headerScroll.offset.value;
            isPulling.value = headerRawOffset.value < 0;
            const state = refreshStates.value[index];
            pullStartedRefreshing.value = !!(
              state?.refreshing || state?.pending
            );
            return;
          }
          if (!canActivatePull()) {
            GestureStateManager.fail(e.handlerTag);
            return;
          }
          cancelScrollToTop();
          isPulling.value = true;
          cancelAnimation(scrollY);
          pullStartIndex.value = index;
          pullStartOffset.value = Math.max(0, -scrollY.value);
          pullStartTranslation.value = e.translationY;
          const state = refreshStates.value[index];
          pullStartedRefreshing.value = !!(state?.refreshing || state?.pending);
        },
        onUpdate: (e) => {
          'worklet';
          if (headerDragging.value && headerScroll) {
            if (
              activeIndex.value !== pullStartIndex.value ||
              headerScroll.index.value !== pullStartIndex.value
            )
              return;
            // A gesture callback can arrive before the invalidation reaction.
            // Check availability before changing the visible header offset.
            if (!headerScrollEnabled || !headerScroll.canScroll()) {
              cancelHeaderDrag();
              return;
            }
            const delta = e.translationY - headerLastTranslation.value;
            headerLastTranslation.value = e.translationY;
            // Clamp each step at the bottom so reversing the finger responds
            // immediately. Android stretch can cross zero into a resisted pull.
            const raw = Math.min(
              headerScroll.maxOffset(),
              headerRawOffset.value - delta
            );
            headerRawOffset.value = usesCustomPullSV.value
              ? raw
              : Math.max(0, raw);
            if (headerRawOffset.value < 0) {
              isPulling.value = true;
              cancelAnimation(scrollY);
              scrollY.value = headerRawOffset.value * PULL_RESISTANCE;
              headerScroll.move(0);
            } else {
              isPulling.value = false;
              refreshingHold.value = false;
              scrollY.value = headerRawOffset.value;
              headerScroll.move(headerRawOffset.value);
            }
            return;
          }
          if (
            !isPulling.value ||
            !usesCustomPullSV.value ||
            activeIndex.value !== pullStartIndex.value
          ) {
            return;
          }
          const pageY = perPageScrollY[pullStartIndex.value]?.value ?? 0;
          if (pageY > 1) {
            // Native scrolling can win while this pan's disable update is queued.
            // Hand back the real offset immediately; a later finalize is stale.
            isPulling.value = false;
            refreshingHold.value = false;
            scrollY.value = pageY;
            return;
          }
          scrollY.value = -getPullOffset(
            pullStartOffset.value,
            e.translationY,
            pullStartTranslation.value
          );
        },
        onDeactivate: (e) => {
          'worklet';
          releaseVelocity.value = e.canceled ? 0 : e.velocityY;
        },
        onFinalize: (e) => {
          'worklet';
          if (headerDragging.value && headerScroll) {
            headerDragging.value = false;
            // Navigation/native input may already own the list. Never finish
            // an old chrome drag into the next page or a newer animation.
            if (
              headerScroll.index.value !== pullStartIndex.value ||
              activeIndex.value !== pullStartIndex.value
            )
              return;
            if (!headerScrollEnabled || !headerScroll.canScroll()) {
              cancelHeaderDrag();
              return;
            }
            headerScroll.finish(
              e.canceled || isPulling.value ? 0 : -releaseVelocity.value
            );
          }
          if (!isPulling.value) return;
          isPulling.value = false;
          const index = pullStartIndex.value;
          const state = refreshStates.value[index];
          const release = resolvePullRelease({
            canceled: e.canceled,
            validPull:
              usesCustomPullSV.value &&
              index === activeIndex.value &&
              (perPageScrollY[index]?.value ?? 1) <= 1,
            pulled: Math.max(0, -scrollY.value),
            startedRefreshing: pullStartedRefreshing.value,
            state,
          });
          // A changed tab/mode owns scrollY now. Never settle or refresh it from
          // the old gesture's final event.
          if (release === 'cancel') {
            const pageY = perPageScrollY[index]?.value ?? 0;
            if (
              usesCustomPullSV.value &&
              index === activeIndex.value &&
              pageY > 1
            ) {
              refreshingHold.value = false;
              scrollY.value = pageY;
            }
            return;
          }
          refreshingHold.value = release === 'hold' || release === 'refresh';
          scrollY.value = withTiming(
            refreshingHold.value ? -PULL_HOLD_OFFSET : 0,
            {
              duration: refreshingHold.value ? 180 : 220,
            }
          );
          if (release === 'refresh' && state) {
            const next = [...refreshStates.value];
            next[index] = { ...state, pending: true };
            refreshStates.value = next;
            scheduleOnRN(triggerActiveRefresh, index);
          }
        },
      }),
      [
        customPullEnabled,
        pullDirection,
        canActivatePull,
        cancelHeaderDrag,
        containsHeaderTouch,
        headerScroll,
        headerScrollEnabled,
        headerTouch,
        headerDragging,
        headerRawOffset,
        headerLastTranslation,
        touchIndex,
        releaseVelocity,
        pinnedTotal,
        nativeListGestures,
        activeIndex,
        tabCount,
        usesCustomPullSV,
        perPageScrollY,
        cancelScrollToTop,
        isPulling,
        scrollY,
        pullStartIndex,
        pullStartOffset,
        pullStartTranslation,
        refreshStates,
        pullStartedRefreshing,
        refreshingHold,
        triggerActiveRefresh,
      ]
    )
  );

  useAnimatedReaction(
    () => ({
      dragging: headerDragging.value,
      enabled: headerScrollEnabled,
      owner: headerScroll?.index.value ?? -1,
      available: headerScroll?.canScroll() ?? false,
    }),
    (current) => {
      'worklet';
      if (!current.dragging) return;
      if (
        !current.enabled ||
        !current.available ||
        current.owner !== pullStartIndex.value
      ) {
        cancelHeaderDrag();
      }
    }
  );

  // Invalidate a gesture as soon as its page or mode changes. Release events
  // also check ownership because a gesture callback may beat this reaction.
  useAnimatedReaction(
    () => ({ enabled: usesCustomPullSV.value, index: activeIndex.value }),
    (current, previous) => {
      'worklet';
      if (
        previous &&
        ((current.enabled && current.index !== previous.index) ||
          (previous.enabled && !current.enabled))
      ) {
        isPulling.value = false;
        refreshingHold.value = false;
        if (scrollY.value < 0) {
          cancelAnimation(scrollY);
          scrollY.value = Math.max(
            0,
            perPageScrollY[current.index]?.value ?? 0
          );
        }
      }
    }
  );

  // Controlled refresh can also start without a pull. Reveal it at the top,
  // without replacing a genuine scrolled position. Callback identity changes
  // do not restore a hold that the user dismissed by paging.
  useAnimatedReaction(
    () => {
      'worklet';
      return {
        hold: refreshingHold.value,
        enabled: usesCustomPullSV.value,
        panning: isPanning.value,
      };
    },
    (current) => {
      'worklet';
      if (!current.enabled || isPulling.value) return;
      if (current.hold && !current.panning) {
        const index = clampTabIndex(activeIndex.value, tabCount);
        if ((perPageScrollY[index]?.value ?? 1) <= 1) {
          cancelScrollToTop();
          scrollY.value = withTiming(-PULL_HOLD_OFFSET, { duration: 180 });
        }
      } else if (!current.hold && scrollY.value < 0) {
        scrollY.value = withTiming(0, { duration: 220 });
      }
    }
  );

  return customPullPan;
}
