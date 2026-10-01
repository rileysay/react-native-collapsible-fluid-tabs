# iOS native refresh visibility

Experimental workspace patch for React Native **0.86.3**. The native-v10
simulator build includes it. Targeted simulator checks verified visible native
indicators after the offset correction; the full gesture matrix is still being
reviewed. Physical-device visibility and threshold haptics remain separate
checks. See [native validation](./NATIVE-VALIDATION.md) for the tested setup and
limits.

## What changed

The workspace resolution applies the combined
[React Native patch](../.yarn/patches/react-native-npm-0.86.3-native-scroll-v2.patch).
It replaces the earlier tint-only patch file and includes two refresh changes:

- Retain the earlier change that defers tint until the native control is
  attached, then reapplies the retained tint on attachment/recycling.
- Paint the indicator at `progressViewOffset` using a positive layer sublayer
  translation. The previous negative `bounds.origin.y` did not produce the
  intended visible offset in the tested Fabric/UIKit combination. This preserves
  the native refresh control's layout and reserved refresh space.

The same patch also contains the scroll-view hit-test backport and explicit
momentum-stop completion described in
[native header scrolling](./IOS-NATIVE-HEADER-SCROLL.md). Do not stack the old
patch on top of this combined patch.

The library still uses a real `UIRefreshControl` through React Native. It
supplies a default `PlatformColor('secondaryLabel')` tint and an automatic
offset when the caller omits them, preserving explicit values. There is no
replacement spinner, haptic dependency or delayed JavaScript tint timer.

## Why tint alone was insufficient

Earlier device observations suggested an interaction between initial tint and
native haptics. Those observations motivated the tint-after-attachment patch;
they did not establish that tint caused every invisible-spinner case.

The subsequent simulator reproduction used a plain React Native ScrollView
as well as Fluid Tabs. With an opaque 103-point pinned area, the native spinner
was hidden even after changing the offset on the same mounted control. With
the overlay made transparent, its unshifted position could be observed.
Native inspection then distinguished the indicator's painting from the
control's reserved space. The layer correction addresses that measured offset
problem. Simulator visibility does not verify a physical haptic.

## Applying the patch

The example builds React Native from source using `expo-build-properties` in
`example/app.json`. This is necessary for patched Objective-C++ to reach the
binary instead of using precompiled React Native. See the
[SDK 57 build-properties reference](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/).

Run the workspace install using its lockfile and make a new native build;
Metro cannot update these files. Installing the published JavaScript library
does **not** install this repository's React Native resolution into a consumer
app. Port and review the patch for the consumer's exact React Native version,
then rebuild. Do not assume the 0.86.3 patch applies to newer versions.

## Remaining checks

Use a fresh application launch for each binary comparison and record the
device, OS, React Native version and build:

1. Pull below and above the threshold in static and stretch modes, from the
   list, header and tab bar. Verify one callback per successful refresh and
   correct settling when `refreshing` becomes false.
2. Check default and explicit tint/offset, changing offset after attachment,
   programmatic refresh, tab changes, remounts and all four list adapters.
3. On physical iOS devices, check threshold haptics and visibility. A
   programmatic refresh is not expected to reproduce a finger-pull haptic.

The native XCTest suites test ownership and momentum event contracts. They do
not inspect the refresh indicator's pixels or prove haptic behavior; those
require their own integration observations.
