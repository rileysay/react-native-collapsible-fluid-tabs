/** @jest-environment jsdom */
/// <reference lib="dom" />

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  GestureStateManager,
  MouseButton,
  PointerType,
  usePanGesture,
} from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import type { WebContentDragOptions } from '../useWebContentDrag';
import { useWebContentDrag } from '../useWebContentDrag.web';

jest.mock('react-native-gesture-handler', () => ({
  GestureStateManager: { fail: jest.fn(), activate: jest.fn() },
  MouseButton: { LEFT: 1 },
  PointerType: { TOUCH: 0, STYLUS: 1, MOUSE: 2 },
  usePanGesture: jest.fn((config: object) => ({ ...config, handlerTag: 7 })),
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type PanConfig = NonNullable<Parameters<typeof usePanGesture>[0]>;
type TouchEvent = Parameters<NonNullable<PanConfig['onTouchesDown']>>[0];
type ActivateEvent = Parameters<NonNullable<PanConfig['onActivate']>>[0];
type UpdateCallback = Extract<
  PanConfig['onUpdate'],
  (...args: never[]) => unknown
>;
type UpdateEvent = Parameters<UpdateCallback>[0];
type FinalizeEvent = Parameters<NonNullable<PanConfig['onFinalize']>>[0];

const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'elementFromPoint'
);
let root: Root;
let container: HTMLDivElement;
let options: WebContentDragOptions;
let gesture: PanConfig;
let hitTarget: Element | null;
let enabled: boolean;
let maxOffset: number;
let pageOffsets: number[];

function shared<T>(value: T): SharedValue<T> {
  return { value } as SharedValue<T>;
}

function element(id: string) {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
}

function Probe({ value }: { value: WebContentDragOptions }) {
  const result = useWebContentDrag(value);
  useLayoutEffect(() => {
    gesture = result as unknown as PanConfig;
  });
  return (
    <div>
      <div data-testid="chrome">Header</div>
      {[0, 1].map((index) => (
        <div data-testid={`list-${index}`} key={index}>
          <span data-testid={`row-${index}`}>Feed row</span>
          <button data-testid={`photo-${index}`} type="button">
            <span>Open photo</span>
          </button>
          <input data-testid={`input-${index}`} />
          <textarea data-testid={`textarea-${index}`} />
          <select data-testid={`select-${index}`}>
            <option>One</option>
          </select>
          <div
            data-testid={`editable-${index}`}
            contentEditable
            suppressContentEditableWarning
          >
            Editor
          </div>
          <div data-testid={`slider-${index}`} role="slider" />
          <div data-testid={`switch-${index}`} role="switch" />
          <div data-testid={`nested-${index}`} style={{ overflowY: 'auto' }}>
            <span>Nested list</span>
          </div>
          <div data-testid={`carousel-${index}`} style={{ overflowX: 'auto' }}>
            <span>Carousel</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function render() {
  act(() => root.render(<Probe value={options} />));
}

function touch(x = 0, y = 0, pointerType = PointerType.MOUSE): TouchEvent {
  return {
    handlerTag: 7,
    pointerType,
    allTouches: [
      { id: 1, x: 100 + x, y: 100 + y, absoluteX: 100 + x, absoluteY: 100 + y },
    ],
  } as TouchEvent;
}

function down(pointerType = PointerType.MOUSE) {
  act(() => gesture.onTouchesDown!(touch(0, 0, pointerType)));
}

function recognize(x: number, y: number) {
  act(() => gesture.onTouchesMove!(touch(x, y)));
}

function activate(translationY = -12) {
  act(() =>
    gesture.onActivate!({ handlerTag: 7, translationY } as ActivateEvent)
  );
}

function update(translationY: number, velocityY = 0) {
  const callback = gesture.onUpdate;
  if (typeof callback !== 'function')
    throw new Error('Expected pan update callback');
  act(() =>
    callback({ handlerTag: 7, translationY, velocityY } as UpdateEvent)
  );
}

function finalize(canceled = false) {
  act(() => gesture.onFinalize!({ handlerTag: 7, canceled } as FinalizeEvent));
}

function startDrag() {
  down();
  recognize(0, -12);
  expect(GestureStateManager.activate).toHaveBeenCalledWith(7);
  activate();
}

beforeEach(() => {
  jest.clearAllMocks();
  enabled = true;
  maxOffset = 500;
  pageOffsets = [120, 60];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const activeIndex = shared(0);
  const owner = shared(-1);
  const offset = shared(0);
  options = {
    activeIndex,
    directionConfig: {
      horizontalDistance: 15,
      verticalDistance: 10,
      ratio: 1.4,
    },
    listRefs: [0, 1].map(
      (index) => (() => element(`list-${index}`)) as unknown as AnimatedRef<any>
    ),
    headerScroll: {
      index: owner,
      offset,
      canScroll: () => enabled,
      maxOffset: () => maxOffset,
      begin: jest.fn(() => {
        if (!enabled) return false;
        owner.value = activeIndex.value;
        offset.value = pageOffsets[owner.value]!;
        return true;
      }),
      move: jest.fn((value: number) => {
        if (!enabled || owner.value !== activeIndex.value) return;
        offset.value = Math.max(0, Math.min(maxOffset, value));
        pageOffsets[owner.value] = offset.value;
        element(`list-${owner.value}`).scrollTop = offset.value;
      }),
      finish: jest.fn(),
      cancel: jest.fn(() => {
        owner.value = -1;
      }),
    },
    cancelScrollToTop: jest.fn(),
  };
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: jest.fn(() => hitTarget),
  });
  render();
  hitTarget = element('row-0');
  Object.defineProperties(element('nested-0'), {
    clientHeight: { value: 100 },
    scrollHeight: { value: 300 },
  });
  Object.defineProperties(element('carousel-0'), {
    clientWidth: { value: 100 },
    scrollWidth: { value: 300 },
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (elementFromPointDescriptor)
    Object.defineProperty(
      document,
      'elementFromPoint',
      elementFromPointDescriptor
    );
  else Reflect.deleteProperty(document, 'elementFromPoint');
});

// Gesture recognition/press cancellation requires browser verification. This harness
// runs the real direction classifier and hook lifecycle, with a bounded list
// driver, so it can verify intent, displacement and ownership independently.
it('keeps taps and sub-threshold mouse movement out of the scroll controller', () => {
  expect(gesture.mouseButton).toBe(MouseButton.LEFT);
  down();
  recognize(2, 5);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  act(() => gesture.onTouchesUp!(touch(2, 5)));
  finalize();
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
});

it('gives horizontal mouse movement back to the pager', () => {
  down();
  recognize(20, 3);
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it('resolves a large ambiguous diagonal as vertical using the shared classifier', () => {
  down();
  recognize(20, 20);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  recognize(30, 30);
  expect(GestureStateManager.activate).toHaveBeenCalledWith(7);
});

it('honors configured vertical thresholds', () => {
  options = {
    ...options,
    directionConfig: { ...options.directionConfig, verticalDistance: 25 },
  };
  render();
  down();
  recognize(0, 20);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  recognize(0, 25);
  expect(GestureStateManager.activate).toHaveBeenCalledWith(7);
});

it.each([PointerType.TOUCH, PointerType.STYLUS])(
  'leaves browser pointer type %s alone',
  (pointerType) => {
    down(pointerType);
    expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(options.headerScroll.begin).not.toHaveBeenCalled();
  }
);

it('rejects multiple simultaneous pointers', () => {
  const event = touch();
  act(() =>
    gesture.onTouchesDown!({
      ...event,
      allTouches: [...event.allTouches, { ...event.allTouches[0]!, id: 2 }],
    })
  );
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it('allows vertical dragging starting inside a clickable photo', () => {
  hitTarget = element('photo-0').firstElementChild;
  startDrag();
  update(-42);
  expect(pageOffsets[0]).toBe(150);
  expect(options.cancelScrollToTop).toHaveBeenCalledTimes(1);
});

it.each([
  'input',
  'textarea',
  'select',
  'editable',
  'slider',
  'switch',
  'nested',
  'carousel',
])('preserves independent %s interaction', (kind) => {
  const target = element(`${kind}-0`);
  hitTarget = target.firstElementChild ?? target;
  down();
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it.each(['chrome', 'row-1'])(
  'does not grab outside the active list: %s',
  (id) => {
    hitTarget = element(id);
    down();
    expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  }
);

it('rejects a missing hit target', () => {
  hitTarget = null;
  down();
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
});

it('does not activate when the list is disabled or cannot scroll', () => {
  enabled = false;
  down();
  recognize(0, -20);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
  enabled = true;
  maxOffset = 0;
  down();
  recognize(0, -20);
  expect(GestureStateManager.activate).not.toHaveBeenCalled();
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
});

it.each([0, -12])(
  'starts without jumping when activation translation is %s',
  (activationTranslation) => {
    down();
    recognize(0, -12);
    activate(activationTranslation);
    update(activationTranslation);
    expect(pageOffsets[0]).toBe(120);
    update(activationTranslation - 20);
    expect(pageOffsets[0]).toBe(140);
  }
);

it('reverses immediately after reaching either scroll boundary', () => {
  pageOffsets[0] = 490;
  startDrag();
  update(-32);
  expect(pageOffsets[0]).toBe(500);
  update(-22);
  expect(pageOffsets[0]).toBe(490);
  update(600);
  expect(pageOffsets[0]).toBe(0);
  update(590);
  expect(pageOffsets[0]).toBe(10);
});

it('hands the last scroll velocity to the existing momentum controller on release', () => {
  startDrag();
  update(-62, -420);
  finalize();
  expect(options.headerScroll.finish).toHaveBeenCalledWith(420);
  expect(options.headerScroll.cancel).not.toHaveBeenCalled();
  act(() => root.render(null));
  expect(options.headerScroll.cancel).not.toHaveBeenCalled();
});

it('cancels an interrupted drag without starting momentum', () => {
  startDrag();
  update(-62, -420);
  finalize(true);
  expect(options.headerScroll.cancel).toHaveBeenCalledWith(false);
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
});

it('revalidates the page before activation', () => {
  down();
  recognize(0, -12);
  options.activeIndex.value = 1;
  activate();
  expect(options.headerScroll.begin).not.toHaveBeenCalled();
  expect(GestureStateManager.fail).toHaveBeenCalledWith(7);
});

it('does not keep dragging the old page after navigation', () => {
  startDrag();
  update(-22);
  options.activeIndex.value = 1;
  update(-62);
  finalize();
  expect(pageOffsets).toEqual([130, 60]);
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
  expect(options.headerScroll.cancel).toHaveBeenCalledWith(false);
});

it('does not move or cancel a newer controller owner', () => {
  startDrag();
  options.headerScroll.index.value = 1;
  update(-62);
  finalize();
  expect(options.headerScroll.move).not.toHaveBeenCalled();
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
  expect(options.headerScroll.cancel).not.toHaveBeenCalled();
});

it('stops when scrolling becomes disabled during the drag', () => {
  startDrag();
  enabled = false;
  update(-62);
  finalize();
  expect(options.headerScroll.move).not.toHaveBeenCalled();
  expect(options.headerScroll.cancel).toHaveBeenCalledWith(false);
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
});

it('handles a failed controller begin without finalizing someone else', () => {
  down();
  recognize(0, -12);
  jest.mocked(options.headerScroll.begin).mockReturnValueOnce(false);
  activate();
  update(-62);
  finalize();
  expect(options.headerScroll.move).not.toHaveBeenCalled();
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
  expect(options.headerScroll.cancel).not.toHaveBeenCalled();
});

it('releases its active controller on unmount', () => {
  startDrag();
  act(() => root.render(null));
  expect(options.headerScroll.cancel).toHaveBeenCalledWith(false);
  expect(options.headerScroll.finish).not.toHaveBeenCalled();
});
