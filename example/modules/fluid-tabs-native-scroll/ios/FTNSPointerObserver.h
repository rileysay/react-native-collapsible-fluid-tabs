#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
// A passive observer: never wins/prevents a gesture, and tracks every pointer,
// including the Possible phase before UIKit or the pager has recognized a drag.
@interface FTNSPointerObserver : UIGestureRecognizer
@property(nonatomic, copy, nullable) void (^streamChanged)(NSSet<UITouch *> *newTouches, NSUInteger pointerCount);
@property(nonatomic, readonly) NSUInteger pointerCount;
@end
NS_ASSUME_NONNULL_END
