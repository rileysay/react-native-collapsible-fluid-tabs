#import "FTNSPointerObserver.h"
#import <UIKit/UIGestureRecognizerSubclass.h>

@implementation FTNSPointerObserver {
  NSMutableSet<UITouch *> *_tracked;
}
- (instancetype)initWithTarget:(id)target action:(SEL)action
{
  if ((self = [super initWithTarget:target action:action])) {
    _tracked = [NSMutableSet new];
    self.cancelsTouchesInView = NO;
    self.delaysTouchesBegan = NO;
    self.delaysTouchesEnded = NO;
  }
  return self;
}
- (NSUInteger)pointerCount { return _tracked.count; }
- (BOOL)canPreventGestureRecognizer:(UIGestureRecognizer *)other { return NO; }
- (BOOL)canBePreventedByGestureRecognizer:(UIGestureRecognizer *)other { return NO; }
- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
  [_tracked unionSet:touches];
  if (self.streamChanged) self.streamChanged(touches, _tracked.count);
}
- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {}
- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
  [_tracked minusSet:touches];
  if (self.streamChanged) self.streamChanged([NSSet set], _tracked.count);
  if (_tracked.count == 0) self.state = UIGestureRecognizerStateFailed;
}
- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
  [self touchesEnded:touches withEvent:event];
}
- (void)reset
{
  [super reset];
  [_tracked removeAllObjects];
  if (self.streamChanged) self.streamChanged([NSSet set], 0);
}
@end
