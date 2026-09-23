// Android's OverScroller uses a cubic spline and friction, whereas iOS's
// decelerationRate describes exponential velocity loss per millisecond.
// These rates cannot be passed interchangeably to Reanimated's withDecay.
// Model references: docs/HEADER-SCROLL-MOMENTUM.md.
const ANDROID_INFLECTION = 0.35;
const ANDROID_EXPONENT = Math.log(0.78) / Math.log(0.9);
// OverScroller's physical coefficient in density-independent units. Density
// cancels when both native velocity and pixel distance are converted to points.
const ANDROID_PHYSICAL_COEFFICIENT = 9.80665 * 39.37 * 160 * 0.84;

// Sample the cubic Bezier (0.175, 0.5, 0.35, 1), as OverScroller does.
// Build once on JS; each UI frame only interpolates two adjacent samples.
const ANDROID_SPLINE = Array.from({ length: 101 }, (_, i) => {
  if (i === 0 || i === 100) return i / 100;
  let low = 0;
  let high = 1;
  let u = 0;
  for (let step = 0; step < 24; step++) {
    u = (low + high) / 2;
    const x =
      3 * (1 - u) ** 2 * u * 0.175 + 3 * (1 - u) * u ** 2 * 0.35 + u ** 3;
    if (x < i / 100) low = u;
    else high = u;
  }
  return 3 * (1 - u) ** 2 * u * 0.5 + 3 * (1 - u) * u ** 2 + u ** 3;
});

function androidPosition(progress: number) {
  'worklet';
  const sample = Math.max(0, Math.min(100, progress * 100));
  const index = Math.min(99, Math.floor(sample));
  const start = ANDROID_SPLINE[index]!;
  return start + (ANDROID_SPLINE[index + 1]! - start) * (sample - index);
}

type Options = {
  position: number;
  velocity: number;
  maxOffset: number;
  deceleration: number;
  android: boolean;
};

/** A bounded, elapsed-time trajectory that preserves the release velocity. */
export function getScrollMomentum({
  position,
  velocity,
  maxOffset,
  deceleration,
  android,
}: Options) {
  'worklet';
  const speed = Math.abs(velocity);
  const available = velocity > 0 ? maxOffset - position : position;
  if (!Number.isFinite(speed) || speed <= 1 || available <= 0) return null;

  const rate = Math.max(0, Math.min(0.9999, deceleration));
  let duration: number;
  let distance: number;
  let curve: (progress: number) => number;
  if (android) {
    const friction = (1 - rate) * ANDROID_PHYSICAL_COEFFICIENT;
    duration =
      1000 *
      ((ANDROID_INFLECTION * speed) / friction) ** (1 / (ANDROID_EXPONENT - 1));
    distance = (ANDROID_INFLECTION * speed * duration) / 1000;
    curve = androidPosition;
  } else {
    if (rate === 0) return null;
    const logRate = Math.log(rate);
    // Stop below one point/second; the remaining motion is imperceptible.
    duration = Math.log(1 / speed) / logRate;
    const exponent = logRate * duration;
    const travel = -Math.expm1(exponent);
    distance = (speed * travel) / (-1000 * logRate);
    curve = (progress) => {
      'worklet';
      return -Math.expm1(exponent * progress) / travel;
    };
  }

  // A boundary shortens the trajectory's time, not its initial velocity.
  // Scaling the distance alone would make short/bounded flings feel sluggish.
  const fraction = Math.min(1, available / distance);
  let timeFraction = 1;
  if (fraction < 1) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (curve(middle) < fraction) low = middle;
      else high = middle;
    }
    timeFraction = (low + high) / 2;
  }
  return {
    target: Math.max(
      0,
      Math.min(maxOffset, position + Math.sign(velocity) * distance * fraction)
    ),
    duration: duration * timeFraction,
    easing: (progress: number) => {
      'worklet';
      return progress >= 1 ? 1 : curve(progress * timeFraction) / fraction;
    },
  };
}
