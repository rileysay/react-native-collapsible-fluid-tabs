# Optional iOS native tests

This example-only harness generates the hosted `FluidTabsNativeTests` XCTest
target through Expo Prebuild. It is disabled unless `FLUID_NATIVE_TESTS=1`.
It is not shipped in the library's npm package and does not add a target to
ordinary example builds.

The plugin adds a test target, shared scheme and Podfile target inheriting the
application's pods. It preserves Expo's generated module provider and derives
the Swift language version from the host project. Native implementation files
remain in their existing pods; only the test sources below are copied into the
generated test target. Existing unrecognized target/source contents cause an
error instead of being overwritten.

| Source                            | Tests | SHA256                                                             |
| --------------------------------- | ----: | ------------------------------------------------------------------ |
| `RNGHExternalScrollTests.mm`      |    24 | `e92a872c50b87458d9f66b13b7ec1fb4cc33c7b09039f85287ddf562d8b7333b` |
| `FTNSScrollCoordinatorTests.mm`   |    15 | `dbfd5423b7bb1ebcee39ec425014873e48c3c8848cee4c39f1f11d36667704d4` |
| `RCTScrollStopCompletionTests.mm` |    18 | `d77bb3efb351f6e08e49c873733bfeb59cb8e3e0db8e2ed6f7b6583f81030c0c` |

These unchanged sources executed successfully in the native-v10 simulator
run: **57 passed, 0 failed**. The source hashes are checked by the plugin.
When intentionally updating a test, review and update its plugin hash too.

See [native validation](../../docs/NATIVE-VALIDATION.md) for the tested versions,
scope, toolchain prerequisite and reproduction commands. No generated `ios/`
files belong in this directory or need manual edits.
