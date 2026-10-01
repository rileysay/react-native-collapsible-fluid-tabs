#import <UIKit/UIGestureRecognizerSubclass.h>
#import <XCTest/XCTest.h>

#import <FluidTabsNativeScroll/FTNSScrollCoordinator.h>
#import <RNGestureHandler/RNGHExternalScroll.h>
#import <RNGestureHandler/RNGestureHandler.h>
#import <RNGestureHandler/RNNativeViewHandler.h>

// App-owned header, provided by the test target's HEADER_SEARCH_PATHS. This
// file must stay outside the production pod's ios/**/* source glob.
#import "FTNSPointerObserver.h"

// Stable identities and the public selectors consumed by the coordinator.
// These objects are passed directly to our code, never injected into UIKit.
@interface FTNSCoastTestTouch : NSObject
@property(nonatomic, strong) UIView *view;
@property(nonatomic) UITouchPhase phase;
@end
@implementation FTNSCoastTestTouch
- (UITouchType)type { return UITouchTypeDirect; }
@end

@interface FTNSCoastTestEvent : NSObject
@property(nonatomic) UIEventType type;
@property(nonatomic, copy) NSSet<UITouch *> *allTouches;
@end
@implementation FTNSCoastTestEvent
@end

static UITouch *FTNSTouch(UIView *view, UITouchPhase phase)
{
  FTNSCoastTestTouch *touch = [FTNSCoastTestTouch new];
  touch.view = view;
  touch.phase = phase;
  return (UITouch *)touch;
}

static UIEvent *FTNSEvent(UIEventType type, NSSet<UITouch *> *touches)
{
  FTNSCoastTestEvent *event = [FTNSCoastTestEvent new];
  event.type = type;
  event.allTouches = touches;
  return (UIEvent *)event;
}

@interface FTNSCoastTestPan : UIPanGestureRecognizer
@property(nonatomic) UIGestureRecognizerState testState;
@end
@implementation FTNSCoastTestPan
- (UIGestureRecognizerState)state { return self.testState; }
- (NSUInteger)numberOfTouches { return 0; }
@end

// This spy tests the coordinator's stop decision. It intentionally does not
// model UIKit's actual cancellation/delegate/responder delivery after a stop.
@interface FTNSCoastTestScrollView : UIScrollView
@property(nonatomic, strong) FTNSCoastTestPan *testPan;
@property(nonatomic) BOOL testDecelerating;
@property(nonatomic) BOOL testDragging;
@property(nonatomic) UIEdgeInsets testAdjustedInset;
@property(nonatomic) BOOL countStops;
@property(nonatomic) NSUInteger stopCount;
@end
@implementation FTNSCoastTestScrollView
- (UIPanGestureRecognizer *)panGestureRecognizer { return self.testPan ?: super.panGestureRecognizer; }
- (BOOL)isDecelerating { return self.testDecelerating; }
- (BOOL)isDragging { return self.testDragging; }
- (UIEdgeInsets)adjustedContentInset { return self.testAdjustedInset; }
- (void)stopScrollingAndZooming
{
  if (self.countStops) self.stopCount += 1;
  self.testDecelerating = NO;
}
- (void)setContentOffset:(CGPoint)contentOffset animated:(BOOL)animated
{
  [super setContentOffset:contentOffset animated:animated];
  if (self.countStops && !animated) {
    self.stopCount += 1;
    self.testDecelerating = NO;
  }
}
@end

@interface FTNSScrollCoordinatorTests : XCTestCase
@property(nonatomic, strong) UIWindow *testWindow;
@property(nonatomic, strong) UIView *host;
@property(nonatomic, strong) UIView *page;
@property(nonatomic, strong) UIView *header;
@property(nonatomic, strong) UIView *row;
@property(nonatomic, strong) FTNSCoastTestScrollView *scrollView;
@property(nonatomic, strong) RNNativeViewGestureHandler *handler;
@property(nonatomic, strong) FTNSScrollCoordinator *coordinator;
@property(nonatomic, strong) FTNSPointerObserver *pointerObserver;
@end

@implementation FTNSScrollCoordinatorTests

- (void)setUp
{
  [super setUp];
  XCTAssertTrue(NSThread.isMainThread);
  UIWindowScene *scene = nil;
  for (UIScene *candidate in UIApplication.sharedApplication.connectedScenes) {
    if ([candidate isKindOfClass:UIWindowScene.class]) {
      scene = (UIWindowScene *)candidate;
      if (candidate.activationState == UISceneActivationStateForegroundActive) break;
    }
  }
  XCTAssertNotNil(scene, @"Run as an app-hosted test with the configured scene lifecycle.");
  if (!scene) return;

  // A separate hidden scene-backed window gives the real views a window
  // without replacing the running app's root controller or key window.
  self.testWindow = [[UIWindow alloc] initWithWindowScene:scene];
  self.testWindow.frame = CGRectMake(0, 0, 390, 844);
  self.host = [[UIView alloc] initWithFrame:self.testWindow.bounds];
  self.page = [[UIView alloc] initWithFrame:CGRectMake(0, 150, 390, 694)];
  self.header = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 390, 150)];
  self.scrollView = [[FTNSCoastTestScrollView alloc] initWithFrame:CGRectMake(0, 0, 390, 600)];
  self.scrollView.contentSize = CGSizeMake(390, 2000);
  self.scrollView.testAdjustedInset = UIEdgeInsetsMake(10, 0, 20, 0);
  self.scrollView.contentOffset = CGPointMake(0, 500);
  self.scrollView.testPan = [FTNSCoastTestPan new];
  [self.scrollView addGestureRecognizer:self.scrollView.testPan];
  self.row = [[UIView alloc] initWithFrame:CGRectMake(0, 450, 390, 50)];
  [self.scrollView addSubview:self.row];
  [self.page addSubview:self.scrollView];
  [self.host addSubview:self.page];
  [self.host addSubview:self.header];
  [self.testWindow addSubview:self.host];
  XCTAssertEqual(self.page.window, self.testWindow);

  self.coordinator = [[FTNSScrollCoordinator alloc] initWithHost:self.host];
  [self.coordinator registerPage:self.page index:0];
  self.handler = [[RNNativeViewGestureHandler alloc] initWithTag:@90000001];
  self.handler.actionType = RNGestureHandlerActionTypeNativeDetector;
  self.handler.hostDetectorView = self.page;
  self.handler.needsPointerData = NO;
  [self.handler bindToView:self.page];
  [self.coordinator setAttached:YES];
  [self.coordinator updateActivePageIndex:0 paging:NO enabled:YES];
  XCTAssertTrue(RNGHExternalScrollIsRegistered(self.scrollView.panGestureRecognizer));
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.host);
  for (UIGestureRecognizer *recognizer in self.host.gestureRecognizers) {
    if ([recognizer isKindOfClass:FTNSPointerObserver.class]) {
      self.pointerObserver = (FTNSPointerObserver *)recognizer;
      break;
    }
  }
  XCTAssertNotNil(self.pointerObserver);
  self.scrollView.countStops = YES;
}

- (void)tearDown
{
  self.scrollView.countStops = NO;
  [self.coordinator setAttached:NO];
  [self.coordinator unregisterPage:self.page];
  self.coordinator = nil;
  self.pointerObserver = nil;
  [self.handler unbindFromView];
  self.handler = nil;
  [self.host removeFromSuperview];
  self.row = nil;
  self.header = nil;
  self.page = nil;
  self.scrollView = nil;
  self.host = nil;
  self.testWindow = nil;
  [super tearDown];
}

- (void)prepareCoastAtY:(CGFloat)y panState:(UIGestureRecognizerState)state
{
  self.scrollView.countStops = NO;
  self.scrollView.contentOffset = CGPointMake(0, y);
  self.scrollView.countStops = YES;
  self.scrollView.testDecelerating = YES;
  // Matches the independently recorded iOS 27 momentum-catch hit-test state.
  self.scrollView.testDragging = YES;
  self.scrollView.testPan.testState = state;
}

- (UIEvent *)emptyTouchEvent { return FTNSEvent(UIEventTypeTouches, [NSSet set]); }

- (void)testEmptyTouchEventStopsExternalCoastDespiteDraggingFlagOnlyOnce
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  UIEvent *event = [self emptyTouchEvent];
  [self.coordinator recordHitView:self.header event:event];
  [self.coordinator recordHitView:self.header event:event];
  XCTAssertEqual(self.scrollView.stopCount, 1u);
  XCTAssertFalse(self.scrollView.isDecelerating);
  XCTAssertEqualWithAccuracy(self.scrollView.contentOffset.y, 500, 0.001);
}

- (void)testEmptyTouchEventDoesNotStopListOriginCoast
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  [self.coordinator recordHitView:self.row event:[self emptyTouchEvent]];
  XCTAssertEqual(self.scrollView.stopCount, 0u);
  XCTAssertTrue(self.scrollView.isDecelerating);
}

- (void)testListHitDoesNotConsumeLaterExternalEmptyEventStop
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  UIEvent *event = [self emptyTouchEvent];
  [self.coordinator recordHitView:self.row event:event];
  [self.coordinator recordHitView:self.header event:event];
  XCTAssertEqual(self.scrollView.stopCount, 1u);
}

- (void)testEmptyEventNeverStopsRecognizedBeganOrChangedPan
{
  for (NSNumber *state in @[@(UIGestureRecognizerStateBegan), @(UIGestureRecognizerStateChanged)]) {
    [self prepareCoastAtY:500 panState:(UIGestureRecognizerState)state.integerValue];
    [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testKnownBeginningTouchNeverStopsRecognizedBeganOrChangedPan
{
  for (NSNumber *state in @[@(UIGestureRecognizerStateBegan), @(UIGestureRecognizerStateChanged)]) {
    [self prepareCoastAtY:500 panState:(UIGestureRecognizerState)state.integerValue];
    UITouch *touch = FTNSTouch(self.header, UITouchPhaseBegan);
    [self.coordinator recordHitView:self.header event:FTNSEvent(UIEventTypeTouches, [NSSet setWithObject:touch])];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testEmptyEventDoesNotStopWhileObserverTracksAnExistingPointer
{
  UITouch *touch = FTNSTouch(self.row, UITouchPhaseBegan);
  NSSet<UITouch *> *touches = [NSSet setWithObject:touch];
  [self.pointerObserver touchesBegan:touches withEvent:FTNSEvent(UIEventTypeTouches, touches)];
  XCTAssertEqual(self.pointerObserver.pointerCount, 1u);
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
  XCTAssertEqual(self.scrollView.stopCount, 0u);
}

- (void)testEmptyEventDoesNotStopTopOrBottomOverscroll
{
  // 2000 content - 600 viewport + 20 bottom inset = 1420; min = -10.
  for (NSNumber *y in @[@(-10.5), @(1420.5)]) {
    [self prepareCoastAtY:y.doubleValue panState:UIGestureRecognizerStatePossible];
    [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testEmptyEventAllowsStoppingAtBothInclusiveAdjustedInsetEdges
{
  NSUInteger expected = 0;
  for (NSNumber *y in @[@(-10), @(1420)]) {
    [self prepareCoastAtY:y.doubleValue panState:UIGestureRecognizerStatePossible];
    [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
    expected += 1;
    XCTAssertEqual(self.scrollView.stopCount, expected);
  }
}

- (void)testNilEventDoesNotStopCoast
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  // A defensive boundary check beyond the header's nonnull contract. The
  // Swift host already excludes nil; coordinator should not infer Touches=0.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wnonnull"
  [self.coordinator recordHitView:self.header event:nil];
#pragma clang diagnostic pop
  XCTAssertEqual(self.scrollView.stopCount, 0u);
}

- (void)testNonTouchEventsDoNotStopCoast
{
  for (NSNumber *type in @[@(UIEventTypeMotion), @(UIEventTypePresses)]) {
    [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
    [self.coordinator recordHitView:self.header event:FTNSEvent((UIEventType)type.integerValue, [NSSet set])];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testNonemptyEventsWithoutABeginningTouchDoNotStopCoast
{
  for (NSNumber *phase in @[@(UITouchPhaseMoved), @(UITouchPhaseStationary), @(UITouchPhaseEnded), @(UITouchPhaseCancelled)]) {
    [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
    UITouch *touch = FTNSTouch(self.header, (UITouchPhase)phase.integerValue);
    [self.coordinator recordHitView:self.header event:FTNSEvent(UIEventTypeTouches, [NSSet setWithObject:touch])];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testEmptyEventDoesNotStopWhenNotDecelerating
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  self.scrollView.testDecelerating = NO;
  [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
  XCTAssertEqual(self.scrollView.stopCount, 0u);
}

- (void)testEmptyEventRequiresPanPossible
{
  for (NSNumber *state in @[@(UIGestureRecognizerStateEnded), @(UIGestureRecognizerStateCancelled), @(UIGestureRecognizerStateFailed)]) {
    [self prepareCoastAtY:500 panState:(UIGestureRecognizerState)state.integerValue];
    [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
    XCTAssertEqual(self.scrollView.stopCount, 0u);
  }
}

- (void)testKnownBeginningExternalTouchStopsAndIsDeduplicated
{
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  UITouch *touch = FTNSTouch(self.header, UITouchPhaseBegan);
  UIEvent *event = FTNSEvent(UIEventTypeTouches, [NSSet setWithObject:touch]);
  [self.coordinator recordHitView:self.header event:event];
  XCTAssertEqual(self.scrollView.stopCount, 1u);
  // Deliberately re-arm the spy: this assertion isolates per-touch dedup from
  // the separate native-isDecelerating reset assumption of the empty path.
  self.scrollView.testDecelerating = YES;
  [self.coordinator recordHitView:self.header event:event];
  XCTAssertEqual(self.scrollView.stopCount, 1u);
}

- (void)testUnattachedCoordinatorDoesNotStopAnotherViewsCoast
{
  [self.coordinator setAttached:NO];
  [self prepareCoastAtY:500 panState:UIGestureRecognizerStatePossible];
  [self.coordinator recordHitView:self.header event:[self emptyTouchEvent]];
  XCTAssertEqual(self.scrollView.stopCount, 0u);
}

@end
