import { useCallback, useLayoutEffect } from 'react';
import { Platform, type ScrollViewProps } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { ListScrollMetrics } from '../utils/scrollMetrics';

/** Layout callbacks update bounds, leaving continuous scroll work on UI. */
export function useListScrollMetrics(
  metrics: SharedValue<ListScrollMetrics>,
  {
    onLayout,
    onContentSizeChange,
    scrollEnabled,
    decelerationRate,
  }: Pick<
    ScrollViewProps,
    'onLayout' | 'onContentSizeChange' | 'scrollEnabled' | 'decelerationRate'
  >
) {
  useLayoutEffect(() => {
    const enabled = scrollEnabled !== false;
    const deceleration =
      typeof decelerationRate === 'number' && Number.isFinite(decelerationRate)
        ? Math.max(0, Math.min(0.9999, decelerationRate))
        : decelerationRate === 'fast'
          ? Platform.OS === 'android'
            ? 0.9
            : 0.99
          : Platform.OS === 'android'
            ? 0.985
            : 0.998;
    metrics.modify((value) => {
      'worklet';
      return { ...value, enabled, deceleration };
    });
  }, [decelerationRate, metrics, scrollEnabled]);

  const handleLayout = useCallback<NonNullable<ScrollViewProps['onLayout']>>(
    (event) => {
      const viewportHeight = Math.max(0, event.nativeEvent.layout.height);
      metrics.modify((value) => {
        'worklet';
        return { ...value, viewportHeight };
      });
      onLayout?.(event);
    },
    [metrics, onLayout]
  );
  const handleContentSizeChange = useCallback<
    NonNullable<ScrollViewProps['onContentSizeChange']>
  >(
    (width, height) => {
      const contentHeight = Math.max(0, height);
      metrics.modify((value) => {
        'worklet';
        return { ...value, contentHeight };
      });
      onContentSizeChange?.(width, height);
    },
    [metrics, onContentSizeChange]
  );
  return {
    onLayout: handleLayout,
    onContentSizeChange: handleContentSizeChange,
  };
}
