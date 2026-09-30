import { useMemo, type ReactElement } from 'react';
import {
  Platform,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { renderListComponent } from '../utils/renderListComponent';
import { useAutoRefreshControl } from './useAutoRefreshControl';
import { useListScrollMetrics } from './useListScrollMetrics';
import { useTrackedScrollRef } from './useTrackedScrollRef';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
export const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host the list's Native gesture on its scrollable component.
export const ListDetector = GestureDetector;

/** Props every adapter reads itself before forwarding the rest to its list. */
export type TabListInput = Pick<
  ScrollViewProps,
  | 'onScrollBeginDrag'
  | 'onMomentumScrollBegin'
  | 'onMomentumScrollEnd'
  | 'onLayout'
  | 'onContentSizeChange'
  | 'scrollEnabled'
  | 'decelerationRate'
  | 'overScrollMode'
  | 'directionalLockEnabled'
  | 'nestedScrollEnabled'
  | 'showsVerticalScrollIndicator'
> & {
  contentContainerStyle?: unknown;
  minContentHeight?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
};

const TAB_LIST_KEYS = [
  'minContentHeight',
  'onScrollBeginDrag',
  'onLayout',
  'onContentSizeChange',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'onRefresh',
  'refreshing',
  'progressViewOffset',
] as const;

/** The consumer's props for the list itself, in their original order. */
export function omitTabListProps<P extends object>(
  props: P
): Omit<P, (typeof TAB_LIST_KEYS)[number]> {
  const rest = { ...props } as Record<string, unknown>;
  for (const key of TAB_LIST_KEYS) delete rest[key];
  return rest as Omit<P, (typeof TAB_LIST_KEYS)[number]>;
}

/**
 * Page setup shared by every list adapter: scroll metrics, the Container's
 * page ref and Native gesture, the refresh control, chrome spacer sizes, and
 * the scroll props each list receives after the consumer's own props.
 */
export function useTabList(
  props: TabListInput,
  shorthand?: Parameters<typeof useAutoRefreshControl>[2]
) {
  const ctx = useTabsContext();
  const index = useTabIndex();
  const scrollMetrics = useListScrollMetrics(ctx.listScrollMetrics[index]!, {
    onLayout: props.onLayout,
    onContentSizeChange: props.onContentSizeChange,
    scrollEnabled: props.scrollEnabled,
    decelerationRate: props.decelerationRate,
  });
  const {
    listRefs,
    listMounted,
    listNativeGestures,
    scrollHandlers,
    headerHeight,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    bottomInset,
    minPageContentHeight,
  } = ctx;

  const listRef = listRefs[index];
  const trackedRef = useTrackedScrollRef(listRef, listMounted[index]);
  // Container creates one Native gesture for every registered tab index.
  const nativeGesture = listNativeGestures[index]!;
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture,
    shorthand
  );

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));
  // Static per layout (no shared values), so a plain View — an animated
  // style here would register a do-nothing Reanimated mapper per page.
  // Just the safe-area inset + breathing room: the tab bar is top chrome and
  // never overlaps the list bottom.
  const footerSpacerHeight = bottomInset + FOOTER_GAP;
  const minHeight = props.minContentHeight ?? minPageContentHeight;

  // Spread after the consumer's props. Reanimated inserts momentum listeners
  // while filtering onScroll, so supplied callbacks follow it; absent ones are
  // omitted, because an undefined prop would disable their listener.
  const scrollProps = {
    onScroll: scrollHandlers[index],
    ...(props.onScrollBeginDrag
      ? { onScrollBeginDrag: props.onScrollBeginDrag }
      : {}),
    ...(props.onMomentumScrollBegin
      ? { onMomentumScrollBegin: props.onMomentumScrollBegin }
      : {}),
    ...(props.onMomentumScrollEnd
      ? { onMomentumScrollEnd: props.onMomentumScrollEnd }
      : {}),
    scrollEventThrottle: 1,
    ...scrollMetrics,
    overScrollMode: props.overScrollMode ?? 'never',
    directionalLockEnabled: props.directionalLockEnabled ?? true,
    nestedScrollEnabled: props.nestedScrollEnabled ?? true,
    showsVerticalScrollIndicator: props.showsVerticalScrollIndicator ?? false,
    contentContainerStyle: [{ minHeight }, props.contentContainerStyle],
  };

  return {
    listRef,
    trackedRef,
    nativeGesture,
    refreshControl,
    headerSpacerStyle,
    footerSpacerHeight,
    scrollProps,
  };
}

/** Wraps a virtualized list's own header and footer with the chrome spacers. */
export function useListSpacers(
  {
    headerSpacerStyle,
    footerSpacerHeight,
  }: Pick<
    ReturnType<typeof useTabList>,
    'headerSpacerStyle' | 'footerSpacerHeight'
  >,
  userHeader: unknown,
  userFooter: unknown
) {
  const ListHeaderComponent = useMemo(
    () => (
      <>
        <Animated.View style={headerSpacerStyle} />
        {renderListComponent(userHeader)}
      </>
    ),
    [headerSpacerStyle, userHeader]
  );

  const ListFooterComponent = useMemo(
    () => (
      <>
        {renderListComponent(userFooter)}
        <View style={{ height: footerSpacerHeight }} />
      </>
    ),
    [userFooter, footerSpacerHeight]
  );

  return { ListHeaderComponent, ListFooterComponent };
}
