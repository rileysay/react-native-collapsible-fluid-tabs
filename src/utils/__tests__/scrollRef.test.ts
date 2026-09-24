import {
  scrollTo,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { scrollToMountedRef, setScrollRef } from '../scrollRef';
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
