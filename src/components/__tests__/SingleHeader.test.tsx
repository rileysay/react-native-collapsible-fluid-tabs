/** @jest-environment jsdom */
/// <reference lib="dom" />

import {
  act,
  cloneElement,
  useEffect,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
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
let pageMounts = 0;

function Host(props: NativeHeaderScrollHostProps) {
  hostProps.push(props);
  return <>{props.children}</>;
}

function Page(props: NativeHeaderScrollPageProps) {
  pageProps.push(props);
  useEffect(() => {
    pageMounts += 1;
  }, []);
  return <>{props.children}</>;
}

function shared<T>(value: T) {
  return { value } as SharedValue<T>;
}

const gesture = {} as NativeGesture;
let root: Root;
let container: HTMLDivElement;

function renderTree(
  children: ReactNode,
  pageIndex = 2,
  headerScrollEnabled = true
) {
  act(() =>
    root.render(
      <SingleHeaderHost
        activeIndex={shared(1.4)}
        paging={shared(true)}
        headerScrollEnabled={headerScrollEnabled}
      >
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
  pageMounts = 0;
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

describe('headerScrollEnabled under native registration', () => {
  it('passes the setting to the host and keeps pages mounted when toggled', () => {
    registerNativeHeaderScroll({ Host, Page });
    const page = (
      <SingleHeaderPage>
        <span>list</span>
      </SingleHeaderPage>
    );
    renderTree(page, 0);
    expect(hostProps.at(-1)).toMatchObject({ headerScrollEnabled: true });

    renderTree(page, 0, false);
    expect(hostProps.at(-1)).toMatchObject({ headerScrollEnabled: false });
    renderTree(page, 0, true);
    expect(hostProps.at(-1)).toMatchObject({ headerScrollEnabled: true });

    // The native host decides when to hand the pan back; React never remounts.
    expect(pageMounts).toBe(1);
    expect(container.textContent).toBe('list');
  });
});

describe('useSingleHeaderScrollComponent', () => {
  it('returns the list renderer unchanged without native registration', () => {
    const render = jest.fn(() => <></>);
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

  it('keeps the scroll view mounted when the list renderer changes identity', () => {
    registerNativeHeaderScroll({ Host, Page });
    let mounts = 0;
    function Scroller(props: { label: string; children?: ReactNode }) {
      useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <>
          {props.label}
          {props.children}
        </>
      );
    }
    // A new renderer every render, as with an inline renderScrollComponent.
    function List({ label }: { label: string }) {
      const renderScroll = useSingleHeaderScrollComponent<{
        children?: ReactNode;
      }>((props) => <Scroller label={label} {...props} />, gesture);
      return renderScroll?.({ children: <span>row</span> }) ?? null;
    }

    renderTree(<List label="a" />, 0);
    renderTree(<List label="b" />, 0);

    expect(container.textContent).toBe('brow');
    expect(mounts).toBe(1);
  });

  it('passes the list ref to the rendered scroll view', () => {
    registerNativeHeaderScroll({ Host, Page });
    const listRef = jest.fn();
    const received: unknown[] = [];
    function Scroller(props: { ref?: Ref<unknown>; children?: ReactNode }) {
      received.push(props.ref);
      return <>{props.children}</>;
    }
    let renderScroll:
      | ((props: { children?: ReactNode }) => ReactElement | null)
      | undefined;
    function Probe() {
      renderScroll = useSingleHeaderScrollComponent<{ children?: ReactNode }>(
        (props) => <Scroller {...props} />,
        gesture
      );
      return null;
    }
    act(() => root.render(<Probe />));

    // VirtualizedList clones the renderer's element with its own scroll ref.
    const element = renderScroll?.({ children: <span>row</span> }) as
      | ReactElement<{ ref?: Ref<unknown> }>
      | null
      | undefined;
    renderTree(element ? cloneElement(element, { ref: listRef }) : null, 0);

    expect(received.at(-1)).toBe(listRef);
    expect(container.textContent).toBe('row');
  });
});
