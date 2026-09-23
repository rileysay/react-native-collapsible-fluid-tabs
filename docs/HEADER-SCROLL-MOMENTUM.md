# Header scroll momentum

Header and tab-bar touches are outside the active native scroll view. The shared vertical pan therefore drives that view with UI-thread `scrollTo` calls. This applies to every adapter, including the Lab's default FlatList.

## September 15 correction

The reported issue concerned the glide after release. The existing activation threshold is preserved: scrolling begins at the position where the gesture activates, then follows incremental movement. Movement before activation distinguishes a drag from a tap or page swipe. That threshold behavior was initially misidentified as lost drag distance; it was not established as a separate bug.

The previous release passed the list's native deceleration rate straight into Reanimated's `withDecay`. Those models differ. The installed Reanimated 4.6.0 `rigidDecay` multiplies the previous velocity by a factor derived from the total elapsed time on every frame. More frames therefore produce more deceleration. Evaluating that installed function at a 200-point/s release and rate 0.998 produced about 69 points of travel at 60 Hz and 49 at 120 Hz. This explains why changing a constant alone cannot make the glide consistent.

## Current trajectory

`src/utils/scrollMomentum.ts` computes distance, duration and an elapsed-time curve from the release velocity. Reanimated's `withTiming` evaluates that curve on UI; it does not use the default timing easing or a fixed snap position.

- **iOS:** exponential velocity loss per millisecond using the list's numeric rate. The normal 0.998 rate projects approximately 100 points from a 200-point/s release. The trajectory stops below one point/s.
- **Android:** friction and spline distance/duration based on Android's OverScroller equations. React Native sets native friction to `1 - decelerationRate`. Density cancels when converting native pixel velocity and distance to React Native points. A 101-entry table makes per-frame spline evaluation inexpensive.
- **Web:** uses the iOS-style curve. Browser native momentum varies; this does not reproduce every browser's physics.

The position at a given elapsed time is independent of how many frames were rendered. When a boundary truncates the motion, the duration and curve are truncated together, preserving launch speed. A new touch, navigation, disabled/unmounted list or shrinking content cancels the owned trajectory. Reduced motion skips the release glide.

These are scroll models run by Reanimated. Native velocity estimation, repeated-fling acceleration, edge effects, platform-specific snapping and native drag/momentum callbacks are not reproduced. Physical device feel remains a required comparison; passing mathematical and browser checks does not establish identical native behavior.

The LegendList adapter also stopped exposing the container's shared scroll value to LegendList's separate native offset tracker. That second writer bypassed the header driver's event guard and could restore an older position during a header drag or on a shared-values update. Other LegendList shared values remain forwarded.

## References and verification

- [React Native ScrollView rates](https://reactnative.dev/docs/scrollview#decelerationrate) and the installed `ReactScrollView.setDecelerationRate` implementation.
- [Android OverScroller source](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/widget/OverScroller.java), particularly `SplineOverScroller`'s spline, physical coefficient, distance and duration.
- [Apple's Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/), describing projection with UIScrollView's deceleration rate.
- [Reanimated withTiming](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/) and the installed `src/animation/decay/rigidDecay.ts` for the previous behavior.

Regression tests cover stable position at activation, trajectory distance and release velocity, 60/90/120 Hz sampling, both boundaries, Android rates, invalid velocity, interruption, stale completions, shrinking content and the LegendList offset ownership conflict. Native dispatch is mocked in unit tests.

Browser touch replay verified continued gliding after release and preserved tab selection on each of the Lab's four adapters. Photo frames were checked at a 320-point viewport, and the desktop photo viewer stayed within its 600-point example column. The momentum implementation passed all 171 tests, TypeScript, ESLint, the library build and Android/iOS/web exports before the activation behavior was restored. Follow-up verification of that restoration is recorded below.

After restoring activation behavior, all 171 tests, TypeScript, ESLint and the library build passed again. A browser replay confirmed the original threshold behavior (24 points of finger movement with activation at 12 points produced 12 points of list movement), followed by continued release momentum and unchanged tab selection. Platform exports were not repeated for this restoration.
