import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import type { LegendListRef } from '@legendapp/list/react-native';
import type {
  AnimatedLegendListProps,
  AnimatedLegendListSharedValues,
} from '@legendapp/list/reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabIndex, useTabsContext } from '../context';
import { FOOTER_GAP } from '../constants';
import { renderListComponent } from '../utils/renderListComponent';
import { useAutoRefreshControl } from './useAutoRefreshControl';
import { useTrackedScrollRef } from './useTrackedScrollRef';
import { useListScrollMetrics } from './useListScrollMetrics';

// On web the browser scroll view should stay a plain DOM scroller; wrapping it
// in a Native GestureDetector steals horizontal pointer drags from the pager.
const USE_DIRECT_WEB_SCROLL = Platform.OS === 'web';
// Host the list's Native gesture on its scrollable component.
const ListDetector = GestureDetector;

function renderWebScrollComponent(
  props: React.ComponentProps<typeof Animated.ScrollView>
) {
  // LegendList 3.3 passes 0 to its internal scroller. React Native Web treats
  // that as start/end-only events, leaving virtualization behind while moving.
  // Override it at the actual scroller; the list's public throttle is separate.
  return <Animated.ScrollView {...props} scrollEventThrottle={1} />;
}

// @legendapp/list is an optional peer: the require lives in a try/catch so
// Metro treats it as an optional dependency (`allowOptionalDependencies`, on
// by default in Expo / RN CLI configs) and consumers without it installed can
// still import the library. Only rendering Tabs.LegendList requires it.
let AnimatedLegendList: React.ComponentType<any> | null = null;
try {
  AnimatedLegendList = require('@legendapp/list/reanimated').AnimatedLegendList;
} catch {
  // Left null; Tabs.LegendList throws a descriptive error when rendered.
}

export type TabsLegendListProps<T> = Omit<
  AnimatedLegendListProps<T>,
  'onScroll' | 'scrollEventThrottle' | 'refScrollView' | 'sharedValues'
> & {
  ref?: React.Ref<LegendListRef>;
  /** Observe scroll offset with useCollapsibleHeader; other list-state outputs can be supplied here. */
  sharedValues?: Omit<AnimatedLegendListSharedValues, 'scrollOffset'>;
  /**
   * Optional minimum content height. Defaults to the container's
   * `minPageContentHeight` (container height + measured header height).
   */
  minContentHeight?: number;
};

export function LegendList<T>(props: TabsLegendListProps<T>) {
  const {
    onRefresh,
    refreshing,
    progressViewOffset,
    minContentHeight,
    sharedValues: userSharedValues,
    onScrollBeginDrag,
    onLayout,
    onContentSizeChange,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    ...listProps
  } = props;
  if (!AnimatedLegendList) {
    throw new Error(
      '[collapsible-fluid-tabs] Tabs.LegendList requires the optional peer dependency @legendapp/list. Install it with: npm install @legendapp/list'
    );
  }
  const ctx = useTabsContext();
  const index = useTabIndex();
  const scrollMetrics = useListScrollMetrics(ctx.listScrollMetrics[index]!, {
    onLayout,
    onContentSizeChange,
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

  const ref = listRefs[index];
  const trackedRef = useTrackedScrollRef(ref, listMounted[index]);
  const nativeGesture = listNativeGestures[index];
  const refreshControl = useAutoRefreshControl(
    props.refreshControl,
    nativeGesture,
    { onRefresh, refreshing, progressViewOffset }
  );
  // LegendList's scrollOffset output installs its own native listener and JS
  // initialization write. Sharing our page value with it bypasses the pager's
  // ownership guard: delayed scroll events can rewind a header drag or glide.
  // Keep onScroll as the only writer of native offsets. LegendList retains
  // its own internal offset when it needs one for sticky items.
  const sharedValues = useMemo(
    () =>
      userSharedValues
        ? { ...userSharedValues, scrollOffset: undefined }
        : undefined,
    [userSharedValues]
  );

  const headerSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeight.value + pinnedHeaderHeight + topInset + tabBarHeight,
  }));

  // Static per layout (no shared values), so a plain View — an animated
  // style here would register a do-nothing Reanimated mapper per page.
  // Just the safe-area inset + breathing room: the tab bar is top chrome and
  // never overlaps the list bottom.
  const footerSpacerHeight = bottomInset + FOOTER_GAP;

  const userListHeader = props.ListHeaderComponent;
  const userListFooter = props.ListFooterComponent;

  const ListHeaderComponent = useMemo(
    () => (
      <>
        <Animated.View style={headerSpacerStyle} />
        {renderListComponent(userListHeader)}
      </>
    ),
    [headerSpacerStyle, userListHeader]
  );

  const ListFooterComponent = useMemo(
    () => (
      <>
        {renderListComponent(userListFooter)}
        <View style={{ height: footerSpacerHeight }} />
      </>
    ),
    [userListFooter, footerSpacerHeight]
  );

  const minHeight = minContentHeight ?? minPageContentHeight;

  const contentContainerStyle = [{ minHeight }, props.contentContainerStyle];
  // LegendList's web scroller is a DOM div with overflow:auto. Without a
  // bounded height it grows with its content, so the mouse wheel has nothing
  // to scroll. v3 requires a fixed height, flex:1, or useWindowScroll.
  // https://legendapp.com/open-source/list/v3/guides/
  const style = [
    { flex: 1, minHeight: 0, height: '100%' as const },
    listProps.style,
  ];

  const Component = AnimatedLegendList as unknown as React.ComponentType<any>;

  const list = (
    <Component
      {...listProps}
      style={style}
      renderScrollComponent={
        listProps.renderScrollComponent ??
        (Platform.OS === 'web' ? renderWebScrollComponent : undefined)
      }
      refScrollView={trackedRef}
      refreshControl={refreshControl}
      // AnimatedLegendList forwards its scroll-view ref through Reanimated's
      // event manager. Use that public path for scroll/drag/momentum events.
      onScroll={scrollHandlers[index]}
      {...(onScrollBeginDrag ? { onScrollBeginDrag } : {})}
      {...(onMomentumScrollBegin ? { onMomentumScrollBegin } : {})}
      {...(onMomentumScrollEnd ? { onMomentumScrollEnd } : {})}
      sharedValues={sharedValues}
      scrollEventThrottle={1}
      {...scrollMetrics}
      overScrollMode={props.overScrollMode ?? 'never'}
      directionalLockEnabled={props.directionalLockEnabled ?? true}
      nestedScrollEnabled={props.nestedScrollEnabled ?? true}
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={contentContainerStyle}
    />
  );

  if (USE_DIRECT_WEB_SCROLL) return list;

  return <ListDetector gesture={nativeGesture}>{list}</ListDetector>;
}
