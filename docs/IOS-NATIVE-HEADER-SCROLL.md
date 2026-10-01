# iOS native header scroll (beta)

Experimental, on the `beta/ios-native-scroll` branch. Not published.

## Why

Header and tab-bar touches land outside the active list's native scroll view.
In 1.5.1 a JavaScript pan therefore drives that view with `scrollTo` calls (see
[header scroll momentum](./HEADER-SCROLL-MOMENTUM.md)). That can approximate a
glide, but not UIKit's own physics: a drag or fling that starts on the header
stops dead at the top and bottom, with no rubber-band overscroll or bounce, and
cannot pull the native refresh control the way a list drag does.

## How it works

UIKit lets you attach a scroll view's existing `panGestureRecognizer` to an
ancestor view. The recognizer keeps driving its own scroll view; Apple showed
this in WWDC 2014 session 235, "Advanced Scrollviews and Touch Handling
Techniques". A native host at the container root does this for the active list
while no finger is down, so drags from the header, tab bar and list all go
through the same `UIScrollView`. Nothing is simulated and no offsets are
written frame by frame.

- `registerNativeHeaderScroll(views)` opts in. iOS only; call it once before
  any container renders. Other platforms ignore it.
- The host wraps the collapsible header, tab bar and pager. It receives the
  active page index and a paging flag from the UI thread, and changes ownership
  only when no pointer is down and a page change has settled.
- The pinned area sits outside the host, so drags there never scroll the list,
  as without native scrolling. That includes blank parts of the pinned header
  and the reserved safe-area inset when there is no pinned header: a view
  behind the pinned header takes those touches, so taps there don't reach the
  collapsed header behind it either.
- The container still lays out its own `containerStyle`, padding included,
  around an empty view where the pager used to be. The pager is placed at that
  view's measured frame. With padding, or a layout other than a plain column,
  the pages appear once that frame is measured and the pages' width matches it.
- `headerScrollEnabled={false}` hands the pan back to the active list once no
  finger is down, without cancelling a touch in progress or remounting pages.
- Each adapter (ScrollView, FlatList, LegendList, FlashList) wraps its one
  outer native scroll view in a page registration. For FlatList and LegendList
  the Native gesture detector moves onto that scroll view instead of wrapping
  the list, so the gesture is never attached to two detectors.
- A touch that starts on the header or tab bar while the list is still coasting
  stops the coast first, so the tap reaches the control instead of only
  catching the fling. UIKit can query hit testing with an empty touch event
  before the new pan begins; the coordinator handles that external hit only
  while decelerating, with no observed pointer and a still-possible pan.
  It does not use `isDragging` alone to classify that transition. List-origin
  hits, an active pan and rubber-band overscroll are excluded from this stop.
  iOS 17.4 and later use `stopScrollingAndZooming`; older versions reset the
  current offset, an unverified compatibility fallback.
- While registered, the JavaScript header drag is disabled on iOS.
- Without registration, containers keep the JavaScript header drag.

## Requirements

- The native views. For now they live in the example as a local Expo module,
  [`example/modules/fluid-tabs-native-scroll`](../example/modules/fluid-tabs-native-scroll).
  The library itself contains no native code.
- react-native-gesture-handler 3.2.1 with the external scroll ownership patch
  in `.yarn/patches/react-native-gesture-handler-npm-3.2.1-ios-external-scroll-owner.patch`,
  taken from `rileysay/react-native-gesture-handler@ios-external-scroll-owner`.
  Gesture Handler otherwise identifies a scroll view's pan by the view it is
  attached to and loses track of it after the move. An upstream proposal is
  drafted but not yet opened.
- React Native's `RCTScrollViewComponentView` hit-test fix (`efcab2090`,
  checked in 0.87.1), or a backport of it. Without it, a touch that hit-tests
  to the scroll view's wrapper view instead of the scroll view is treated as a
  header touch. This applies to wrapper fallback hits, not every blank content
  area: a content-container hit already descends from the scroll view.
- The workspace's combined
  [React Native 0.86.3 patch](../.yarn/patches/react-native-npm-0.86.3-native-scroll-v2.patch)
  includes that backport, refresh painting/tint fixes, and Fabric momentum
  completion after an explicit native stop. The completion change notifies
  Fabric when `stopScrollingAndZooming` actually ends deceleration; Fabric
  consumes its active momentum state before emitting the terminal event.
  A later natural callback does not emit the same completion again. The
  coordinator stop and this completion fix must be used together: stopping
  UIKit alone left the next content tap blocked in the simulator reproduction.
- A new development build. Metro reloads cannot add native code.

## Comparing

The example home screen has three cards that open the same profile screen:

- **04 / Before** runs on the published 1.5.1 package from npm, installed as
  `react-native-collapsible-fluid-tabs-published`.
- **04B / Before + pointer events** runs 1.5.1 with the header passing touches
  on empty areas through to the list.
- **05 / After** runs on this branch with native header scroll registered.

Each tab uses a different adapter (Looks: LegendList, Posts: FlatList, Saved:
FlashList, About: ScrollView) and has pull-to-refresh. Chips in the header
switch the pull mode, the refresh style (Gesture Handler element, shorthand or
React Native element), the start tab and an inline list renderer; **Re-render**
updates the screen without remounting the lists. Development builds log
momentum, row taps and tab changes to Metro with a `[header-scroll]` prefix.
Start Metro with `EXPO_PUBLIC_NATIVE_HEADER_SCROLL=off` to run this branch's
JavaScript header drag in the same build. Build the example with
`yarn example ios` on a Mac, or with an EAS development build.

## Status

- **Native-v10, 1 October 2026:** the accepted audit fixes, coordinator coast
  handling and combined React Native patch compiled in the isolated SDK 57
  example. All 57 hosted native tests passed. Simulator integration exercised
  LegendList, FlatList, FlashList and ScrollView, including first taps during
  coasting and the subsequent content tap. These are bounded integration
  results, not a claim of every gesture or every device passing.
- The full final gesture-matrix review is pending. Its automation fixtures,
  diagnostic logs and cloud-machine configuration are not part of the package.
  The portable native tests are available through the example's opt-in
  [test harness](../example/native-test-harness).
- The tested simulator used an isolated Expo scene-support overlay for
  Xcode 27. This repository retains its existing Expo dependency versions;
  see [native validation](./NATIVE-VALIDATION.md) before reproducing that setup.
- Physical-device checks remain open, including threshold haptics, older iOS
  stop behavior, both release orders of two-finger drags, and accessibility
  interaction. RTL and uncommon container layouts still need native layout
  checks; source/JS tests alone do not establish their UIKit behavior.
- iOS list refresh shorthand creates React Native's `RefreshControl` instead
  of Gesture Handler's. This is experimental and applies with or without
  native header scroll.
- Android and web keep the JavaScript header drag; only iOS moves the list's
  pan. A horizontal swipe that starts on the header does not change tabs, as
  in 1.5.1. A vertical header drag that starts while a page change is still
  animating is held until the page settles.

This remains a workspace-only native experiment. The local Expo module and
Yarn dependency patches are not included automatically by installing the
published JavaScript package. Consumer integration requires the native module,
matching reviewed dependency patches and a new native build. No upstream PR
has been opened by this work.
