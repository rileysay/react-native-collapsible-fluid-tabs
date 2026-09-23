# iOS native refresh visibility and haptics

Status: experimental native patch implemented locally; no successful native compile or physical-device verification is recorded here. On 14 September 2026, the build submission was blocked by the Expo account's monthly free iOS build quota. EAS uploaded the project but created no build, and the CLI reported a reset on 1 October 2026. The client used for that diagnostic did not contain this change. These are historical build/account observations, not a live account or installed-client status check.

## Observations recorded on 14 September 2026

On the example's iPhone, both pull modes started refreshing and reserved the expected indicator space, but the spinner was invisible. An explicit system tint made it visible. Removing the initially added zIndex did not restore the missing haptic, so no stacking override is retained. Withholding tint restored native haptics but hid the spinner again.

Deferring tint from JavaScript until the RefreshControl's `onLayout` did not solve both symptoms. React Native's Fabric component is a hidden attachment helper; the actual `UIRefreshControl` lives under the scroll view, outside that helper. Its layout callback is not a reliable native attachment signal. That JavaScript wrapper has been removed.

These results resemble [React Native issue #43388](https://github.com/react/react-native/issues/43388), which reports missing pull haptics when `tintColor` is supplied. The issue does not establish the cause of this example's invisible spinner. Unpatched React Native 0.86.3 applies initial tint in `updateProps` before `_attach` assigns `scrollView.refreshControl`; this workspace tests the hypothesis that changing that order preserves both visibility and the pull haptic. Both installed React Native copies include the patch below, so they no longer use the unpatched order.

## Experimental native workaround

The workspace resolution in `package.json` applies [the Yarn patch](../.yarn/patches/react-native-npm-0.86.3-a26c4d71a9.patch) to React Native 0.86.3 in both workspaces. It changes only the Fabric iOS refresh component:

- Defer tint updates while the control is detached.
- Apply the latest tint immediately after assigning `scrollView.refreshControl` in `_attach`, before layout starts any programmatic refresh.
- Keep subsequent tint updates while attached. Read the retained props when attaching recycled instances, whose native refresh control is new.

The library still renders the real native refresh control. It supplies a default `PlatformColor('secondaryLabel')` tint and the appropriate offset, preserving explicit caller tint and styling. There is no added haptic dependency, replacement iOS spinner, timer, or delayed JavaScript tint update.

`example/app.json` enables `expo-build-properties`' iOS `buildReactNativeFromSource`. Without this setting, Expo's precompiled React Native can bypass patched native source. See [Expo's build properties documentation](https://docs.expo.dev/versions/latest/sdk/build-properties/#sharedbuildconfigfields).

Install a newly built iOS development client to test the native patch. Reloading Metro cannot update Objective-C++ code. This workspace patch is not automatically applied to consumer apps when the JavaScript library is installed; those apps need a matching React Native patch and native rebuild until the underlying issue is fixed upstream. Re-evaluate the patch when upgrading React Native.

## Device checks before calling this fixed

Use a fresh application launch for each binary comparison; Fast Refresh can retain a native control that was already initialized incorrectly. Record the iOS version, device, React Native version and build ID.

1. In both static and stretch modes, pull from the top: the native spinner should be visible and the native threshold haptic should be felt.
2. Release above the threshold: the callback should run once and the spinner should remain visible until `refreshing` becomes false.
3. Release below the threshold: no refresh callback should run and spacing should settle.
4. Repeat after switching tabs, switching modes and remounting the list. Check Feed and the other list adapters.
5. Check programmatic refresh, explicit tint, tint changes after mounting and explicit indicator offsets. Programmatic refresh is not expected to reproduce a user's pull haptic.

For an upstream reproduction, isolate a plain React Native `ScrollView` with a controlled `RefreshControl`, first without `tintColor`, then with it supplied on initial mount. Compare fresh launches with and without the native patch before adding any collapsible header or Gesture Handler wrapper. JavaScript tests cover prop forwarding; they cannot establish UIKit haptic or spinner behavior.

## Historical checks from 14 September 2026

At that point, 98 Jest tests across 8 suites, TypeScript, ESLint, the library build and an immutable Yarn install passed. Both installed React Native copies contained the patch. Expo introspection emitted `ios.buildReactNativeFromSource: "true"`; the SDK 57 Podfile template used it to disable both precompiled React Native Core and React Native dependencies. The inspected EAS archive contained the patch and app configuration. These results describe that revision and do not replace checks on the current code.

Expo's dependency check then requested newer SDK 57 patch releases for Expo, development-client, splash-screen and system-ui. Those versions were not changed as part of that native diagnostic. The EAS submission reached the quota check after credential setup and upload; no native compile ran.
