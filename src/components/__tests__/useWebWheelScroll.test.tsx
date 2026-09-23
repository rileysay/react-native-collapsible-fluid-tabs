/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import type { WebWheelScrollOptions } from '../useWebWheelScroll';
import { useWebWheelScroll } from '../useWebWheelScroll.web';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function shared<T>(initial: T): SharedValue<T> {
  let current = initial;
  const listeners = new Map<number, (value: T) => void>();
  return {
    get value() {
      return current;
    },
    set value(value: T) {
      current = value;
      listeners.forEach((listener) => listener(value));
    },
    addListener: (id: number, listener: (value: T) => void) =>
      listeners.set(id, listener),
    removeListener: (id: number) => listeners.delete(id),
  } as unknown as SharedValue<T>;
}

let container: HTMLDivElement;
let root: Root;
let options: WebWheelScrollOptions;
let frames: Map<number, FrameRequestCallback>;
let time: number;
let enabled: boolean;
let maxOffset: number;

function element(id: string) {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
}

function Probe({ value }: { value: WebWheelScrollOptions }) {
  const ref = useWebWheelScroll(value);
  return (
    <div ref={ref as unknown as Ref<HTMLDivElement>} data-testid="host">
      <div data-testid="header">Profile</div>
      {[0, 1].map((index) => (
        <div data-fluid-tabs-page={String(index)} key={index}>
          <div data-testid={`list-${index}`} style={{ overflowY: 'auto' }}>
            <span data-testid={`row-${index}`}>Feed</span>
            <textarea data-testid={`editor-${index}`} />
            <div data-testid={`nested-${index}`} style={{ overflowY: 'auto' }}>
              Nested list
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function render() {
  act(() => root.render(<Probe value={options} />));
  for (let index = 0; index < 2; index++) {
    Object.defineProperties(element(`list-${index}`), {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, get: () => 500 + maxOffset },
    });
    Object.defineProperties(element(`nested-${index}`), {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
    });
  }
}

function wheel(target: string, deltaY: number, init: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    ...init,
  });
  act(() => element(target).dispatchEvent(event));
  return event;
}

function tick(nextTime: number) {
  time = nextTime;
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(time)));
}

beforeEach(() => {
  frames = new Map();
  time = 0;
  enabled = true;
  maxOffset = 1000;
  let nextFrame = 0;
  jest.spyOn(window.performance, 'now').mockImplementation(() => time);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    if (id != null) frames.delete(id);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const activeIndex = shared(0);
  const perPageScrollY = [shared(0), shared(0)];
  const owner = shared(-1);
  const offset = shared(0);
  const move = jest.fn((value: number) => {
    if (owner.value !== activeIndex.value || !enabled) return;
    const next = Math.max(0, Math.min(maxOffset, value));
    offset.value = next;
    perPageScrollY[owner.value]!.value = next;
    element(`list-${owner.value}`).scrollTop = next;
    element('header').style.transform = `translateY(${-Math.min(next, 300)}px)`;
  });
  const cancel = jest.fn(() => {
    owner.value = -1;
  });
  const begin = jest.fn(() => {
    if (!enabled) return false;
    owner.value = activeIndex.value;
    offset.value = perPageScrollY[activeIndex.value]!.value;
    return true;
  });
  options = {
    activeIndex,
    perPageScrollY,
    listRefs: [0, 1].map(
      (index) => (() => element(`list-${index}`)) as unknown as AnimatedRef<any>
    ),
    headerScroll: {
      index: owner,
      offset,
      canScroll: () => enabled,
      maxOffset: () => maxOffset,
      begin,
      move,
      cancel,
      finish: jest.fn(),
    },
    cancelScrollToTop: jest.fn(),
    headerScrollEnabled: true,
    reduceMotion: false,
  };
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

it.each(['header', 'row-0'])(
  'smooths wheel over %s with the list and header driven together',
  (target) => {
    expect(wheel(target, 120).defaultPrevented).toBe(true);
    expect(element('list-0').scrollTop).toBe(0);
    tick(70);
    expect(element('list-0').scrollTop).toBe(105);
    expect(element('header').style.transform).toBe('translateY(-105px)');
    tick(140);
    expect(element('list-0').scrollTop).toBe(120);
    expect(element('header').style.transform).toBe('translateY(-120px)');
    expect(options.headerScroll.index.value).toBe(-1);
    expect(frames.size).toBe(0);
  }
);

it('accumulates additional wheel steps without dropping distance', () => {
  wheel('row-0', 120);
  tick(70);
  wheel('row-0', 120);
  tick(210);
  expect(element('list-0').scrollTop).toBe(240);
  expect(options.headerScroll.begin).toHaveBeenCalledTimes(1);
});

it('reverses from the visible position instead of finishing old queued steps', () => {
  wheel('row-0', 200);
  tick(70);
  expect(element('list-0').scrollTop).toBe(175);
  wheel('row-0', -120);
  tick(210);
  expect(element('list-0').scrollTop).toBe(55);
});

it('keeps fine trackpad deltas direct', () => {
  wheel('row-0', 3.5);
  wheel('row-0', 4.25);
  expect(element('list-0').scrollTop).toBe(7.75);
  expect(frames.size).toBe(0);
});

it('honors reduced motion while still forwarding the header wheel', () => {
  options = { ...options, reduceMotion: true };
  render();
  expect(wheel('header', 120).defaultPrevented).toBe(true);
  expect(element('list-0').scrollTop).toBe(120);
  expect(frames.size).toBe(0);
});

it.each([
  { deltaMode: 1, delta: 3, expected: 48 },
  { deltaMode: 2, delta: 1, expected: 500 },
])(
  'normalizes wheel delta mode $deltaMode',
  ({ deltaMode, delta, expected }) => {
    wheel('header', delta, { deltaMode });
    tick(140);
    expect(element('list-0').scrollTop).toBe(expected);
  }
);

it.each([
  { ctrlKey: true },
  { metaKey: true },
  { shiftKey: true },
  { deltaX: 150 },
  { cancelable: false },
])('preserves zoom/horizontal/uncancelable input %p', (init) => {
  expect(wheel('row-0', 120, init).defaultPrevented).toBe(false);
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it.each(['editor-0', 'nested-0', 'row-1'])(
  'leaves independent target %s alone',
  (target) => {
    expect(wheel(target, 120).defaultPrevented).toBe(false);
    expect(options.headerScroll.begin).not.toHaveBeenCalled();
  }
);

it('respects disabled list scrolling everywhere', () => {
  enabled = false;
  expect(wheel('header', 120).defaultPrevented).toBe(false);
  expect(wheel('row-0', 120).defaultPrevented).toBe(false);
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it('respects disabled header scrolling while allowing the feed', () => {
  options = { ...options, headerScrollEnabled: false };
  render();
  expect(wheel('header', 120).defaultPrevented).toBe(false);
  expect(wheel('row-0', 120).defaultPrevented).toBe(true);
  tick(140);
  expect(element('list-0').scrollTop).toBe(120);
});

it('clamps the end and lets later edge input chain to the browser', () => {
  expect(wheel('row-0', -120).defaultPrevented).toBe(false);
  wheel('row-0', 1200);
  tick(140);
  expect(element('list-0').scrollTop).toBe(1000);
  expect(wheel('row-0', 120).defaultPrevented).toBe(false);
});

it('clamps a changing content range during a wheel glide', () => {
  wheel('row-0', 900);
  tick(70);
  maxOffset = 400;
  tick(140);
  expect(element('list-0').scrollTop).toBe(400);
  expect(frames.size).toBe(0);
});

it.each(['pointerdown', 'touchstart', 'keydown'])(
  'yields pending motion to %s',
  (eventName) => {
    wheel('row-0', 120);
    tick(70);
    const event =
      eventName === 'keydown'
        ? new KeyboardEvent(eventName, { bubbles: true, key: 'PageDown' })
        : new Event(eventName, { bubbles: true });
    act(() => element('row-0').dispatchEvent(event));
    expect(frames.size).toBe(0);
    expect(options.headerScroll.index.value).toBe(-1);
    tick(140);
    expect(element('list-0').scrollTop).toBe(105);
  }
);

it('cancels pending work immediately on tab changes', () => {
  wheel('row-0', 120);
  tick(70);
  act(() => {
    options.activeIndex.value = 1;
  });
  expect(frames.size).toBe(0);
  tick(140);
  expect(element('list-0').scrollTop).toBe(105);
  expect(element('list-1').scrollTop).toBe(0);
});

it('does not cancel a controller another gesture has taken over', () => {
  wheel('row-0', 120);
  options.headerScroll.offset.value = 80;
  tick(70);
  expect(options.headerScroll.cancel).not.toHaveBeenCalled();
  expect(options.headerScroll.index.value).toBe(0);
  expect(options.headerScroll.offset.value).toBe(80);
  expect(frames.size).toBe(0);
});

it('removes pending frames and listeners on unmount', () => {
  wheel('row-0', 120);
  const host = element('host');
  act(() => root.render(null));
  expect(frames.size).toBe(0);
  expect(options.headerScroll.index.value).toBe(-1);
  jest.mocked(options.headerScroll.begin).mockClear();
  host.dispatchEvent(
    new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
  );
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});
