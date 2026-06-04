import React, { useState } from 'react';
import { Platform, type RefreshControlProps } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTabsContext } from '../context';

type RefreshControlElement = React.ReactElement<RefreshControlProps>;

/**
 * Prepares a `RefreshControl` to work inside the pager on Android. Two fixes,
 * both injected by cloning the element:
 *
 * 1. **Gesture relation (the important one).** A scroll view wrapped in a
 *    Native gesture inside the pan's detector swallows the touch-release that
 *    Android's `SwipeRefreshLayout` needs, so pull-to-refresh shows the spinner
 *    but only commits on a *second* touch. Cloning the RefreshControl with
 *    `block: <list's native gesture>` makes the refresh gesture block the
 *    scroll (the scroll yields to it) — the same relation RNGH's own
 *    `ScrollView`/`FlatList` set up internally (they make the scroll `waitFor`
 *    the refresh gesture). **Requires a gesture-aware RefreshControl** — import
 *    it from `react-native-gesture-handler`, not `react-native`, or `block` has
 *    nothing to attach to.
 * 2. **progressViewOffset.** Android's native refresh indicator cannot be
 *    z-ordered above an absolute animated header. Keep it below all chrome
 *    (pinned + inset + collapsing header + tab bar) so it remains visible in
 *    both `'static'` and `'stretch'` modes.
 *
 * No-op on iOS/web or when no `refreshControl` is passed. A consumer-provided
 * `progressViewOffset` always wins.
 */
export function useAutoRefreshControl(
  refreshControl: RefreshControlElement | undefined,
  nativeGesture?: object
): RefreshControlElement | undefined {
  const ctx = useTabsContext();

  const isAndroid = Platform.OS === 'android';
  const needsOffset =
    !!refreshControl &&
    isAndroid &&
    refreshControl.props.progressViewOffset == null;
  const needsBlock = !!refreshControl && isAndroid && !!nativeGesture;

  const [headerH, setHeaderH] = useState(0);
  useAnimatedReaction(
    () => (needsOffset ? ctx.headerHeight.value : 0),
    (v, prev) => {
      if (v !== prev) scheduleOnRN(setHeaderH, v);
    }
  );

  if (!needsOffset && !needsBlock) return refreshControl;

  // `block` is not part of RefreshControlProps (it's an RNGH gesture relation
  // honored by the gesture-aware RefreshControl), so build a loose object and
  // cast for cloneElement.
  const injected: Record<string, unknown> = {};
  if (needsOffset) {
    injected.progressViewOffset =
      ctx.pinnedHeaderHeight + ctx.topInset + headerH + ctx.tabBarHeight;
  }
  if (needsBlock) {
    injected.block = nativeGesture;
  }
  return React.cloneElement(
    refreshControl,
    injected as unknown as Partial<RefreshControlProps>
  );
}
