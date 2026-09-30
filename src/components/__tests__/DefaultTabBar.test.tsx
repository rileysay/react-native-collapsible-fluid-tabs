/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';

import { DefaultTabBar, type DefaultTabBarProps } from '../DefaultTabBar';

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Platform: { OS: 'web' },
    View: ({
      'children': children,
      'accessibilityRole': accessibilityRole,
      'accessibilityState': accessibilityState,
      'accessibilityLabel': accessibilityLabel,
      'aria-selected': ariaSelected,
    }: {
      'children'?: ReactNode;
      'accessibilityRole'?: string;
      'accessibilityState'?: { selected?: boolean };
      'accessibilityLabel'?: string;
      'aria-selected'?: boolean;
    }) =>
      React.createElement(
        'div',
        {
          'role': accessibilityRole,
          'aria-label': accessibilityLabel,
          'aria-selected': ariaSelected,
          'data-native-selected': accessibilityState?.selected,
        },
        children
      ),
    Text: ({ children }: { children?: ReactNode }) => children,
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
});
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children,
  VirtualGestureDetector: ({ children }: { children?: ReactNode }) => children,
  ScrollView: jest.requireMock('react-native').View,
  useTapGesture: (config: object) => config,
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      View: jest.requireMock('react-native').View,
      createAnimatedComponent: (component: unknown) => component,
    },
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedRef: () => React.useRef(null),
    useAnimatedStyle: () => ({}),
    // Deliberately do not deliver UI reactions before checking the first render.
    useAnimatedReaction: jest.fn(),
    useReducedMotion: () => false,
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function shared(value: number) {
  return { value } as SharedValue<number>;
}

it.each([false, true])(
  'uses the supplied selection for accessibility immediately (scrollable: %s)',
  (scrollable) => {
    const props: DefaultTabBarProps = {
      tabs: [{ name: 'feed' }, { name: 'saved' }, { name: 'about' }],
      scrollY: shared(0),
      perPageScrollY: [shared(0), shared(0), shared(0)],
      tabCount: 3,
      headerHeight: shared(120),
      activeIndex: shared(2),
      selectedIndex: 2,
      pagerOffset: shared(2) as DerivedValue<number>,
      pillWidth: shared(100),
      pinnedHeaderHeight: 0,
      tabBarHeight: 48,
      topInset: 0,
      pullDownBehavior: 'stretch',
      onTabPress: jest.fn(),
      scrollable,
    };
    const selections = (attribute: string) =>
      Array.from(host.querySelectorAll('[role="tab"]'), (tab) =>
        tab.getAttribute(attribute)
      );

    act(() => root.render(<DefaultTabBar {...props} />));
    expect(selections('aria-selected')).toEqual(['false', 'false', 'true']);
    expect(selections('data-native-selected')).toEqual([
      'false',
      'false',
      'true',
    ]);

    // Accessibility follows the React snapshot even while UI values differ.
    act(() => root.render(<DefaultTabBar {...props} selectedIndex={1} />));
    expect(selections('aria-selected')).toEqual(['false', 'true', 'false']);
    expect(selections('data-native-selected')).toEqual([
      'false',
      'true',
      'false',
    ]);
  }
);
