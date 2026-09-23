import { getScrollMomentum } from '../scrollMomentum';

const defaults = {
  position: 200,
  velocity: 200,
  maxOffset: 2000,
  deceleration: 0.998,
  android: false,
};

function trajectory(options: Partial<typeof defaults> = {}) {
  const config = { ...defaults, ...options };
  const motion = getScrollMomentum(config);
  if (!motion) throw new Error('Expected momentum');
  return {
    ...motion,
    at(time: number) {
      return (
        config.position +
        (motion.target - config.position) *
          motion.easing(Math.min(1, time / motion.duration))
      );
    },
  };
}

it('keeps an iOS micro-flick moving with the list deceleration rate', () => {
  const motion = trajectory();
  // At 200 points/s, UIKit's normal rate projects about 100 more points.
  // After 100 ms it should still be moving at roughly 164 points/s.
  expect(motion.target - defaults.position).toBeCloseTo(99.40047, 4);
  expect((motion.at(101) - motion.at(100)) * 1000).toBeCloseTo(163.549, 2);
  expect(motion.at(500) - defaults.position).toBeCloseTo(63.18561, 4);
});

it.each([200, -200, 1600, -1600])(
  'preserves release velocity %s and stays monotonic until resting',
  (velocity) => {
    for (const android of [false, true]) {
      const motion = trajectory({
        position: 1000,
        velocity,
        android,
        deceleration: android ? 0.985 : 0.998,
      });
      expect((motion.at(0.01) - motion.at(0)) / 0.00001).toBeCloseTo(
        velocity,
        -1
      );
      let previous = motion.at(0);
      for (let time = 10; time <= motion.duration; time += 10) {
        const next = motion.at(time);
        expect((next - previous) * Math.sign(velocity)).toBeGreaterThanOrEqual(
          0
        );
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(2000);
        previous = next;
      }
      expect(motion.at(motion.duration + 100)).toBe(motion.target);
    }
  }
);

it.each([false, true])(
  'has the same position at 60, 90 and 120 Hz (Android: %s)',
  (android) => {
    const motion = trajectory({
      velocity: 800,
      android,
      deceleration: android ? 0.985 : 0.998,
    });
    const traces = [60, 90, 120].map((fps) =>
      Array.from({ length: fps + 1 }, (_, frame) =>
        motion.at((frame * 1000) / fps)
      )
    );
    for (const ms of [100, 200, 300, 400, 500, 1000]) {
      const samples = [60, 90, 120].map(
        (fps, index) => traces[index]![(ms * fps) / 1000]!
      );
      expect(samples[0]).toBeCloseTo(samples[1]!, 8);
      expect(samples[0]).toBeCloseTo(samples[2]!, 8);
    }
  }
);

it('uses Android OverScroller friction for normal and fast lists', () => {
  const normal = trajectory({
    android: true,
    velocity: 800,
    deceleration: 0.985,
  });
  expect(normal.target - defaults.position).toBeCloseTo(131.899, 2);
  expect(normal.duration).toBeCloseTo(471.068, 2);
  const fast = trajectory({ android: true, velocity: 800, deceleration: 0.9 });
  expect(fast.target).toBeLessThan(normal.target);
  expect(fast.duration).toBeLessThan(normal.duration);
});

it.each([false, true])(
  'reaches either boundary without slowing the launch (Android: %s)',
  (android) => {
    for (const velocity of [-800, 800]) {
      const motion = trajectory({
        android,
        velocity,
        position: 10,
        maxOffset: 20,
        deceleration: android ? 0.985 : 0.998,
      });
      expect(motion.target).toBe(velocity < 0 ? 0 : 20);
      expect(motion.duration).toBeLessThan(20);
      expect((motion.at(0.01) - motion.at(0)) / 0.00001).toBeCloseTo(
        velocity,
        -1
      );
    }
  }
);

it.each([0, 1, -1, NaN, Infinity])(
  'does not animate invalid or idle velocity %s',
  (velocity) => {
    expect(getScrollMomentum({ ...defaults, velocity })).toBeNull();
  }
);

it('does not animate outward at a boundary', () => {
  expect(
    getScrollMomentum({ ...defaults, position: 0, velocity: -200 })
  ).toBeNull();
  expect(getScrollMomentum({ ...defaults, position: 2000 })).toBeNull();
});
