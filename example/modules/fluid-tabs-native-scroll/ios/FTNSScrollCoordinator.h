#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
// This Objective-C boundary keeps React's C++ component headers out of Swift.
@interface FTNSScrollCoordinator : NSObject
- (instancetype)initWithHost:(UIView *)host NS_SWIFT_NAME(init(host:));
- (void)updateActivePageIndex:(NSInteger)index
                       paging:(BOOL)paging
                      enabled:(BOOL)enabled NS_SWIFT_NAME(update(activePageIndex:paging:enabled:));
- (void)setAttached:(BOOL)attached NS_SWIFT_NAME(setAttached(_:));
- (void)registerPage:(UIView *)page index:(NSInteger)index NS_SWIFT_NAME(registerPage(_:index:));
- (void)unregisterPage:(UIView *)page NS_SWIFT_NAME(unregisterPage(_:));
- (void)reconcile;
- (void)recordHitView:(UIView *)view event:(UIEvent *)event NS_SWIFT_NAME(recordHitView(_:event:));
@end
NS_ASSUME_NONNULL_END
