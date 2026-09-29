#import "FTNSScrollCoordinator.h"
#import "FTNSHeaderPagingGate.h"
#import "FTNSPageRegistration.h"
#import "FTNSPointerObserver.h"
#import <React/RCTScrollViewComponentView.h>
#import <RNGestureHandler/RNGHExternalScroll.h>
#import <RNGestureHandler/RNGestureHandler.h>
#import <RNGestureHandler/RNNativeViewHandler.h>
#import <math.h>

// The Page is an explicit registration boundary around a scroll renderer.
// Stop at the first scroll component on each branch, excluding nested carousels.
static void CollectOuterScrollViews(UIView *view, NSMutableSet<UIScrollView *> *result)
{
  if ([view isKindOfClass:RCTScrollViewComponentView.class]) {
    [result addObject:((RCTScrollViewComponentView *)view).scrollView];
    return;
  }
  if ([view isKindOfClass:UIScrollView.class]) {
    [result addObject:(UIScrollView *)view];
    return;
  }
  for (UIView *child in view.subviews) CollectOuterScrollViews(child, result);
}

static BOOL RecognizerHasActiveDrag(UIGestureRecognizer *recognizer)
{
  return recognizer.state == UIGestureRecognizerStateBegan || recognizer.state == UIGestureRecognizerStateChanged;
}

@interface FTNSScrollCoordinator () <UIGestureRecognizerDelegate>
@end

@implementation FTNSScrollCoordinator {
  __weak UIView *_host;
  NSMutableDictionary<NSNumber *, FTNSPageRegistration *> *_pages;
  FTNSPointerObserver *_pointers;
  FTNSHeaderPagingGate *_pagingGate;
  __weak UIScrollView *_owner;
  __weak RNGestureHandler *_ownerHandler;
  NSInteger _requestedIndex;
  NSInteger _committedIndex;
  BOOL _paging;
  BOOL _attached;
  BOOL _backgrounded;
  BOOL _reconcileScheduled;
  BOOL _reconciling;
}

- (instancetype)initWithHost:(UIView *)host
{
  if ((self = [super init])) {
    _host = host;
    _pages = [NSMutableDictionary new];
    _requestedIndex = 0;
    _committedIndex = NSNotFound;
    _pointers = [[FTNSPointerObserver alloc] initWithTarget:nil action:NULL];
    __weak FTNSScrollCoordinator *weakSelf = self;
    _pointers.streamChanged = ^(NSSet<UITouch *> *newTouches, NSUInteger count) {
      [weakSelf observeTouches:newTouches pointerCount:count];
    };
    [host addGestureRecognizer:_pointers];
    _pagingGate = [[FTNSHeaderPagingGate alloc] initWithTarget:nil action:NULL];
    _pagingGate.delegate = self;
    _pagingGate.cancelsTouchesInView = NO;
    [host addGestureRecognizer:_pagingGate];
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(handlerChanged:) name:RNGHExternalScrollHandlerDidBindNotification object:nil];
    [center addObserver:self selector:@selector(handlerChanged:) name:RNGHExternalScrollHandlerDidUnbindNotification object:nil];
    [center addObserver:self selector:@selector(willResignActive:) name:UIApplicationWillResignActiveNotification object:nil];
    [center addObserver:self selector:@selector(didBecomeActive:) name:UIApplicationDidBecomeActiveNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [NSNotificationCenter.defaultCenter removeObserver:self];
  // Expo component lifetime is UIKit/main-thread-owned. UIKit delegates/targets
  // never reference this coordinator after the registration is restored.
  if (_owner) RNGHExternalScrollRestore(_owner, YES);
  for (FTNSPageRegistration *registration in _pages.allValues) {
    for (UIView *view in registration.ownerViews) RNGHExternalScrollSetViewOwner(view, nil);
  }
  [_host removeGestureRecognizer:_pointers];
  [_host removeGestureRecognizer:_pagingGate];
  if (_host) RNGHExternalScrollSetViewOwner(_host, nil);
}

- (void)updateActivePageIndex:(NSInteger)index paging:(BOOL)paging
{
  NSAssert(NSThread.isMainThread, @"Native scroll props must commit on the main thread");
  _requestedIndex = MAX(0, index);
  _paging = paging;
  [self reconcile];
}

- (void)setAttached:(BOOL)attached
{
  _attached = attached;
  if (!attached) {
    [self restoreOwner:YES];
    _pointers.enabled = NO;
    _pointers.enabled = YES;
    _pagingGate.enabled = NO;
    _pagingGate.enabled = YES;
  }
  else [self reconcile];
}

- (void)registerPage:(UIView *)page index:(NSInteger)index
{
  if (![page isDescendantOfView:_host]) return;
  NSMutableSet<UIScrollView *> *candidates = [NSMutableSet new];
  for (UIView *child in page.subviews) CollectOuterScrollViews(child, candidates);
  if (candidates.count != 1) {
    // Zero occurs during mounting; ambiguous custom renderers must not choose
    // a scrollview by its accidental position in the native child tree.
    if (candidates.count > 1) {
      NSLog(@"[FluidTabsNativeScroll] Page %ld has multiple outer scroll views; registration rejected", (long)index);
    }
    [self unregisterPage:page];
    return;
  }
  UIScrollView *scrollView = candidates.anyObject;
  FTNSPageRegistration *existing = _pages[@(index)];
  if (existing.page == page && existing.scrollView == scrollView) {
    [self reconcile];
    return;
  }
  [self unregisterPage:page];
  if (existing.page && existing.page != page) {
    NSLog(@"[FluidTabsNativeScroll] Duplicate page index %ld rejected", (long)index);
    return;
  }
  FTNSPageRegistration *registration = [FTNSPageRegistration new];
  registration.page = page;
  registration.scrollView = scrollView;
  registration.index = index;
  registration.ownerViews = [NSHashTable weakObjectsHashTable];
  _pages[@(index)] = registration;
  // A custom renderer may insert a decorative View between the native
  // detector and ScrollView. Every node on this unique, explicit Page path
  // identifies the same owner; no sibling or nested scroller is inferred.
  for (UIView *view = scrollView; view; view = view.superview) {
    RNGHExternalScrollSetViewOwner(view, scrollView);
    [registration.ownerViews addObject:view];
    if (view == page) break;
  }
  [self reconcile];
}

- (void)unregisterPage:(UIView *)page
{
  for (NSNumber *key in _pages.allKeys) {
    FTNSPageRegistration *registration = _pages[key];
    if (registration.page == page || !registration.page || !registration.scrollView) {
      if (registration.scrollView == _owner) [self restoreOwner:YES];
      for (UIView *view in registration.ownerViews) RNGHExternalScrollSetViewOwner(view, nil);
      [_pages removeObjectForKey:key];
    }
  }
}

- (RNGestureHandler *)handlerForScrollView:(UIScrollView *)scrollView
{
  // This is the registered scroll's ancestor chain only. Never borrow a
  // sibling/nested list handler, and verify its concrete owner before adoption.
  for (UIView *view = scrollView; view && view != _host; view = view.superview) {
    for (UIGestureRecognizer *recognizer in view.gestureRecognizers) {
      RNGestureHandler *handler = recognizer.gestureHandler;
      if ([handler isKindOfClass:RNNativeViewGestureHandler.class] &&
          [handler retrieveScrollView:recognizer.view] == scrollView) return handler;
    }
  }
  return nil;
}

- (void)reconcile
{
  if (_reconciling || !_attached || _backgrounded || !_host.window) return;
  if (_owner && !RNGHExternalScrollIsRegistered(_owner.panGestureRecognizer)) {
    // RNGH may have unbound/rebound its native handler during a Fabric commit.
    [self restoreOwner:NO];
  }
  if (_paging || _pointers.pointerCount != 0 || RecognizerHasActiveDrag(_owner.panGestureRecognizer) ||
      RecognizerHasActiveDrag(_ownerHandler.recognizer)) return;
  FTNSPageRegistration *next = _pages[@(_requestedIndex)];
  if (!next.scrollView || !next.page.window || ![next.page isDescendantOfView:_host]) return;
  if (next.scrollView == _owner && _committedIndex == _requestedIndex) return;
  RNGestureHandler *handler = [self handlerForScrollView:next.scrollView];
  // Wait for RNGH's binding notification, rather than attach an uncoordinated
  // UIKit pan which could bypass its pager/press cancellation relationships.
  if (!handler || RecognizerHasActiveDrag(handler.recognizer) ||
      RecognizerHasActiveDrag(next.scrollView.panGestureRecognizer)) return;
  _reconciling = YES;
  [self restoreOwner:NO];
  RNGHExternalScrollSetViewOwner(_host, next.scrollView);
  if (RNGHExternalScrollAttach(next.scrollView, handler, _host)) {
    _owner = next.scrollView;
    _ownerHandler = handler;
    _committedIndex = _requestedIndex;
    _pagingGate.blockedPan = _owner.panGestureRecognizer;
    _pagingGate.blockedHandler = handler.recognizer;
    // Deliberately cancel header presses when a settling-period vertical
    // blocker wins, rather than relying on RNGH guessing a sibling's owner.
    RNGHExternalScrollSetAuxiliaryHandler(_pagingGate, handler);
  } else {
    RNGHExternalScrollSetViewOwner(_host, nil);
  }
  _reconciling = NO;
}

- (void)restoreOwner:(BOOL)cancelTouches
{
  if (_owner) RNGHExternalScrollRestore(_owner, cancelTouches);
  _owner = nil;
  _ownerHandler = nil;
  _committedIndex = NSNotFound;
  _pagingGate.blockedPan = nil;
  _pagingGate.blockedHandler = nil;
  RNGHExternalScrollSetAuxiliaryHandler(_pagingGate, nil);
  if (_host) RNGHExternalScrollSetViewOwner(_host, nil);
}

- (void)scheduleReconcileAfterTouchDelivery
{
  if (_reconcileScheduled) return;
  _reconcileScheduled = YES;
  __weak FTNSScrollCoordinator *weakSelf = self;
  // A touch-ended callback can run before UIKit updates the other recognizers.
  // Commit after the current event delivery; this is not a timer/retry loop.
  dispatch_async(dispatch_get_main_queue(), ^{
    FTNSScrollCoordinator *coordinator = weakSelf;
    if (!coordinator) return;
    coordinator->_reconcileScheduled = NO;
    [coordinator reconcile];
  });
}

- (void)observeTouches:(NSSet<UITouch *> *)touches pointerCount:(NSUInteger)count
{
  if (_owner && touches.count) RNGHExternalScrollRecordTouches(_owner.panGestureRecognizer, touches);
  if (count == 0) [self scheduleReconcileAfterTouchDelivery];
}

- (void)recordHitView:(UIView *)view event:(UIEvent *)event
{
  // Hit-testing precedes recognizer delivery, including a native pan that
  // catches deceleration on touch-down. Record the actual hit origin early.
  if (!_owner || event.type != UIEventTypeTouches) return;
  for (UITouch *touch in event.allTouches) {
    if (touch.phase == UITouchPhaseBegan) {
      RNGHExternalScrollRecordHitView(_owner.panGestureRecognizer, view);
      break;
    }
  }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)recognizer shouldReceiveTouch:(UITouch *)touch
{
  if (recognizer != _pagingGate || !_owner) return NO;
  BOOL ownershipPending = _paging || _requestedIndex != _committedIndex;
  return ownershipPending && ![touch.view isDescendantOfView:_owner];
}

- (BOOL)gestureRecognizerShouldBegin:(UIGestureRecognizer *)recognizer
{
  if (recognizer != _pagingGate) return YES;
  CGPoint velocity = [_pagingGate velocityInView:_host];
  return fabs(velocity.y) >= fabs(velocity.x);
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)recognizer
    shouldBeRequiredToFailByGestureRecognizer:(UIGestureRecognizer *)other
{
  // Dynamic delegate relation disappears with this host. A permanent
  // requireGestureRecognizerToFail relation would survive pan restoration.
  return recognizer == _pagingGate && (other == _pagingGate.blockedPan || other == _pagingGate.blockedHandler);
}

- (void)handlerChanged:(NSNotification *)notification
{
  [self scheduleReconcileAfterTouchDelivery];
}

- (void)willResignActive:(NSNotification *)notification
{
  _backgrounded = YES;
  [self restoreOwner:YES];
  _pointers.enabled = NO;
  _pointers.enabled = YES;
  _pagingGate.enabled = NO;
  _pagingGate.enabled = YES;
}

- (void)didBecomeActive:(NSNotification *)notification
{
  _backgrounded = NO;
  [self reconcile];
}
@end
