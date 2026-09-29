#import <UIKit/UIKit.h>

// Blocks only the externally hosted list recognizers, and only when the
// coordinator lets this pan receive a header touch during horizontal settling.
@interface FTNSHeaderPagingGate : UIPanGestureRecognizer
@property(nonatomic, weak) UIGestureRecognizer *blockedPan;
@property(nonatomic, weak) UIGestureRecognizer *blockedHandler;
@end
