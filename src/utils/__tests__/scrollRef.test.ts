import {
  scrollTo,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import {
  scrollToMountedRef,
  setScrollRef,
  stopScrollAtOffset,
} from '../scrollRef';
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('react-native-reanimated', () => ({ scrollTo: jest.fn() }));

describe('scrollToMountedRef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scrolls with an object-shaped UI ref after the list mounts', () => {
    const ref = { value: 42 } as unknown as AnimatedRef<any>;
    const mounted = { value: true } as SharedValue<boolean>;

    expect(scrollToMountedRef(ref, mounted, 0, 120, false)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(ref, 0, 120, false);
  });

  it('scrolls with a callable UI ref from earlier Reanimated versions', () => {
    const ref = jest.fn() as unknown as AnimatedRef<any>;
    const mounted = { value: true } as SharedValue<boolean>;

    expect(scrollToMountedRef(ref, mounted, 0, 120, false)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(ref, 0, 120, false);
  });

  it('does not scroll after the list unmounts', () => {
    const ref = { value: 42 } as unknown as AnimatedRef<any>;
    const mounted = { value: false } as SharedValue<boolean>;

    expect(scrollToMountedRef(ref, mounted, 0, 120, false)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('stopScrollAtOffset', () => {
  beforeEach(() => {
    jest.mocked(scrollTo).mockReset();
  });

  it.each([0, 0.25, 120])(
    'stops an equal-offset iOS fling at %s and restores its exact position',
    (target) => {
      let offset = target;
      let decelerating = true;
      const ref = { value: 42 } as unknown as AnimatedRef<any>;
      const mounted = { value: true } as SharedValue<boolean>;
      // Model RN's early return, not UIKit's physical scrolling behavior.
      jest.mocked(scrollTo).mockImplementation((_ref, _x, y) => {
        if (y === offset) return;
        offset = y;
        decelerating = false;
      });

      scrollToMountedRef(ref, mounted, 0, target, false);
      expect(decelerating).toBe(true);
      expect(stopScrollAtOffset(ref, mounted, target, 120)).toBe(true);
      expect(decelerating).toBe(false);
      expect(offset).toBe(target);
    }
  );

  it('does not nudge beyond the lower edge when already at the bottom', () => {
    const ref = { value: 42 } as unknown as AnimatedRef<any>;
    stopScrollAtOffset(ref, { value: true } as SharedValue<boolean>, 120, 120);
    for (const [, , offset] of jest.mocked(scrollTo).mock.calls) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(120);
    }
    expect(scrollTo).toHaveBeenLastCalledWith(ref, 0, 120, false);
  });

  it.each([
    [-40, 120],
    [121, 120],
    [0, 0],
    [0, Number.NaN],
  ])(
    'leaves native bounce or unknown extent alone at %s with limit %s',
    (target, limit) => {
      const ref = { value: 42 } as unknown as AnimatedRef<any>;
      expect(
        stopScrollAtOffset(
          ref,
          { value: true } as SharedValue<boolean>,
          target,
          limit
        )
      ).toBe(false);
      expect(scrollTo).not.toHaveBeenCalled();
    }
  );

  it('keeps the intermediate offset inside a fractional scroll extent', () => {
    const ref = { value: 42 } as unknown as AnimatedRef<any>;
    expect(
      stopScrollAtOffset(ref, { value: true } as SharedValue<boolean>, 0, 0.25)
    ).toBe(true);
    for (const [, , offset] of jest.mocked(scrollTo).mock.calls) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(0.25);
    }
    expect(scrollTo).toHaveBeenLastCalledWith(ref, 0, 0, false);
  });

  it('never dispatches to an absent or unmounted native view', () => {
    const ref = { value: 42 } as unknown as AnimatedRef<any>;
    expect(
      stopScrollAtOffset(
        undefined,
        { value: true } as SharedValue<boolean>,
        10,
        120
      )
    ).toBe(false);
    expect(stopScrollAtOffset(ref, undefined, 10, 120)).toBe(false);
    expect(
      stopScrollAtOffset(ref, { value: false } as SharedValue<boolean>, 10, 120)
    ).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it.each(['android', 'web'])(
    'preserves the single-command path on %s',
    (platform) => {
      jest.resetModules();
      jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
      jest.isolateModules(() => {
        const { stopScrollAtOffset: stop } =
          require('../scrollRef') as typeof import('../scrollRef');
        const { scrollTo: nativeScroll } =
          require('react-native-reanimated') as typeof import('react-native-reanimated');
        const ref = { value: 42 } as unknown as AnimatedRef<any>;
        stop(ref, { value: true } as SharedValue<boolean>, 120, 120);
        expect(nativeScroll).toHaveBeenCalledTimes(1);
        expect(nativeScroll).toHaveBeenCalledWith(ref, 0, 120, false);
      });
    }
  );
});

describe('setScrollRef', () => {
  it('initializes the native ref before making it eligible for scrolling', () => {
    const mounted = { value: false } as SharedValue<boolean>;
    const instance = {};
    const ref = jest.fn(() => {
      expect(mounted.value).toBe(false);
    });

    setScrollRef(ref, mounted, instance);

    expect(ref).toHaveBeenCalledWith(instance);
    expect(mounted.value).toBe(true);
  });

  it('invalidates an unmounted ref even when it retains a native handle', () => {
    const mounted = { value: true } as SharedValue<boolean>;
    const ref = jest.fn(() => {
      expect(mounted.value).toBe(false);
      return { staleNativeTag: 42 };
    });

    setScrollRef(ref, mounted, null);

    expect(ref).toHaveBeenCalledWith(null);
    expect(mounted.value).toBe(false);
  });

  it('does not mark a failed ref attachment as mounted', () => {
    const mounted = { value: false } as SharedValue<boolean>;
    expect(() =>
      setScrollRef(
        () => {
          throw new Error('failed to resolve native view');
        },
        mounted,
        {}
      )
    ).toThrow('failed to resolve native view');
    expect(mounted.value).toBe(false);
  });
});
