/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Platform } from 'react-native';
import type { NativeGesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import { TabIndexContext } from '../../context';
import {
  isNativeHeaderScrollEnabled,
  registerNativeHeaderScroll,
  SingleHeaderHost,
  SingleHeaderPage,
  useSingleHeaderScrollComponent,
  type NativeHeaderScrollHostProps,
  type NativeHeaderScrollPageProps,
} from '../SingleHeader';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: ({ children }: { children?: ReactNode }) => children ?? null,
  ScrollView: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: <T,>(component: T) => component },
  useAnimatedProps: (updater: () => object) => updater(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hostProps: Record<string, unknown>[] = [];
const pageProps: Record<string, unknown>[] = [];

function Host(props: NativeHeaderScrollHostProps) {
  hostProps.push(props);
  return <>{props.children}</>;
}

function Page(props: NativeHeaderScrollPageProps) {
  pageProps.push(props);
  return <>{props.children}</>;
}

function shared<T>(value: T) {
  return { value } as SharedValue<T>;
}

const gesture = {} as NativeGesture;
let root: Root;
let container: HTMLDivElement;

function renderTree(children: ReactNode, pageIndex = 2) {
  act(() =>
    root.render(
      <SingleHeaderHost activeIndex={shared(1.4)} paging={shared(true)}>
        <TabIndexContext.Provider value={pageIndex}>
          {children}
        </TabIndexContext.Provider>
      </SingleHeaderHost>
    )
  );
}

beforeEach(() => {
  Platform.OS = 'ios';
  registerNativeHeaderScroll(null);
  hostProps.length = 0;
  pageProps.length = 0;
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  registerNativeHeaderScroll(null);
});

describe('native header scroll registration', () => {
  it('keeps the plain container until native views are registered', () => {
    renderTree(
      <SingleHeaderPage>
        <span>list</span>
      </SingleHeaderPage>
    );

    expect(isNativeHeaderScrollEnabled()).toBe(false);
    expect(hostProps).toHaveLength(0);
    expect(pageProps).toHaveLength(0);
    expect(container.textContent).toBe('list');
  });

  it('hosts registered pages with the committed page index and paging state', () => {
    registerNativeHeaderScroll({ Host, Page });
    renderTree(
      <SingleHeaderPage>
        <span>list</span>
      </SingleHeaderPage>
    );

    expect(hostProps.at(-1)).toMatchObject({
      animatedProps: { activePageIndex: 1, paging: true },
      collapsable: false,
    });
    expect(pageProps.at(-1)).toMatchObject({
      pageIndex: 2,
      collapsable: false,
    });
    expect(container.textContent).toBe('list');
  });

  it('ignores registration on other platforms', () => {
    Platform.OS = 'android';
    registerNativeHeaderScroll({ Host, Page });

    expect(isNativeHeaderScrollEnabled()).toBe(false);
  });

  it('can be unregistered', () => {
    registerNativeHeaderScroll({ Host, Page });
    registerNativeHeaderScroll(null);

    expect(isNativeHeaderScrollEnabled()).toBe(false);
  });
});

describe('useSingleHeaderScrollComponent', () => {
  it('returns the list renderer unchanged without native registration', () => {
    const render = jest.fn(() => null);
    let result: unknown;
    function Probe() {
      result = useSingleHeaderScrollComponent(render, gesture);
      return null;
    }

    act(() => root.render(<Probe />));

    expect(result).toBe(render);
  });

  it('registers a default scroll view as the page when native scroll is on', () => {
    registerNativeHeaderScroll({ Host, Page });
    let renderScroll:
      | ((props: { children?: ReactNode }) => ReactElement | null)
      | undefined;
    function Probe() {
      renderScroll = useSingleHeaderScrollComponent<{ children?: ReactNode }>(
        undefined,
        gesture
      );
      return null;
    }
    act(() => root.render(<Probe />));

    renderTree(renderScroll?.({ children: <span>row</span> }), 0);

    expect(pageProps.at(-1)).toMatchObject({ pageIndex: 0 });
    expect(container.textContent).toBe('row');
  });
});
