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
this in WWDC 2014 session 235. A native host at the container root does this
for the active list while no finger is down, so drags from the header, tab bar
and list all go through the same `UIScrollView`. Nothing is simulated and no
offsets are written frame by frame.

- `registerNativeHeaderScroll(views)` opts in. iOS only; call it once before
  any container renders. Other platforms ignore it.
- The host is the container root, the common ancestor of the header and
  pager. It receives the active page index and a paging flag from the UI
  thread and changes ownership only when no pointer is down and a page change
  has settled.
- Each adapter (ScrollView, FlatList, LegendList, FlashList) wraps its one
  outer native scroll view in a page registration. For FlatList and LegendList
  the Native gesture detector moves onto that scroll view instead of wrapping
  the list, so the gesture is never attached to two detectors.
- While registered, the JavaScript header drag is disabled on iOS.
- Without registration, every container behaves exactly as in 1.5.1.

## Requirements

- The native views. For now they live in the example as a local Expo module,
  [`example/modules/fluid-tabs-native-scroll`](../example/modules/fluid-tabs-native-scroll).
  The library itself contains no native code.
- react-native-gesture-handler 3.2.1 with the external scroll patch in
  `.yarn/patches`. Gesture Handler otherwise identifies a scroll view's pan by
  the view it is attached to and loses track of it after the move. The change
  is proposed upstream from
  `rileysay/react-native-gesture-handler@ios-external-scroll-owner`.
- A new development build. Metro reloads cannot add native code.

## Comparing

The example home screen has two new cards that open the same profile screen:

- **04 / Before** runs on the published 1.5.1 package from npm, installed as
  `react-native-collapsible-fluid-tabs-published`.
- **05 / After** runs on this branch with native header scroll registered.

Each tab uses a different adapter (Looks: LegendList, Posts: FlatList, Saved:
FlashList, About: ScrollView) and has pull-to-refresh. The About tab lists
what to try. Build the example with `yarn example ios` on a Mac, or with an EAS
development build.

## Status

- The native module and Gesture Handler patch are the revision that compiled
  and ran on device in a consumer app, where header drags got native momentum,
  overscroll, bounce and refresh with ScrollView and LegendList.
- The library integration on this branch passes typecheck, lint, 251 Jest
  tests and an iOS Metro bundle. It has not yet been built with Xcode or run
  on a device, and FlatList and FlashList have not been checked on a device.
- Android and web are unchanged.
- Unchanged from 1.5.1: a horizontal swipe that starts on the header does not
  change tabs.
- New: a vertical header drag that starts while a page change is still
  animating is held until the page settles, so the visible list scrolls.
