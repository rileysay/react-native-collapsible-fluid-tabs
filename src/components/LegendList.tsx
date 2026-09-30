import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import type { LegendListRef } from '@legendapp/list/react-native';
import type {
  AnimatedLegendListProps,
  AnimatedLegendListSharedValues,
} from '@legendapp/list/reanimated';
import Animated from 'react-native-reanimated';

import {
  isNativeHeaderScrollEnabled,
  useSingleHeaderScrollComponent,
} from './SingleHeader';
import {
  ListDetector,
  USE_DIRECT_WEB_SCROLL,
  omitTabListProps,
  useListSpacers,
  useTabList,
} from './useTabList';

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
let AnimatedLegendList:
  | typeof import('@legendapp/list/reanimated').AnimatedLegendList
  | null = null;
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
  const { sharedValues: userSharedValues, ...consumerProps } = props;
  const listProps = omitTabListProps(consumerProps);
  if (!AnimatedLegendList) {
    throw new Error(
      '[collapsible-fluid-tabs] Tabs.LegendList requires the optional peer dependency @legendapp/list. Install it with: npm install @legendapp/list'
    );
  }
  const page = useTabList(props, {
    onRefresh: props.onRefresh,
    refreshing: props.refreshing,
    progressViewOffset: props.progressViewOffset,
  });
  const { trackedRef, nativeGesture, refreshControl } = page;
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

  const { ListHeaderComponent, ListFooterComponent } = useListSpacers(
    page,
    props.ListHeaderComponent,
    props.ListFooterComponent
  );

  // LegendList's web scroller is a DOM div with overflow:auto. Without a
  // bounded height it grows with its content, so the mouse wheel has nothing
  // to scroll. v3 requires a fixed height, flex:1, or useWindowScroll.
  // https://legendapp.com/open-source/list/v3/guides/
  const style = [
    { flex: 1, minHeight: 0, height: '100%' as const },
    listProps.style,
  ];

  const renderScrollComponent = useSingleHeaderScrollComponent(
    listProps.renderScrollComponent ??
      (Platform.OS === 'web' ? renderWebScrollComponent : undefined),
    nativeGesture
  );
  const list = (
    <AnimatedLegendList
      {...listProps}
      style={style}
      renderScrollComponent={renderScrollComponent}
      refScrollView={trackedRef}
      refreshControl={refreshControl}
      // AnimatedLegendList forwards its scroll-view ref through Reanimated's
      // event manager. Use that public path for scroll/drag/momentum events.
      {...page.scrollProps}
      sharedValues={sharedValues}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
    />
  );

  // Native header scroll moves this detector onto the actual scroll view (see
  // renderScrollComponent). A gesture must never be attached to two detectors.
  if (USE_DIRECT_WEB_SCROLL || isNativeHeaderScrollEnabled()) return list;

  return <ListDetector gesture={nativeGesture}>{list}</ListDetector>;
}
