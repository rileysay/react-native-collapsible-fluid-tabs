/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { SharedValue } from 'react-native-reanimated';
import { useListScrollMetrics } from '../useListScrollMetrics';
import {
  INITIAL_SCROLL_METRICS,
  type ListScrollMetrics,
} from '../../utils/scrollMetrics';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it('reports measured bounds, preserves callbacks, and honors scroll configuration', () => {
  const state = {
    value: { ...INITIAL_SCROLL_METRICS },
    modify(modifier: (value: ListScrollMetrics) => ListScrollMetrics) {
      state.value = modifier(state.value);
    },
  };
  const metrics = state as SharedValue<ListScrollMetrics>;
  const onLayout = jest.fn();
  const onContentSizeChange = jest.fn();
  let handlers: ReturnType<typeof useListScrollMetrics>;
  function Probe({ enabled }: { enabled: boolean }) {
    const result = useListScrollMetrics(metrics, {
      onLayout,
      onContentSizeChange,
      scrollEnabled: enabled,
      decelerationRate: 'fast',
    });
    useLayoutEffect(() => {
      handlers = result;
    });
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Probe enabled />));
  const event = {
    nativeEvent: { layout: { width: 300, height: 600, x: 0, y: 0 } },
  } as Parameters<typeof handlers.onLayout>[0];
  act(() => {
    handlers.onLayout(event);
    handlers.onContentSizeChange(300, 1400);
  });
  expect(metrics.value).toEqual({
    contentHeight: 1400,
    viewportHeight: 600,
    enabled: true,
    deceleration: 0.9,
  });
  expect(onLayout).toHaveBeenCalledWith(event);
  expect(onContentSizeChange).toHaveBeenCalledWith(300, 1400);
  act(() => root.render(<Probe enabled={false} />));
  expect(metrics.value).toEqual({
    contentHeight: 1400,
    viewportHeight: 600,
    enabled: false,
    deceleration: 0.9,
  });
  act(() => root.unmount());
});
