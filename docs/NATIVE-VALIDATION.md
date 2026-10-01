# Native validation checkpoint

This records the **1 October 2026 native-v10 simulator checkpoint**, not a
release-wide compatibility guarantee. The final gesture-matrix review remains
pending. Generated native projects, diagnostic fixtures, automation drivers,
recordings and cloud-machine configuration are deliberately outside this
repository's application setup.

## Tested configuration

| Component             | Native-v10 test copy                                 |
| --------------------- | ---------------------------------------------------- |
| Toolchain/runtime     | Xcode 27, iPhone 17e simulator, iOS 27.0, Debug      |
| Expo                  | 57.0.23 with scene support enabled                   |
| expo-build-properties | 57.0.20; React Native built from source              |
| React Native          | 0.86.3 with the combined workspace patch             |
| Gesture Handler       | 3.2.1 with the workspace external-scroll-owner patch |
| Reanimated / Worklets | 4.6.0 / 0.12.1                                       |
| Adapters              | LegendList, FlatList, FlashList, ScrollView          |

The repository retains its earlier Expo dependency selectors and lockfile
versions (Expo 57.0.20 and expo-build-properties 57.0.17). The tested Xcode 27
configuration used a separate compatibility overlay. It is **not** evidence
that the unchanged repository configuration launches on iOS 27.

For an Xcode 27 reproduction, use a separate test checkout and apply that
overlay through Expo: install `expo@57.0.23` and
`expo-build-properties@57.0.20` with `npx expo install`, then add
`ios.enableSceneSupport: true` to the existing `expo-build-properties` options
in `example/app.json`. Retain `buildReactNativeFromSource: true`. Do not hand-edit
AppDelegate or Info.plist. This is the SDK 57 backport described in Expo's
[scene lifecycle guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27)
and [versioned build-properties reference](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/).
No React Native or Gesture Handler upgrade is part of this reproduction.

## Verified native contracts

The hosted XCTest run executed **57 unique cases: 57 passed, 0 failed**:

| Suite                        | Executed | Scope                                                                                                   |
| ---------------------------- | -------: | ------------------------------------------------------------------------------------------------------- |
| RNGHExternalScrollTests      |       24 | External owner eligibility, binding/restoration and handler lifecycle                                   |
| FTNSScrollCoordinatorTests   |       15 | Early external coast hits, active-pointer/pan exclusions, bounds and event guards                       |
| RCTScrollStopCompletionTests |       18 | Public stop/delegate behavior, Fabric momentum completion/deduplication, recycle and programmatic paths |

The unchanged test inputs and their hashes are in
[the optional harness](../example/native-test-harness). Controlled public
states, fake event/touch objects and real Fabric emitter callbacks make these
regression tests deterministic. They do not synthesize every UIKit input path
or replace gesture integration tests.

The completed log ended with `TEST SUCCEEDED` at 08:31:06.775 UTC. Its SHA256
was `fe626a67346b05cef619be0342f94f54251f14fda3af0a15238826d3fe4e535a`.
Native source identities for that checkpoint:

| File                            | SHA256                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| FTNSScrollCoordinator.mm        | `7767ac302b64831b455eece96b5a6f90566dd006b0e5e39f3d5a2a7e5c510b2b` |
| FluidTabsNativeScrollHost.swift | `9527a5ae984f5e20142df48850acd6f01466342a04d56d93bb1c52145054ab6b` |
| Combined React Native patch     | `6163af82c1c1f30d8f36036c08f45f03402d1faa5a0a325b130fa1a10639db5f` |

Bounded simulator checks also exercised all four adapters and reproduced the
coast interruption problem before checking the paired coordinator/Fabric fix.
Native refresh visibility was examined separately from callback counts.
Neither a successful callback nor an accessibility frame proves that an
indicator is visible or that every intermediate animation frame is correct.

## Reproduce the hosted tests on macOS

Use a disposable checkout with the appropriate toolchain configuration above.
The example's ordinary app configuration is unchanged unless
`FLUID_NATIVE_TESTS=1` is supplied. Expo passes `app.json` into the dynamic
config, which appends the local plugin. See Expo's
[dynamic configuration documentation](https://docs.expo.dev/workflow/configuration/).

From the repository root, install the locked dependencies, then generate the
native test target through CNG:

```sh
yarn install --immutable
cd example
FLUID_NATIVE_TESTS=1 npx expo prebuild --platform ios --clean
xcrun simctl list devices available
```

`--clean` regenerates the example's generated native directory. Use it only in
the disposable test checkout, where there are no manual native changes to
preserve. Prebuild runs CocoaPods; if pod installation was deliberately
skipped, run `pod install` from `example/ios` before the next command.

Choose an available simulator UDID and use a new result-bundle path per run:

```sh
SIMULATOR_UDID="<available simulator UDID>"
xcodebuild test \
  -workspace ios/CollapsibleFluidTabsExample.xcworkspace \
  -scheme FluidTabsNativeTests \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -derivedDataPath /tmp/fluid-tabs-native-tests-derived-data \
  -resultBundlePath /tmp/fluid-tabs-native-tests.xcresult \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO
```

The plugin generates the target, shared scheme, Podfile inheritance and test
source copies. Do not edit `ios/*.xcodeproj/project.pbxproj` or copy implementation sources
into the test target manually. Stop any other UI automation while hosted tests
run. Regenerate a clean ordinary example without `FLUID_NATIVE_TESTS=1` to
remove the generated test target; merely unsetting the variable does not undo
an existing generated project.

## Limits and follow-up checks

- The complete final gesture matrix has not yet been accepted at this
  checkpoint. Partial passes must not be reported as a complete matrix pass.
- Physical iOS devices, native haptics, older iOS stop behavior, multi-pointer
  release order, VoiceOver, RTL and uncommon container layouts need their own
  checks. Simulator tests cannot establish these outcomes.
- Android and web retain the JavaScript header-drag implementation. iOS native
  test results do not validate their runtime behavior.
- No FPS, leak-free, low-memory or CPU-efficiency claim follows from these
  tests. Debug/simulator resource samples and profiling require separate
  interpretation.
- The native module and dependency patches are workspace-only. They are not
  installed automatically with the published JavaScript package, and these
  results do not establish compatibility with another React Native version.
