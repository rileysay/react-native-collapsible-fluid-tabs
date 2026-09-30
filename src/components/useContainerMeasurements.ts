import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ContainerProps } from '../types';

// Width of the left-edge zone where the tab pan gesture refuses to activate,
// leaving room for iOS edge-swipe-back / Android gesture-nav.
const EDGE_SWIPE_MARGIN = 20;

export function useContainerMeasurements({
  pinnedHeaderHeight,
  topInsetOverride,
  hasPinnedHeader,
  hasHeader,
  estimatedHeaderHeight,
  minPageContentHeight,
  screenHeight,
  tabBarHeight,
  swipeGestureTopInset,
}: {
  pinnedHeaderHeight: ContainerProps['pinnedHeaderHeight'];
  topInsetOverride: ContainerProps['topInset'];
  hasPinnedHeader: boolean;
  hasHeader: boolean;
  estimatedHeaderHeight: number;
  minPageContentHeight: ContainerProps['minPageContentHeight'];
  screenHeight: number;
  tabBarHeight: number;
  swipeGestureTopInset: ContainerProps['swipeGestureTopInset'];
}) {
  const { top: safeTopInset, bottom: bottomInset } = useSafeAreaInsets();
  const topInset =
    topInsetOverride != null && Number.isFinite(topInsetOverride)
      ? Math.max(0, topInsetOverride)
      : safeTopInset;
  const [measuredPinnedTotal, setMeasuredPinnedTotal] = useState(0);
  const pinnedTotal =
    pinnedHeaderHeight != null
      ? pinnedHeaderHeight + topInset
      : hasPinnedHeader
        ? Math.max(measuredPinnedTotal, topInset)
        : topInset;
  const resolvedPinnedHeaderHeight = Math.max(0, pinnedTotal - topInset);
  const [lastHeaderHeight, setMeasuredHeaderHeight] = useState(
    estimatedHeaderHeight
  );
  const measuredHeaderHeight = hasHeader ? lastHeaderHeight : 0;
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState(0);
  const [measuredContainerWidth, setMeasuredContainerWidth] = useState(0);

  const resolvedMinContentHeight =
    minPageContentHeight ??
    (measuredContainerHeight || screenHeight) + measuredHeaderHeight;
  const resolvedSwipeGestureTopInset =
    swipeGestureTopInset === 'auto'
      ? pinnedTotal + tabBarHeight
      : Math.max(0, swipeGestureTopInset ?? 0);
  const availableHeight = measuredContainerHeight || screenHeight;
  const pagerPanHitSlop = useMemo(
    () => ({
      left: -EDGE_SWIPE_MARGIN,
      ...(resolvedSwipeGestureTopInset > 0
        ? {
            top: -Math.min(
              Math.max(0, availableHeight - 1),
              resolvedSwipeGestureTopInset
            ),
          }
        : null),
    }),
    [availableHeight, resolvedSwipeGestureTopInset]
  );

  return {
    topInset,
    bottomInset,
    pinnedTotal,
    resolvedPinnedHeaderHeight,
    setMeasuredHeaderHeight,
    setMeasuredContainerHeight,
    setMeasuredContainerWidth,
    measuredContainerWidth,
    setMeasuredPinnedTotal,
    measuredHeaderHeight,
    resolvedMinContentHeight,
    pagerPanHitSlop,
  };
}
