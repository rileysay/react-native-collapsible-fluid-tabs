import { useCallback, useEffect, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';

function addMountedTabs(
  mounted: Set<number>,
  centerIndex: number,
  tabCount: number,
  preloadDistance: number
) {
  const clampedCenter = Math.max(0, Math.min(centerIndex, tabCount - 1));
  const start = Math.max(0, clampedCenter - preloadDistance);
  const end = Math.min(tabCount - 1, clampedCenter + preloadDistance);

  for (let i = start; i <= end; i++) {
    mounted.add(i);
  }
}

function createMountedTabs(
  centerIndex: number,
  tabCount: number,
  preloadDistance: number
) {
  const mounted = new Set<number>();
  addMountedTabs(mounted, centerIndex, tabCount, preloadDistance);
  return mounted;
}

export function useMountedTabs({
  startIndex,
  tabCount,
  lazy,
  resolvedLazyPreloadDistance,
  activeIndex,
}: {
  startIndex: number;
  tabCount: number;
  lazy: boolean;
  resolvedLazyPreloadDistance: number;
  activeIndex: SharedValue<number>;
}) {
  const [mountedTabIndices, setMountedTabIndices] = useState(() =>
    createMountedTabs(
      startIndex,
      tabCount,
      lazy ? resolvedLazyPreloadDistance : tabCount
    )
  );

  const mountTabsAround = useCallback(
    (index: number) => {
      setMountedTabIndices((current) => {
        const next = new Set(current);
        addMountedTabs(
          next,
          index,
          tabCount,
          lazy ? resolvedLazyPreloadDistance : tabCount
        );
        return next.size === current.size ? current : next;
      });
    },
    [lazy, resolvedLazyPreloadDistance, tabCount]
  );

  useEffect(() => {
    mountTabsAround(Math.round(activeIndex.value));
  }, [activeIndex, mountTabsAround]);

  return { mountedTabIndices, mountTabsAround };
}
