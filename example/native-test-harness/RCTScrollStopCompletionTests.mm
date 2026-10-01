#import <XCTest/XCTest.h>

#import <React/RCTScrollViewComponentView.h>
#import <React/RCTEnhancedScrollView.h>

#include <algorithm>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <react/renderer/components/scrollview/ScrollViewEventEmitter.h>
#include <react/renderer/core/EventBeat.h>
#include <react/renderer/core/EventDispatcher.h>
#include <react/renderer/core/EventListener.h>
#include <react/renderer/core/EventQueueProcessor.h>
#include <react/renderer/runtimescheduler/RuntimeScheduler.h>

using namespace facebook::react;

// Declare existing public protocol callbacks for static type checking. No
// private Fabric helper or ivar is called/read by these tests.
@interface RCTScrollViewComponentView (RCTScrollStopCompletionTests)
    <UIScrollViewDelegate, RCTEnhancedScrollViewOverridingDelegate>
@end

namespace {
struct CapturedEvent {
  std::string type;
  std::optional<double> offsetY;
};

class CountingEventBeat final : public EventBeat {
 public:
  CountingEventBeat(std::shared_ptr<OwnerBox> owner, RuntimeScheduler &scheduler, size_t &requests)
      : EventBeat(std::move(owner), scheduler), requests_(requests) {}
  void request() const override { requests_ += 1; }
  void requestSynchronous() const override { requests_ += 1; }
 private:
  size_t &requests_;
};

// Intercept actual RawEvents from the real ScrollViewEventEmitter. Returning
// true stops delivery before the JS queue. No JSI runtime or fake emitter
// subclass is used (ScrollViewEventEmitter's event methods are nonvirtual).
struct EventCapture {
  std::vector<CapturedEvent> events;
  size_t unexpectedBeatRequests = 0;
  size_t unexpectedRuntimeRequests = 0;
  RuntimeScheduler scheduler;
  std::shared_ptr<EventDispatcher> dispatcher;
  std::shared_ptr<const EventListener> listener;
  std::shared_ptr<ScrollViewEventEmitter> emitter;

  EventCapture() : scheduler([this](auto &&) { unexpectedRuntimeRequests += 1; })
  {
    auto owner = std::make_shared<EventBeat::OwnerBox>();
    EventQueueProcessor processor(EventPipe{}, EventPipeConclusion{}, StatePipe{}, {});
    auto beat = std::make_unique<CountingEventBeat>(owner, scheduler, unexpectedBeatRequests);
    dispatcher = std::make_shared<EventDispatcher>(processor, std::move(beat), StatePipe{}, std::weak_ptr<EventLogger>{});
    owner->owner = dispatcher;
    listener = std::make_shared<const EventListener>([this](const RawEvent &event) {
      events.push_back({event.type, event.eventPayload->extractValue({"contentOffset", "y"})});
      return true;
    });
    dispatcher->addListener(listener);
    replaceEmitter();
  }

  void replaceEmitter() { emitter = std::make_shared<ScrollViewEventEmitter>(nullptr, dispatcher); }

  size_t count(const char *type) const
  {
    return std::count_if(events.begin(), events.end(), [type](const CapturedEvent &event) { return event.type == type; });
  }
};
} // namespace

// Only the public state getter is controlled. This subclass does not override
// stopScrollingAndZooming; tests of the real stop API below exercise Enhanced.
@interface RCTCompletionStateScrollView : RCTEnhancedScrollView
@property(nonatomic) BOOL testDecelerating;
@end
@implementation RCTCompletionStateScrollView
- (BOOL)isDecelerating { return self.testDecelerating; }
@end

@interface RCTCompletionDelegate : NSObject <RCTEnhancedScrollViewOverridingDelegate>
@property(nonatomic) NSUInteger stopCount;
@end
@implementation RCTCompletionDelegate
- (BOOL)touchesShouldCancelInContentView:(UIView *)view { return YES; }
- (void)scrollViewDidStopScrollingAndZooming:(UIScrollView *)scrollView { self.stopCount += 1; }
@end

@interface RCTCompletionLegacyDelegate : NSObject <RCTEnhancedScrollViewOverridingDelegate>
@end
@implementation RCTCompletionLegacyDelegate
- (BOOL)touchesShouldCancelInContentView:(UIView *)view { return YES; }
@end

@interface RCTScrollStopCompletionTests : XCTestCase
@property(nonatomic, strong) RCTScrollViewComponentView *component;
@property(nonatomic, strong) RCTCompletionStateScrollView *scroll;
@end

@implementation RCTScrollStopCompletionTests {
  std::unique_ptr<EventCapture> _capture;
}

- (void)setUp
{
  [super setUp];
  XCTAssertTrue(NSThread.isMainThread);
  _capture = std::make_unique<EventCapture>();
  self.component = [[RCTScrollViewComponentView alloc] initWithFrame:CGRectMake(0, 0, 390, 600)];
  self.scroll = [[RCTCompletionStateScrollView alloc] initWithFrame:self.component.bounds];
  self.scroll.contentSize = CGSizeMake(390, 2400);
  self.scroll.contentOffset = CGPointMake(0, 500);

  // Replace only the public readwrite scrollView property and view hierarchy.
  // Preserve the component's real content container, overriding delegate and
  // splitter subscription; do not modify UIKit or Fabric private storage.
  [self.component.scrollView removeFromSuperview];
  self.component.scrollView = self.scroll;
  [self.component addSubview:self.scroll];
  [self.scroll addSubview:self.component.containerView];
  self.scroll.overridingDelegate = self.component;
  [self.component.scrollViewDelegateSplitter addDelegate:self.component];
  [self.component updateEventEmitter:_capture->emitter];
}

- (void)tearDown
{
  self.scroll.overridingDelegate = nil;
  [self.component.scrollViewDelegateSplitter removeDelegate:self.component];
  self.component = nil;
  self.scroll = nil;
  XCTAssertEqual(_capture->unexpectedBeatRequests, 0u);
  XCTAssertEqual(_capture->unexpectedRuntimeRequests, 0u);
  _capture.reset();
  [super tearDown];
}

- (void)beginCoast
{
  self.scroll.testDecelerating = YES;
  [self.component scrollViewWillBeginDragging:self.scroll];
  [self.component scrollViewWillBeginDecelerating:self.scroll];
}

- (void)notifyExplicitStop
{
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidStopScrollingAndZooming:self.scroll];
}

- (void)assertBegins:(NSUInteger)begins ends:(NSUInteger)ends
{
  XCTAssertEqual(_capture->count("topMomentumScrollBegin"), begins);
  XCTAssertEqual(_capture->count("topMomentumScrollEnd"), ends);
}

- (void)testExplicitStopCompletesCoastAndLateUIKitEndIsDeduplicated
{
  [self beginCoast];
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:1];
  const auto found = std::find_if(_capture->events.begin(), _capture->events.end(), [](const auto &event) {
    return event.type == "topMomentumScrollEnd";
  });
  XCTAssertTrue(found != _capture->events.end());
  if (found != _capture->events.end()) {
    XCTAssertTrue(found->offsetY.has_value());
    if (found->offsetY) XCTAssertEqualWithAccuracy(*found->offsetY, 500, 0.001);
  }
}

- (void)testNaturalCompletionBeforeExplicitNotificationEmitsOnlyOneEnd
{
  [self beginCoast];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self notifyExplicitStop];
  [self assertBegins:1 ends:1];
}

- (void)testRepeatedExplicitAndNaturalCompletionDoNotEmitExtraEnds
{
  [self beginCoast];
  [self notifyExplicitStop];
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:1];
}

- (void)testIdleCompletionNotificationsDoNotInventAMomentumEnd
{
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:0 ends:0];
}

- (void)testCompletionWhileNativeStillDeceleratingDoesNotConsumeCurrentCoast
{
  [self beginCoast];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self.component scrollViewDidStopScrollingAndZooming:self.scroll];
  [self assertBegins:1 ends:0];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:1];
}

- (void)testOrdinaryNaturalMomentumCyclesRemainIndependent
{
  for (NSUInteger cycle = 1; cycle <= 2; cycle++) {
    [self beginCoast];
    self.scroll.testDecelerating = NO;
    [self.component scrollViewDidEndDecelerating:self.scroll];
    [self assertBegins:cycle ends:cycle];
  }
}

- (void)testNewCoastAfterExplicitStopStillCompletesNaturally
{
  [self beginCoast];
  [self notifyExplicitStop];
  [self beginCoast];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:2 ends:2];
}

- (void)testRecycleDoesNotDeliverOldCompletionToReplacementEmitter
{
  [self beginCoast];
  [self.component prepareForRecycle];
  _capture->events.clear();
  _capture->replaceEmitter();
  [self.component updateEventEmitter:_capture->emitter];
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:0 ends:0];
  [self beginCoast];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:1];
}

- (void)testEmitterlessCompletionIsConsumedBeforeAnEmitterIsInstalled
{
  // Public recycle clears the emitter. Passing nullptr to updateEventEmitter
  // is invalid in this RN revision and intentionally not used.
  [self.component prepareForRecycle];
  [self beginCoast];
  [self notifyExplicitStop];
  _capture->events.clear();
  _capture->replaceEmitter();
  [self.component updateEventEmitter:_capture->emitter];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:0 ends:0];
}

- (void)testEmitterlessBeginCanBeCompletedAfterAnEmitterIsInstalled
{
  [self.component prepareForRecycle];
  [self beginCoast];
  _capture->events.clear();
  _capture->replaceEmitter();
  [self.component updateEventEmitter:_capture->emitter];
  [self notifyExplicitStop];
  [self assertBegins:0 ends:1];
}

- (void)testProgrammaticNonanimatedScrollKeepsItsExistingEndEvent
{
  [self.component scrollToOffset:CGPointMake(0, 700) animated:NO];
  [self assertBegins:0 ends:1];
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:0 ends:1];
}

- (void)testProgrammaticAnimationCompletionKeepsItsExistingEndEvent
{
  // Direct public delegate delivery tests RN's callback contract, not UIKit's
  // timing of an actual animated command.
  [self.component scrollViewDidEndScrollingAnimation:self.scroll];
  [self assertBegins:0 ends:1];
  [self notifyExplicitStop];
  [self assertBegins:0 ends:1];
}

- (void)testProgrammaticFinishConsumesAnOutstandingUserMomentumCycle
{
  [self beginCoast];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndScrollingAnimation:self.scroll];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self notifyExplicitStop];
  [self assertBegins:1 ends:1];
}

- (void)testProgrammaticFinishWhileCoastingDoesNotConsumeLaterNaturalCompletion
{
  [self beginCoast];
  // Preserve the existing programmatic-end event even if a separate native
  // deceleration is still active; that coast still needs its later completion.
  [self.component scrollViewDidEndScrollingAnimation:self.scroll];
  [self assertBegins:1 ends:1];
  self.scroll.testDecelerating = NO;
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:2];
}

- (void)testWindowRemovalKeepsItsExistingEndAndConsumesOutstandingCoast
{
  [self beginCoast];
  // The component has no window: this public UIView callback takes the real
  // teardown path. No private _handleScrollEndIfNeeded invocation is used.
  [self.component didMoveToWindow];
  [self assertBegins:1 ends:1];
  [self notifyExplicitStop];
  [self.component scrollViewDidEndDecelerating:self.scroll];
  [self assertBegins:1 ends:1];
}

- (void)testEnhancedIdleStopDoesNotNotifyOverridingDelegate
{
  if (@available(iOS 17.4, *)) {
    RCTCompletionDelegate *delegate = [RCTCompletionDelegate new];
    self.scroll.overridingDelegate = delegate;
    self.scroll.testDecelerating = NO;
    [self.scroll stopScrollingAndZooming];
    XCTAssertEqual(delegate.stopCount, 0u);
  } else {
    XCTSkip(@"The public explicit stop API requires iOS 17.4.");
  }
}

- (void)testEnhancedDoesNotNotifyWhenPublicStateStillReportsDecelerating
{
  if (@available(iOS 17.4, *)) {
    RCTCompletionDelegate *delegate = [RCTCompletionDelegate new];
    self.scroll.overridingDelegate = delegate;
    self.scroll.testDecelerating = YES;
    [self.scroll stopScrollingAndZooming];
    XCTAssertEqual(delegate.stopCount, 0u);
  } else {
    XCTSkip(@"The public explicit stop API requires iOS 17.4.");
  }
}

- (void)testEnhancedOptionalCallbackIsNotRequiredOfExistingDelegates
{
  if (@available(iOS 17.4, *)) {
    RCTCompletionLegacyDelegate *delegate = [RCTCompletionLegacyDelegate new];
    self.scroll.overridingDelegate = delegate;
    XCTAssertFalse([delegate respondsToSelector:@selector(scrollViewDidStopScrollingAndZooming:)]);
    XCTAssertNoThrow([self.scroll stopScrollingAndZooming]);
  } else {
    XCTSkip(@"The public explicit stop API requires iOS 17.4.");
  }
}

@end
