# Fluid Tabs playground

Start from the repository root:

```sh
corepack yarn install
corepack yarn example start --port 8082
```

Open the example in a development build, or press `w` for web. The playground uses Expo Router (`router.push('/x')`, `/instagram`, `/lab`).

The home screen opens three demos:

| Demo        | Tabs                                        | List adapters                 |
| ----------- | ------------------------------------------- | ----------------------------- |
| X           | Posts, Replies, Media, Likes                | LegendList in every tab       |
| Instagram   | Posts, Reels, Tagged                        | LegendList in every tab       |
| Lab         | FlatList, LegendList, ScrollView, FlashList | The adapter named by each tab |

The social profiles are illustrative layouts with fictional content. Photos are bundled for offline testing; their sources are recorded in [assets/photos/README.md](./assets/photos/README.md). The Reels tab uses still previews, not video playback. Refresh simulates a request lasting 1.5 seconds.

In the Lab, open **Controls** from the bottom toolbar to change the pinned header, collapsing header, top inset, header dragging, paging, direction ratio, and static/stretch refresh behavior. The panel also supports programmatic refresh, jumping to the first or last tab, and restoring defaults.

The Lab starts with a collapsing header, no pinned header, and `topInset={0}`. Initial safe-area padding is inside the collapsing header, so it scrolls away. The tab bar can reach the cutout area too; the bottom toolbar remains available. Turn **Scroll behind notch** off to restore the device inset. The docs phone preview supplies a simulated top safe area; its pinned toolbar always stays below the status bar. Standalone web uses the browser's safe-area values, and native uses the device's insets.

The example uses React Native's built-in `Image`. Photos fill bounded frames so bundled image dimensions do not determine row layout. UI icons come from `reicon-react-native` (via `react-native-svg`), with archived Reicon X and Instagram brand SVGs on the home screen. The Fluid Tabs wordmark matches the documentation site. Web and the docs iframe pick these up from the JS bundle; iOS and Android need a development client that includes `react-native-svg`.

The docs site serves a static Expo web export of this app inside its phone frame. Source edits appear there after rebuilding the export and syncing it to the docs project; the embedded preview does not update automatically.
