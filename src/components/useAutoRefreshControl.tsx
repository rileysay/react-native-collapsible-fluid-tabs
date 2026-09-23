import React, { useCallback, useLayoutEffect, useReducer } from 'react';
import {
  Platform,
  PlatformColor,
  type RefreshControlProps,
} from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';

import { useTabIndex, useTabsContext } from '../context';

type RefreshControlElement = React.ReactElement<RefreshControlProps>;

type RefreshShorthand = {
  refreshing?: boolean | null;
  onRefresh?: (() => void) | null;
  progressViewOffset?: number;
};

/**
 * Prepares a native `RefreshControl` or the Android custom pull for the pager.
 *
 * Native controls are retained on iOS and in Android `'static'` mode. Cloning
 * injects gesture relations and an offset without replacing caller styling:
 *
 * 1. **Android gesture relation.** A scroll view wrapped in a
 *    Native gesture inside the pan's detector swallows the touch-release that
 *    Android's `SwipeRefreshLayout` needs, so pull-to-refresh shows the spinner
 *    but only commits on a *second* touch. Cloning the RefreshControl with
 *    `block: <list's native gesture>` makes the refresh gesture block the
 *    scroll (the scroll yields to it) — the same relation RNGH's own
 *    `ScrollView`/`FlatList` set up internally with `block`. The refresh gesture
 *    also waits for the pager to fail before activating, so horizontal swipes
 *    remain available. **Requires a gesture-aware RefreshControl** — import
 *    it from `react-native-gesture-handler`, not `react-native`, or `block` has
 *    nothing to attach to.
 * 2. **progressViewOffset.** On Android and iOS the native refresh indicator
 *    sits inside the list's layer, beneath the chrome overlays. Static mode
 *    clears all chrome (pinned + inset + collapsing header + tab bar). In iOS
 *    stretch mode the header follows the native bounce, so the indicator only
 *    needs to clear the pinned header and top inset.
 *
 * In `'stretch'` mode on Android the native control is suppressed entirely:
 * Android lists have no bounce for the header to ride, so the Container
 * drives the pull itself (chrome rides down, custom indicator under the
 * pinned bar). This hook reports the control's `refreshing`/`onRefresh` to
 * the Container so the custom pull can trigger and track the refresh — the
 * consumer API stays the plain `refreshControl` element either way.
 *
 * List `onRefresh`/`refreshing` shorthand creates the same gesture-aware
 * control before applying these fixes. Disabled controls keep their controlled
 * refreshing state but never register a custom refresh callback. For native
 * controls, a consumer-provided `progressViewOffset` always wins.
 */
export function useAutoRefreshControl(
  refreshControl: RefreshControlElement | undefined,
  nativeGesture?: object,
  shorthand?: RefreshShorthand
): RefreshControlElement | undefined {
  const control =
    refreshControl ??
    (shorthand?.onRefresh ? (
      <RefreshControl
        refreshing={!!shorthand.refreshing}
        onRefresh={shorthand.onRefresh}
        progressViewOffset={shorthand.progressViewOffset}
      />
    ) : undefined);
  const ctx = useTabsContext();
  const index = useTabIndex();
  const {
    usesCustomPull,
    pullDownBehavior,
    reportRefreshConfig,
    headerHeightValue,
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    pagerPanGesture,
  } = ctx;

  const isAndroid = Platform.OS === 'android';
  const hasControl = !!control;
  const enabled = control?.props.enabled !== false;
  const refreshing = !!control?.props.refreshing;
  const onRefresh = control?.props.onRefresh;
  const [refreshRevision, reconcileRefresh] = useReducer(
    (revision: number) => revision + 1,
    0
  );
  const handleRefresh = useCallback(() => {
    try {
      onRefresh?.();
    } finally {
      // Like RN RefreshControl's forceUpdate, reconcile an unchanged false
      // refreshing prop after a callback that never starts a controlled refresh.
      reconcileRefresh();
    }
  }, [onRefresh]);

  // Android stretch mode: hand the refresh config to the Container's custom
  // pull before paint, including when an unchanged controlled value must win.
  useLayoutEffect(() => {
    if (!usesCustomPull) return;
    reportRefreshConfig(
      index,
      hasControl
        ? {
            refreshing,
            onRefresh: enabled && onRefresh ? handleRefresh : undefined,
          }
        : null
    );
  }, [
    enabled,
    handleRefresh,
    hasControl,
    index,
    onRefresh,
    refreshRevision,
    refreshing,
    reportRefreshConfig,
    usesCustomPull,
  ]);
  useLayoutEffect(() => {
    if (!usesCustomPull) return;
    return () => reportRefreshConfig(index, null);
  }, [index, reportRefreshConfig, usesCustomPull]);

  const needsOffset =
    hasControl &&
    (isAndroid || Platform.OS === 'ios') &&
    !usesCustomPull &&
    control.props.progressViewOffset == null;
  const needsBlock =
    hasControl && isAndroid && !usesCustomPull && !!nativeGesture;
  const needsPagerWait =
    hasControl && isAndroid && !usesCustomPull && !!pagerPanGesture;

  if (usesCustomPull) return undefined;
  // RNGH's web RefreshControl is a Native-gesture View with no refresh UI.
  // RN Web wraps the entire scroller in it, allowing it to cancel the pager.
  // Leave custom web controls alone, but omit this native-only placeholder.
  if (Platform.OS === 'web' && control?.type === RefreshControl) {
    return undefined;
  }
  const needsIOSVisibility = hasControl && Platform.OS === 'ios';
  if (!needsOffset && !needsBlock && !needsIOSVisibility && !needsPagerWait)
    return control;

  // `block` is not part of RefreshControlProps (it's an RNGH gesture relation
  // honored by the gesture-aware RefreshControl), so build a loose object and
  // cast for cloneElement.
  const injected: Record<string, unknown> = {};
  if (needsPagerWait) {
    const existingWait = (
      control.props as RefreshControlProps & {
        requireToFail?: object | object[];
      }
    ).requireToFail;
    injected.requireToFail = existingWait
      ? [
          ...(Array.isArray(existingWait) ? existingWait : [existingWait]),
          pagerPanGesture,
        ]
      : pagerPanGesture;
  }
  if (needsIOSVisibility) {
    // Supply a system tint without changing the native control's stacking.
    // Preserve caller styling and explicit tint, including transparent.
    injected.tintColor =
      control.props.tintColor ?? PlatformColor('secondaryLabel');
  }
  if (needsOffset) {
    injected.progressViewOffset =
      pinnedHeaderHeight +
      topInset +
      (Platform.OS === 'ios' && pullDownBehavior === 'stretch'
        ? 0
        : headerHeightValue + tabBarHeight);
  }
  if (needsBlock) {
    const existingBlock = (
      control.props as RefreshControlProps & { block?: object | object[] }
    ).block;
    injected.block = existingBlock
      ? [
          ...(Array.isArray(existingBlock) ? existingBlock : [existingBlock]),
          nativeGesture,
        ]
      : nativeGesture;
  }
  return React.cloneElement(
    control,
    injected as unknown as Partial<RefreshControlProps>
  );
}
