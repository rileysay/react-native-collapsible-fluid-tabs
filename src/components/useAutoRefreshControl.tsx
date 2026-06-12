import React, { useEffect, useState } from 'react';
import { Platform, type RefreshControlProps } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTabIndex, useTabsContext } from '../context';

type RefreshControlElement = React.ReactElement<RefreshControlProps>;

/**
 * Prepares a `RefreshControl` to work inside the pager on Android.
 *
 * In `'static'` mode the native control is kept, with two fixes injected by
 * cloning the element:
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
 * 2. **progressViewOffset.** Android's native refresh indicator is drawn
 *    inside the list's layer, beneath the chrome overlays, so it must clear
 *    all of them (pinned + inset + collapsing header + tab bar) to be visible.
 *
 * In `'stretch'` mode on Android the native control is suppressed entirely:
 * Android lists have no bounce for the header to ride, so the Container
 * drives the pull itself (chrome rides down, custom indicator under the
 * pinned bar). This hook reports the control's `refreshing`/`onRefresh` to
 * the Container so the custom pull can trigger and track the refresh — the
 * consumer API stays the plain `refreshControl` element either way.
 *
 * No-op on iOS/web or when no `refreshControl` is passed. A consumer-provided
 * `progressViewOffset` always wins.
 */
export function useAutoRefreshControl(
  refreshControl: RefreshControlElement | undefined,
  nativeGesture?: object
): RefreshControlElement | undefined {
  const ctx = useTabsContext();
  const index = useTabIndex();

  const isAndroid = Platform.OS === 'android';
  const usesCustomPull = ctx.usesCustomPull;
  const hasControl = !!refreshControl;
  const refreshing = !!refreshControl?.props.refreshing;
  const onRefresh = refreshControl?.props.onRefresh;

  // Android stretch mode: hand the refresh config to the Container's custom
  // pull. Runs every render so `refreshing` stays fresh; cheap (ref write).
  useEffect(() => {
    if (!usesCustomPull) return;
    ctx.reportRefreshConfig(
      index,
      hasControl ? { refreshing, onRefresh } : null
    );
  });
  useEffect(() => {
    if (!usesCustomPull) return;
    return () => ctx.reportRefreshConfig(index, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, usesCustomPull]);

  const needsOffset =
    hasControl &&
    isAndroid &&
    !usesCustomPull &&
    refreshControl.props.progressViewOffset == null;
  const needsBlock =
    hasControl && isAndroid && !usesCustomPull && !!nativeGesture;

  const [headerH, setHeaderH] = useState(0);
  useAnimatedReaction(
    () => (needsOffset ? ctx.headerHeight.value : 0),
    (v, prev) => {
      if (v !== prev) scheduleOnRN(setHeaderH, v);
    }
  );

  if (usesCustomPull) return undefined;
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
