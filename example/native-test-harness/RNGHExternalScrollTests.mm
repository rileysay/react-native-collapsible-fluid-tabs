#import <UIKit/UIGestureRecognizerSubclass.h>
#import <XCTest/XCTest.h>

#import <RNGestureHandler/RNGHExternalScroll.h>
#import <RNGestureHandler/RNGestureHandler.h>
#import <RNGestureHandler/RNNativeViewHandler.h>

// Exercise the implementation's state synchronization directly without creating
// synthetic UITouch instances. This declaration does not replace the method.
@interface RNDummyGestureRecognizer (RNGHExternalScrollTests)
- (instancetype)initWithGestureHandler:(RNGestureHandler *)handler;
- (void)updateStateIfScrollView;
@end

// The production methods only need stable touch identities, their original
// views and pointer types in these tests. Do not construct private UIKit events.
@interface RNGHTestTouch : NSObject
@property (nonatomic, strong) UIView *view;
@end
@implementation RNGHTestTouch
- (UITouchType)type
{
  return UITouchTypeDirect;
}
@end

@interface RNGHTestEvent : NSObject
@property (nonatomic, copy) NSSet<UITouch *> *allTouches;
@end
@implementation RNGHTestEvent
@end

static UITouch *TestTouch(UIView *view)
{
  RNGHTestTouch *touch = [RNGHTestTouch new];
  touch.view = view;
  return (UITouch *)touch;
}

static UIEvent *TestEvent(NSSet<UITouch *> *touches)
{
  RNGHTestEvent *event = [RNGHTestEvent new];
  event.allTouches = touches;
  return (UIEvent *)event;
}

// Guard tests need deterministic in-flight states without synthesizing UIKit
// touches or mutating the private implementation of UIScrollView's own pan.
@interface RNGHTestPanGestureRecognizer : UIPanGestureRecognizer
@property (nonatomic) UIGestureRecognizerState testState;
@property (nonatomic) NSUInteger testTouchCount;
@end

@implementation RNGHTestPanGestureRecognizer
- (UIGestureRecognizerState)state
{
  return self.testState;
}
- (NSUInteger)numberOfTouches
{
  return self.testTouchCount;
}
@end

@interface RNGHTestScrollView : UIScrollView
@property (nonatomic, strong) RNGHTestPanGestureRecognizer *testPan;
@end

@implementation RNGHTestScrollView
- (UIPanGestureRecognizer *)panGestureRecognizer
{
  return self.testPan ?: super.panGestureRecognizer;
}
@end

@interface RNGHTestDummyGestureRecognizer : RNDummyGestureRecognizer
@property (nonatomic) UIGestureRecognizerState testState;
@property (nonatomic) NSUInteger testTouchCount;
@end

@implementation RNGHTestDummyGestureRecognizer
- (UIGestureRecognizerState)state
{
  return self.testState;
}
- (NSUInteger)numberOfTouches
{
  return self.testTouchCount;
}
@end

@interface RNGHTestNativeViewGestureHandler : RNNativeViewGestureHandler
@end

@implementation RNGHTestNativeViewGestureHandler
- (instancetype)initWithTag:(NSNumber *)tag
{
  if ((self = [super initWithTag:tag])) {
    _recognizer = [RNGHTestDummyGestureRecognizer new];
  }
  return self;
}
@end

// Record state assignments while retaining the real dummy's lifecycle methods.
// UIKit normally schedules state/reset delivery internally; the recorder makes
// terminal ordering observable without dispatching fabricated system touches.
@interface RNGHLifecycleDummyGestureRecognizer : RNDummyGestureRecognizer
@property (nonatomic) UIGestureRecognizerState testState;
@property (nonatomic, strong) NSMutableArray<NSNumber *> *reportedStates;
@end

@implementation RNGHLifecycleDummyGestureRecognizer
- (instancetype)initWithGestureHandler:(RNGestureHandler *)handler
{
  if ((self = [super initWithGestureHandler:handler])) {
    _reportedStates = [NSMutableArray new];
  }
  return self;
}
- (UIGestureRecognizerState)state
{
  return self.testState;
}
- (void)setState:(UIGestureRecognizerState)state
{
  self.testState = state;
  [self.reportedStates addObject:@(state)];
}
- (void)reset
{
  [super reset];
  self.testState = UIGestureRecognizerStatePossible;
}
@end

@interface RNGHLifecycleNativeViewGestureHandler : RNNativeViewGestureHandler
@end
@implementation RNGHLifecycleNativeViewGestureHandler
- (instancetype)initWithTag:(NSNumber *)tag
{
  if ((self = [super initWithTag:tag])) {
    _recognizer = [[RNGHLifecycleDummyGestureRecognizer alloc] initWithGestureHandler:self];
  }
  return self;
}
@end

@interface RNGHExternalScrollTests : XCTestCase
@property (nonatomic, strong) UIView *host;
@property (nonatomic, strong) UIView *detector;
@property (nonatomic, strong) UIScrollView *scrollView;
@property (nonatomic, strong) RNNativeViewGestureHandler *handler;
@end

@implementation RNGHExternalScrollTests

- (void)setUp
{
  [super setUp];
  XCTAssertTrue(NSThread.isMainThread);
  self.host = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 390, 844)];
  self.detector = [[UIView alloc] initWithFrame:CGRectMake(0, 150, 390, 694)];
  self.scrollView = [[UIScrollView alloc] initWithFrame:CGRectMake(11, 17, 360, 650)];
  self.scrollView.contentSize = CGSizeMake(360, 1800);
  [self.host addSubview:self.detector];
  [self.detector addSubview:self.scrollView];
  RNGHExternalScrollSetViewOwner(self.detector, self.scrollView);
  self.handler = [[RNNativeViewGestureHandler alloc] initWithTag:@1];
  self.handler.actionType = RNGestureHandlerActionTypeNativeDetector;
  self.handler.hostDetectorView = self.detector;
  [self.handler bindToView:self.detector];
}

- (void)tearDown
{
  RNGHExternalScrollRestore(self.scrollView, YES);
  [self.handler unbindFromView];
  RNGHExternalScrollSetViewOwner(self.detector, nil);
  self.handler = nil;
  self.scrollView = nil;
  self.detector = nil;
  self.host = nil;
  [super tearDown];
}

- (RNGHTestPanGestureRecognizer *)installTestPanWithLifecycleRecorder
{
  [self.handler unbindFromView];
  RNGHTestScrollView *scrollView = [[RNGHTestScrollView alloc] initWithFrame:self.scrollView.frame];
  RNGHTestPanGestureRecognizer *pan = [RNGHTestPanGestureRecognizer new];
  scrollView.testPan = pan;
  [scrollView addGestureRecognizer:pan];
  [self.scrollView removeFromSuperview];
  self.scrollView = scrollView;
  [self.detector addSubview:scrollView];
  RNGHExternalScrollSetViewOwner(self.detector, scrollView);
  self.handler = [[RNGHLifecycleNativeViewGestureHandler alloc] initWithTag:@7];
  self.handler.actionType = RNGestureHandlerActionTypeNativeDetector;
  self.handler.hostDetectorView = self.detector;
  self.handler.needsPointerData = NO;
  [self.handler bindToView:self.detector];
  XCTAssertTrue(RNGHExternalScrollAttach(scrollView, self.handler, self.host));
  return pan;
}

- (void)testAttachAndRestoreKeepTheOriginalRecognizersAndViews
{
  UIPanGestureRecognizer *pan = self.scrollView.panGestureRecognizer;
  UIGestureRecognizer *dummy = self.handler.recognizer;
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(self.scrollView.panGestureRecognizer, pan);
  XCTAssertEqual(self.handler.recognizer, dummy);
  XCTAssertEqual(pan.view, self.host);
  XCTAssertEqual(dummy.view, self.host);
  XCTAssertEqual(RNGHExternalScrollOwner(pan), self.scrollView);
  XCTAssertEqual(RNGHExternalScrollOwner(dummy), self.scrollView);
  XCTAssertEqual(RNGHExternalScrollHandler(pan), self.handler);
  XCTAssertEqual(RNGHExternalScrollOriginalView(pan), self.scrollView);
  XCTAssertEqual(RNGHExternalScrollOriginalView(dummy), self.detector);

  RNGHExternalScrollRestore(self.scrollView, NO);
  XCTAssertEqual(pan.view, self.scrollView);
  XCTAssertEqual(dummy.view, self.detector);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(pan));
  XCTAssertFalse(RNGHExternalScrollIsRegistered(dummy));
  XCTAssertNil(RNGHExternalScrollOwner(pan));
  XCTAssertNil(RNGHExternalScrollOriginalView(dummy));
  RNGHExternalScrollRestore(self.scrollView, YES);
  XCTAssertEqual(pan.view, self.scrollView, @"Restoration must be idempotent");
}

- (void)testRestorePreservesEnabledStatesAndDelegates
{
  UIPanGestureRecognizer *pan = self.scrollView.panGestureRecognizer;
  UIGestureRecognizer *dummy = self.handler.recognizer;
  id<UIGestureRecognizerDelegate> panDelegate = pan.delegate;
  id<UIGestureRecognizerDelegate> dummyDelegate = dummy.delegate;
  for (NSNumber *cancel in @[ @NO, @YES ]) {
    for (NSNumber *panEnabled in @[ @NO, @YES ]) {
      for (NSNumber *dummyEnabled in @[ @NO, @YES ]) {
        pan.enabled = panEnabled.boolValue;
        dummy.enabled = dummyEnabled.boolValue;
        XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
        XCTAssertEqual(pan.delegate, panDelegate);
        XCTAssertEqual(dummy.delegate, dummyDelegate);
        RNGHExternalScrollRestore(self.scrollView, cancel.boolValue);
        XCTAssertEqual(pan.enabled, panEnabled.boolValue);
        XCTAssertEqual(dummy.enabled, dummyEnabled.boolValue);
        XCTAssertEqual(pan.delegate, panDelegate);
        XCTAssertEqual(dummy.delegate, dummyDelegate);
      }
    }
  }
}

- (void)testAttachmentPreservesTheV3CoordinateView
{
  UIView *coordinateView = self.handler.coordinateView;
  XCTAssertEqual(coordinateView, self.scrollView);
  CGPoint before = [self.host convertPoint:CGPointMake(40, 220) toView:coordinateView];
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(self.handler.coordinateView, coordinateView);
  CGPoint after = [self.host convertPoint:CGPointMake(40, 220) toView:self.handler.coordinateView];
  XCTAssertEqualWithAccuracy(after.x, before.x, 0.001);
  XCTAssertEqualWithAccuracy(after.y, before.y, 0.001);
  XCTAssertEqual([self.handler chooseViewForInteraction:self.handler.recognizer], self.detector);
}

- (void)testRejectsDuplicateAttachmentWithoutChangingOwnership
{
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(RNGHExternalScrollOwner(self.handler.recognizer), self.scrollView);
  XCTAssertEqual(self.handler.recognizer.view, self.host);
}

- (void)testRejectsUnrelatedHostsAndMismatchedOwners
{
  UIView *unrelatedHost = [UIView new];
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, self.handler, unrelatedHost));
  UIScrollView *otherScrollView = [UIScrollView new];
  [self.host addSubview:otherScrollView];
  XCTAssertFalse(RNGHExternalScrollAttach(otherScrollView, self.handler, self.host));
  XCTAssertEqual(self.handler.recognizer.view, self.detector);
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(otherScrollView.panGestureRecognizer));
}

- (void)testRejectsADummyOutsideTheHost
{
  UIView *outside = [UIView new];
  RNGHExternalScrollSetViewOwner(outside, self.scrollView);
  [self.handler unbindFromView];
  [self.handler bindToView:outside];
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(self.handler.recognizer.view, outside);
  RNGHExternalScrollSetViewOwner(outside, nil);
}

- (void)testRejectsAnUnboundOrNonNativeHandler
{
  RNNativeViewGestureHandler *unbound = [[RNNativeViewGestureHandler alloc] initWithTag:@2];
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, unbound, self.host));
  RNGestureHandler *nonNative = [[RNGestureHandler alloc] initWithTag:@3];
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, nonNative, self.host));
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
}

- (void)testRejectsVirtualTargetsWithoutMovingRecognizers
{
  self.handler.virtualViewTag = @42;
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(self.handler.recognizer.view, self.detector);
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(self.handler.recognizer));
  self.handler.virtualViewTag = nil;
}

- (void)testRejectsManualActivationWithoutMovingRecognizers
{
  self.handler.manualActivation = YES;
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual(self.handler.recognizer.view, self.detector);
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(self.handler.recognizer));
  self.handler.manualActivation = NO;
}

- (void)testRejectsAnActiveScrollPanOrTrackedTouches
{
  RNGHTestScrollView *scrollView = [RNGHTestScrollView new];
  RNGHTestPanGestureRecognizer *pan = [RNGHTestPanGestureRecognizer new];
  scrollView.testPan = pan;
  [scrollView addGestureRecognizer:pan];
  [self.detector addSubview:scrollView];
  RNGHExternalScrollSetViewOwner(self.detector, scrollView);
  for (NSNumber *state in @[ @(UIGestureRecognizerStateBegan), @(UIGestureRecognizerStateChanged) ]) {
    pan.testState = (UIGestureRecognizerState)state.integerValue;
    XCTAssertFalse(RNGHExternalScrollAttach(scrollView, self.handler, self.host));
  }
  pan.testState = UIGestureRecognizerStatePossible;
  pan.testTouchCount = 1;
  XCTAssertFalse(RNGHExternalScrollAttach(scrollView, self.handler, self.host));
  XCTAssertEqual(pan.view, scrollView);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(pan));
  RNGHExternalScrollSetViewOwner(self.detector, self.scrollView);
}

- (void)testRejectsAnActiveNativeHandlerOrTrackedTouches
{
  RNGHTestNativeViewGestureHandler *handler = [[RNGHTestNativeViewGestureHandler alloc] initWithTag:@4];
  [handler bindToView:self.detector];
  RNGHTestDummyGestureRecognizer *dummy = (RNGHTestDummyGestureRecognizer *)handler.recognizer;
  for (NSNumber *state in @[ @(UIGestureRecognizerStateBegan), @(UIGestureRecognizerStateChanged) ]) {
    dummy.testState = (UIGestureRecognizerState)state.integerValue;
    XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, handler, self.host));
  }
  dummy.testState = UIGestureRecognizerStatePossible;
  dummy.testTouchCount = 1;
  XCTAssertFalse(RNGHExternalScrollAttach(self.scrollView, handler, self.host));
  XCTAssertEqual(dummy.view, self.detector);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(dummy));
  dummy.testTouchCount = 0;
  [handler unbindFromView];
}

- (void)testUnbindingRestoresTheScrollPanBeforeRemovingTheHandler
{
  UIGestureRecognizer *dummy = self.handler.recognizer;
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  [self.handler unbindFromView];
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
  XCTAssertNil(dummy.view);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(dummy));
  XCTAssertFalse(RNGHExternalScrollIsRegistered(self.scrollView.panGestureRecognizer));
}

- (void)testExternalHandlerLookupDoesNotAdoptUnrelatedHostRecognizers
{
  UITapGestureRecognizer *unrelated = [UITapGestureRecognizer new];
  [self.host addGestureRecognizer:unrelated];
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertEqual([RNGestureHandler findGestureHandlerByRecognizer:self.scrollView.panGestureRecognizer], self.handler);
  XCTAssertNil([RNGestureHandler findGestureHandlerByRecognizer:unrelated]);
  XCTAssertNil(RNGHExternalScrollOwner(unrelated));
  XCTAssertNil(RNGHExternalScrollOriginalView(unrelated));
  XCTAssertFalse(RNGHExternalScrollIsRegistered(unrelated));
}

- (void)testAttachedDummyAndItsPanRemainCompatibleWithoutAMappingOnTheHost
{
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertTrue([self.handler gestureRecognizer:self.handler.recognizer
      shouldRecognizeSimultaneouslyWithGestureRecognizer:self.scrollView.panGestureRecognizer]);

  UIScrollView *unrelatedScrollView = [UIScrollView new];
  [self.host addSubview:unrelatedScrollView];
  XCTAssertFalse([self.handler gestureRecognizer:self.handler.recognizer
      shouldRecognizeSimultaneouslyWithGestureRecognizer:unrelatedScrollView.panGestureRecognizer]);
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
}

- (void)testAttachedDummyReadsItsOriginalScrollPanStateWithoutAMappingOnTheHost
{
  RNGHTestScrollView *scrollView = [RNGHTestScrollView new];
  RNGHTestPanGestureRecognizer *pan = [RNGHTestPanGestureRecognizer new];
  scrollView.testPan = pan;
  [scrollView addGestureRecognizer:pan];
  [self.detector addSubview:scrollView];
  RNGHExternalScrollSetViewOwner(self.detector, scrollView);
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
  XCTAssertTrue(RNGHExternalScrollAttach(scrollView, self.handler, self.host));
  RNDummyGestureRecognizer *dummy = (RNDummyGestureRecognizer *)self.handler.recognizer;
  NSSet<UITouch *> *touches = [NSSet setWithObject:TestTouch(scrollView)];
  [dummy touchesBegan:touches withEvent:TestEvent(touches)];

  // Changing this test pan's reported state does not send target-actions. The
  // production dummy method must resolve the registered owner and read it.
  pan.testState = UIGestureRecognizerStateBegan;
  [dummy updateStateIfScrollView];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateBegan);
  pan.testState = UIGestureRecognizerStateChanged;
  [dummy updateStateIfScrollView];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateChanged);

  pan.testState = UIGestureRecognizerStatePossible;
  RNGHExternalScrollRestore(scrollView, YES);
  RNGHExternalScrollSetViewOwner(self.detector, self.scrollView);
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
}

- (void)testExternalDummyStaysActiveUntilTheLastOfTwoPointersEndsWithoutPointerData
{
  RNGHTestPanGestureRecognizer *pan = [self installTestPanWithLifecycleRecorder];
  RNGHLifecycleDummyGestureRecognizer *dummy = (RNGHLifecycleDummyGestureRecognizer *)self.handler.recognizer;
  UITouch *first = TestTouch(self.host);
  UITouch *second = TestTouch(self.scrollView);
  NSSet<UITouch *> *both = [NSSet setWithObjects:first, second, nil];
  [dummy touchesBegan:[NSSet setWithObject:first] withEvent:TestEvent([NSSet setWithObject:first])];
  [dummy touchesBegan:[NSSet setWithObject:second] withEvent:TestEvent(both)];
  pan.testState = UIGestureRecognizerStateBegan;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateBegan);
  XCTAssertFalse(self.handler.needsPointerData);
  XCTAssertEqual(self.handler.pointerTracker.trackedPointersCount, 0);

  [dummy touchesEnded:[NSSet setWithObject:first] withEvent:TestEvent(both)];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateBegan);
  XCTAssertTrue(RNGHExternalScrollHasHeaderTouches(dummy));
  XCTAssertFalse([dummy.reportedStates containsObject:@(UIGestureRecognizerStateEnded)]);
  pan.testState = UIGestureRecognizerStateChanged;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateChanged);

  [dummy touchesEnded:[NSSet setWithObject:second] withEvent:TestEvent([NSSet setWithObject:second])];
  XCTAssertEqualObjects(dummy.reportedStates.lastObject, @(UIGestureRecognizerStateEnded));
  NSUInteger terminalCount = dummy.reportedStates.count;
  pan.testState = UIGestureRecognizerStateEnded;
  [dummy rnghObserveExternalScrollPan:pan];
  pan.testState = UIGestureRecognizerStateChanged;
  [dummy rnghObserveExternalScrollPan:pan];
  [dummy updateStateIfScrollView];
  XCTAssertEqual(dummy.reportedStates.count, terminalCount, @"Late pan callbacks cannot finish twice or reactivate");
}

- (void)testNativePanCancellationFinishesOnceDespiteRemainingPointers
{
  RNGHTestPanGestureRecognizer *pan = [self installTestPanWithLifecycleRecorder];
  RNGHLifecycleDummyGestureRecognizer *dummy = (RNGHLifecycleDummyGestureRecognizer *)self.handler.recognizer;
  NSSet<UITouch *> *touches = [NSSet setWithObjects:TestTouch(self.host), TestTouch(self.scrollView), nil];
  [dummy touchesBegan:touches withEvent:TestEvent(touches)];
  pan.testState = UIGestureRecognizerStateBegan;
  [dummy rnghObserveExternalScrollPan:pan];
  pan.testState = UIGestureRecognizerStateCancelled;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqualObjects(dummy.reportedStates.lastObject, @(UIGestureRecognizerStateCancelled));
  NSUInteger terminalCount = dummy.reportedStates.count;
  [dummy touchesEnded:touches withEvent:TestEvent(touches)];
  pan.testState = UIGestureRecognizerStateChanged;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqual(dummy.reportedStates.count, terminalCount);
}

- (void)testCancelledPointerStreamResetsBeforeTheNextGesture
{
  RNGHTestPanGestureRecognizer *pan = [self installTestPanWithLifecycleRecorder];
  RNGHLifecycleDummyGestureRecognizer *dummy = (RNGHLifecycleDummyGestureRecognizer *)self.handler.recognizer;
  NSSet<UITouch *> *touches = [NSSet setWithObjects:TestTouch(self.host), TestTouch(self.scrollView), nil];
  [dummy touchesBegan:touches withEvent:TestEvent(touches)];
  pan.testState = UIGestureRecognizerStateBegan;
  [dummy rnghObserveExternalScrollPan:pan];
  [dummy touchesCancelled:touches withEvent:TestEvent(touches)];
  XCTAssertEqualObjects(dummy.reportedStates.lastObject, @(UIGestureRecognizerStateCancelled));
  XCTAssertFalse(RNGHExternalScrollHasHeaderTouches(dummy));
  NSUInteger terminalCount = dummy.reportedStates.count;
  pan.testState = UIGestureRecognizerStateChanged;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqual(dummy.reportedStates.count, terminalCount);

  NSSet<UITouch *> *next = [NSSet setWithObject:TestTouch(self.scrollView)];
  pan.testState = UIGestureRecognizerStatePossible;
  [dummy touchesBegan:next withEvent:TestEvent(next)];
  pan.testState = UIGestureRecognizerStateBegan;
  [dummy rnghObserveExternalScrollPan:pan];
  XCTAssertEqual(dummy.state, UIGestureRecognizerStateBegan);
  [dummy touchesEnded:next withEvent:TestEvent(next)];
  XCTAssertEqualObjects(dummy.reportedStates.lastObject, @(UIGestureRecognizerStateEnded));
}

- (void)testLastPointerFailsWhenTheExternalPanNeverActivated
{
  [self installTestPanWithLifecycleRecorder];
  RNGHLifecycleDummyGestureRecognizer *dummy = (RNGHLifecycleDummyGestureRecognizer *)self.handler.recognizer;
  NSSet<UITouch *> *touches = [NSSet setWithObject:TestTouch(self.scrollView)];
  [dummy touchesBegan:touches withEvent:TestEvent(touches)];
  [dummy touchesEnded:touches withEvent:TestEvent(touches)];
  XCTAssertEqualObjects(dummy.reportedStates.lastObject, @(UIGestureRecognizerStateFailed));
}

- (void)testAttachedHandlerUpdatesItsOriginalScrollConfigurationWithoutAMappingOnTheHost
{
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  XCTAssertTrue(self.scrollView.delaysContentTouches);
  [self.handler updateConfig:@{@"delaysChildPressedState" : @NO}];
  XCTAssertFalse(self.scrollView.delaysContentTouches);
  [self.handler updateConfig:@{@"delaysChildPressedState" : @YES}];
  XCTAssertTrue(self.scrollView.delaysContentTouches);
  XCTAssertNil(RNGHExternalScrollViewOwner(self.host));
}

- (void)testHeaderTouchClassificationIsSharedAndResets
{
  UIView *content = [UIView new];
  [self.scrollView addSubview:content];
  UIView *header = [UIView new];
  [self.host addSubview:header];
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  RNGHExternalScrollRecordHitView(self.scrollView.panGestureRecognizer, content);
  XCTAssertFalse(RNGHExternalScrollHasHeaderTouches(self.handler.recognizer));
  RNGHExternalScrollRecordHitView(self.scrollView.panGestureRecognizer, header);
  XCTAssertTrue(RNGHExternalScrollHasHeaderTouches(self.handler.recognizer));
  RNGHExternalScrollRecordHitView(self.handler.recognizer, content);
  XCTAssertTrue(RNGHExternalScrollHasHeaderTouches(self.scrollView.panGestureRecognizer));
  RNGHExternalScrollResetTouches(self.handler.recognizer);
  XCTAssertFalse(RNGHExternalScrollHasHeaderTouches(self.scrollView.panGestureRecognizer));
}

- (void)testViewOwnerAndAuxiliaryHandlerAssociationsAreWeakAndCanBeCleared
{
  UIView *view = [UIView new];
  UIGestureRecognizer *gate = [UIGestureRecognizer new];
  __weak UIScrollView *weakOwner;
  __weak RNGestureHandler *weakHandler;
  @autoreleasepool {
    UIScrollView *owner = [UIScrollView new];
    RNNativeViewGestureHandler *handler = [[RNNativeViewGestureHandler alloc] initWithTag:@5];
    weakOwner = owner;
    weakHandler = handler;
    RNGHExternalScrollSetViewOwner(view, owner);
    RNGHExternalScrollSetAuxiliaryHandler(gate, handler);
    XCTAssertEqual(RNGHExternalScrollViewOwner(view), owner);
    XCTAssertEqual(RNGHExternalScrollHandler(gate), handler);
    XCTAssertFalse(RNGHExternalScrollIsRegistered(gate));
  }
  XCTAssertNil(weakOwner);
  XCTAssertNil(weakHandler);
  XCTAssertNil(RNGHExternalScrollViewOwner(view));
  XCTAssertNil(RNGHExternalScrollHandler(gate));
  RNGHExternalScrollSetViewOwner(view, self.scrollView);
  RNGHExternalScrollSetAuxiliaryHandler(gate, self.handler);
  RNGHExternalScrollSetViewOwner(view, nil);
  RNGHExternalScrollSetAuxiliaryHandler(gate, nil);
  XCTAssertNil(RNGHExternalScrollViewOwner(view));
  XCTAssertNil(RNGHExternalScrollHandler(gate));
}

- (void)testRestoreClearsBothRecognizersAfterTheHandlerIsDeallocated
{
  UIGestureRecognizer *dummy = self.handler.recognizer;
  __weak RNGestureHandler *weakHandler = self.handler;
  XCTAssertTrue(RNGHExternalScrollAttach(self.scrollView, self.handler, self.host));
  self.handler = nil;
  XCTAssertNil(weakHandler, @"Registration must not extend the handler lifetime");
  XCTAssertNil(RNGHExternalScrollHandler(self.scrollView.panGestureRecognizer));
  RNGHExternalScrollRestore(self.scrollView, YES);
  XCTAssertEqual(self.scrollView.panGestureRecognizer.view, self.scrollView);
  XCTAssertEqual(dummy.view, self.detector);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(dummy));
  XCTAssertFalse(RNGHExternalScrollIsRegistered(self.scrollView.panGestureRecognizer));
}

- (void)testRestoreRemovesTheDummyWhenItsOriginalViewHasBeenDeallocated
{
  UIScrollView *scrollView = [UIScrollView new];
  RNNativeViewGestureHandler *handler = [[RNNativeViewGestureHandler alloc] initWithTag:@6];
  __weak UIView *weakDetector;
  @autoreleasepool {
    UIView *detector = [UIView new];
    weakDetector = detector;
    [self.host addSubview:detector];
    [detector addSubview:scrollView];
    RNGHExternalScrollSetViewOwner(detector, scrollView);
    [handler bindToView:detector];
    XCTAssertTrue(RNGHExternalScrollAttach(scrollView, handler, self.host));
    [self.host addSubview:scrollView];
    [detector removeFromSuperview];
  }
  XCTAssertNil(weakDetector, @"Registration must not retain the original detector view");
  XCTAssertNil(RNGHExternalScrollOriginalView(handler.recognizer));
  RNGHExternalScrollRestore(scrollView, YES);
  XCTAssertEqual(scrollView.panGestureRecognizer.view, scrollView);
  XCTAssertNil(handler.recognizer.view);
  XCTAssertFalse(RNGHExternalScrollIsRegistered(handler.recognizer));
  [handler unbindFromView];
}

@end
