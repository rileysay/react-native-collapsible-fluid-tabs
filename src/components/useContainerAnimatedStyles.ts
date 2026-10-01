import { Platform } from 'react-native';
import {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { PULL_HOLD_OFFSET, type RefreshTabState } from '../utils/refresh';
import { collapseTranslateY, getHeaderScrollOffset } from '../utils/paging';
import type { ContainerProps } from '../types';

const IS_ANDROID = Platform.OS === 'android';

export function useContainerAnimatedStyles({
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
  const pullIndicatorStyle = useAnimatedStyle(
    IS_ANDROID
      ? () => {
          'worklet';
          const offset = getHeaderScrollOffset(
            activeIndex.value,
            tabCount,
            perPageScrollY,
            scrollY,
            scrollToTopIndex.value,
            scrollToTopOffset.value
          );
          const reveal = interpolate(
            -offset,
            [0, PULL_HOLD_OFFSET],
            [0, 1],
            'clamp'
          );
          const refresh = refreshStates.value[activeIndex.value];
          return {
            opacity:
              refresh?.canRefresh || refresh?.refreshing || refresh?.pending
                ? reveal
                : 0,
            transform: [{ scale: 0.6 + 0.4 * reveal }],
          };
        }
      : () => {
          'worklet';
          // Only Android renders this indicator. Keep its unused updater free
          // of scroll inputs on iOS/web rather than running it on every frame.
          return { opacity: 0, transform: [{ scale: 0.6 }] };
        }
  );

  const pagerStyle = useAnimatedStyle(
    IS_ANDROID
      ? () => {
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
        }
      : () => {
          'worklet';
          // Selecting a separate closure matters: Reanimated subscribes to
          // captured shared values, even when a branch never reads them.
          return {
            transform: [{ translateX: translateX.value }, { translateY: 0 }],
          };
        }
  );

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
