/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, useCallback, useLayoutEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Platform, type RefreshControlProps } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';

import { useTabIndex, useTabsContext } from '../../context';
import type { InternalTabsContextValue } from '../../types';
import { useAutoRefreshControl } from '../useAutoRefreshControl';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  PlatformColor: (name: string) => ({ semantic: [name] }),
}));
jest.mock('react-native-gesture-handler', () => ({
  RefreshControl: jest.fn(() => null),
}));
jest.mock('../../context', () => ({
  useTabIndex: jest.fn(),
  useTabsContext: jest.fn(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type HookArgs = Parameters<typeof useAutoRefreshControl>;
type RefreshConfig = Parameters<
  InternalTabsContextValue['reportRefreshConfig']
>[1];
type TestControlProps = RefreshControlProps & {
  block?: object | object[];
  requireToFail?: object | object[];
};
type ProbeProps = {
  control?: HookArgs[0];
  nativeGesture?: HookArgs[1];
  shorthand?: HookArgs[2];
};

const reportRefreshConfig = jest.fn<
  void,
  Parameters<InternalTabsContextValue['reportRefreshConfig']>
>();
let context: Pick<
  InternalTabsContextValue,
  | 'usesCustomPull'
  | 'pullDownBehavior'
  | 'reportRefreshConfig'
  | 'headerHeightValue'
  | 'pinnedHeaderHeight'
  | 'topInset'
  | 'tabBarHeight'
  | 'pagerPanGesture'
>;
let root: Root;
let container: HTMLDivElement;
let result: ReturnType<typeof useAutoRefreshControl>;

function TestControl(_props: TestControlProps) {
  return null;
}

function Probe({ control, nativeGesture, shorthand }: ProbeProps) {
  const preparedControl = useAutoRefreshControl(
    control,
    nativeGesture,
    shorthand
  );
  useLayoutEffect(() => {
    result = preparedControl;
  });
  return null;
}

function renderProbe(props: ProbeProps) {
  act(() => root.render(<Probe {...props} />));
}

function latestConfig(): NonNullable<RefreshConfig> {
  const config = reportRefreshConfig.mock.calls.at(-1)?.[1];
  if (!config) throw new Error('Expected a registered refresh control');
  return config;
}

function registeredCallback(): () => void {
  const callback = latestConfig().onRefresh;
  if (!callback) throw new Error('Expected an enabled refresh callback');
  return callback;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  context = {
    usesCustomPull: true,
    pullDownBehavior: 'static',
    reportRefreshConfig,
    headerHeightValue: 120,
    pinnedHeaderHeight: 32,
    topInset: 24,
    tabBarHeight: 40,
    pagerPanGesture: { handlerTag: 71 },
  };
  jest
    .mocked(useTabsContext)
    .mockImplementation(() => context as InternalTabsContextValue);
  jest.mocked(useTabIndex).mockReturnValue(2);
  result = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('custom Android refresh state', () => {
  it('reports unchanged false again after a no-op callback', () => {
    const onRefresh = jest.fn();
    renderProbe({
      control: <RefreshControl refreshing={false} onRefresh={onRefresh} />,
    });
    const trigger = registeredCallback();
    reportRefreshConfig.mockClear();

    act(() => trigger());

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(reportRefreshConfig).toHaveBeenCalledTimes(1);
    expect(latestConfig().refreshing).toBe(false);
    expect(result).toBeUndefined();
  });

  it('respects a true refreshing value committed by the callback', () => {
    function ControlledProbe() {
      const [refreshing, setRefreshing] = useState(false);
      const onRefresh = useCallback(() => setRefreshing(true), []);
      return (
        <Probe
          control={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      );
    }

    act(() => root.render(<ControlledProbe />));
    const trigger = registeredCallback();
    reportRefreshConfig.mockClear();

    act(() => trigger());

    expect(latestConfig().refreshing).toBe(true);
    expect(latestConfig().onRefresh).toBe(trigger);
  });

  it('preserves a busy disabled control while suppressing new pulls', () => {
    const onRefresh = jest.fn();
    renderProbe({
      control: (
        <RefreshControl refreshing enabled={false} onRefresh={onRefresh} />
      ),
    });

    expect(latestConfig()).toEqual({ refreshing: true, onRefresh: undefined });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('reconciles false even when the refresh callback throws', () => {
    const failure = new Error('refresh failed');
    const onRefresh = jest.fn(() => {
      throw failure;
    });
    renderProbe({
      control: <RefreshControl refreshing={false} onRefresh={onRefresh} />,
    });
    const trigger = registeredCallback();
    reportRefreshConfig.mockClear();

    act(() => {
      expect(trigger).toThrow(failure);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(reportRefreshConfig).toHaveBeenCalledTimes(1);
    expect(latestConfig().refreshing).toBe(false);
  });

  it('keeps its callback stable across renders with unchanged control props', () => {
    const onRefresh = jest.fn();
    renderProbe({
      control: <RefreshControl refreshing={false} onRefresh={onRefresh} />,
    });
    reportRefreshConfig.mockClear();

    renderProbe({
      control: <RefreshControl refreshing={false} onRefresh={onRefresh} />,
    });

    expect(reportRefreshConfig).not.toHaveBeenCalled();
  });

  it('keeps a missing callback undefined and unregisters removed controls', () => {
    renderProbe({ control: <RefreshControl refreshing /> });
    expect(latestConfig()).toEqual({ refreshing: true, onRefresh: undefined });

    renderProbe({ shorthand: { onRefresh: null, refreshing: false } });
    expect(reportRefreshConfig).toHaveBeenLastCalledWith(2, null);

    renderProbe({ control: <RefreshControl refreshing /> });
    act(() => root.render(null));
    expect(reportRefreshConfig).toHaveBeenLastCalledWith(2, null);
  });
});

describe('native control preparation', () => {
  beforeEach(() => {
    context.usesCustomPull = false;
  });

  it('makes Android refresh wait for the pager while preserving consumer relations', () => {
    const existing = { handlerTag: 82 };
    renderProbe({
      control: <TestControl refreshing={false} requireToFail={existing} />,
    });
    expect((result!.props as TestControlProps).requireToFail).toEqual([
      existing,
      context.pagerPanGesture,
    ]);
  });

  it('does not add the Android refresh wait relation to iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    renderProbe({ control: <TestControl refreshing={false} /> });
    expect((result!.props as TestControlProps).requireToFail).toBeUndefined();
  });

  it('creates a gesture-aware control from list shorthand', () => {
    const onRefresh = jest.fn();
    renderProbe({
      shorthand: { refreshing: true, onRefresh, progressViewOffset: 12 },
    });

    expect(result?.type).toBe(RefreshControl);
    expect(result?.props).toMatchObject({
      refreshing: true,
      onRefresh,
      progressViewOffset: 12,
    });
    expect(reportRefreshConfig).not.toHaveBeenCalled();
  });

  it('gives an explicit control precedence over all shorthand values', () => {
    const explicitCallback = jest.fn();
    const shorthandCallback = jest.fn();
    renderProbe({
      control: (
        <RefreshControl
          refreshing={false}
          onRefresh={explicitCallback}
          progressViewOffset={55}
        />
      ),
      shorthand: {
        refreshing: true,
        onRefresh: shorthandCallback,
        progressViewOffset: 999,
      },
    });

    expect(result?.props).toMatchObject({
      refreshing: false,
      onRefresh: explicitCallback,
      progressViewOffset: 55,
    });
  });

  it.each([
    { existingBlock: { handlerTag: 1 } },
    { existingBlock: [{ handlerTag: 1 }, { handlerTag: 2 }] },
  ])(
    'preserves existing block relations when adding the list gesture (%j)',
    ({ existingBlock }) => {
      const nativeGesture = { handlerTag: 3 };
      renderProbe({
        control: <TestControl refreshing={false} block={existingBlock} />,
        nativeGesture,
      });

      expect((result?.props as TestControlProps).block).toEqual([
        ...(Array.isArray(existingBlock) ? existingBlock : [existingBlock]),
        nativeGesture,
      ]);
    }
  );

  const nativeModes = [
    { platform: 'android', behavior: 'static', expectedOffset: 216 },
    { platform: 'ios', behavior: 'static', expectedOffset: 216 },
    { platform: 'ios', behavior: 'stretch', expectedOffset: 56 },
  ] as const;

  it.each(['static', 'stretch'] as const)(
    'sets an iOS tint without changing native stacking in %s mode',
    (behavior) => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      context.pullDownBehavior = behavior;
      const onRefresh = jest.fn();
      renderProbe({
        control: <RefreshControl refreshing onRefresh={onRefresh} />,
      });
      expect(result?.props.style).toBeUndefined();
      expect(result?.props.tintColor).toEqual({ semantic: ['secondaryLabel'] });
      expect(result?.props.refreshing).toBe(true);
      expect(result?.props.onRefresh).toBe(onRefresh);
    }
  );

  it('preserves explicit iOS styling and offset overrides', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const style = [{ zIndex: 5 }, { opacity: 0.8 }];
    renderProbe({
      control: (
        <RefreshControl
          refreshing={false}
          tintColor="transparent"
          style={style}
          progressViewOffset={0}
        />
      ),
    });
    expect(result?.props.style).toBe(style);
    expect(result?.props.tintColor).toBe('transparent');
    expect(result?.props.progressViewOffset).toBe(0);
  });

  it.each(nativeModes)(
    'clears the appropriate chrome in $platform $behavior mode',
    ({ platform, behavior, expectedOffset }) => {
      jest.replaceProperty(Platform, 'OS', platform);
      context.pullDownBehavior = behavior;
      const nativeGesture = { handlerTag: 3 };
      renderProbe({
        control: <RefreshControl refreshing={false} />,
        nativeGesture,
      });
      expect(result?.props.progressViewOffset).toBe(expectedOffset);
      expect((result?.props as TestControlProps).block).toBe(
        platform === 'android' ? nativeGesture : undefined
      );
    }
  );

  it.each(nativeModes)(
    'preserves an explicit zero offset in $platform $behavior mode',
    ({ platform, behavior }) => {
      jest.replaceProperty(Platform, 'OS', platform);
      context.pullDownBehavior = behavior;
      renderProbe({
        control: <RefreshControl refreshing={false} progressViewOffset={0} />,
      });
      expect(result?.props.progressViewOffset).toBe(0);
    }
  );

  it('omits stock web controls while preserving custom web controls', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    renderProbe({ control: <RefreshControl refreshing={false} /> });
    expect(result).toBeUndefined();

    renderProbe({ shorthand: { refreshing: false, onRefresh: jest.fn() } });
    expect(result).toBeUndefined();

    const customControl = <TestControl refreshing={false} />;
    renderProbe({ control: customControl });
    expect(result).toBe(customControl);
  });
});
