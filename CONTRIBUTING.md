# Contributing

## Run locally

Use the Node version in [`.nvmrc`](./.nvmrc) and the repository's pinned Yarn version. Run these commands from the repository root:

```sh
corepack enable
yarn install --immutable
yarn example start
```

The [example app](./example/README.md) uses the library's local source. Open an Expo development client, or run `yarn example web` for the browser preview.

To build a native client locally, run `yarn example android` with the Android SDK installed, or `yarn example ios` on macOS with Xcode and CocoaPods. Rebuild after changing native dependencies, native patches, or Reanimated static flags.

The example's experimental [iOS refresh patch](./.yarn/patches/react-native-npm-0.86.3-a26c4d71a9.patch) is applied by the Yarn resolution. Keep `buildReactNativeFromSource` enabled in [example/app.json](./example/app.json) so the iOS build uses that patched source. Reloading Metro does not update native code.

## Check changes

```sh
yarn lint
yarn typecheck
yarn test --runInBand
yarn prepare
yarn example build:web
```

For interaction changes, test the affected list adapters and platforms in the example app. Include tab changes, interrupted scrolling, short content, and refresh when relevant. Unit tests and web exports do not verify native gesture behavior or frame pacing.

## Documentation

The website lives in [docs/](./docs/README.md). Edit guides in `docs/content/docs/`, then open a PR against `main`. Vercel provides a preview for review and publishes merged changes to [fluid-tabs.vercel.app](https://fluid-tabs.vercel.app).

```sh
cd docs
npm ci
npm run dev
```

Run `npm run check` before submitting site changes. API reference pages are generated from the library's public types and comments; after editing those, run `npm run docs:sync -- --skip-demo` and commit the generated changes too. `npm run docs:check` verifies they match.

## Send a pull request

Keep the change focused. Explain the problem, what changed, and how you checked it. Update the reference docs when public behavior or APIs change.

Report bugs with the versions, affected platform, and steps or code needed to reproduce them. Use [Discussions](https://github.com/rileysay/react-native-collapsible-fluid-tabs/discussions) for usage questions.
