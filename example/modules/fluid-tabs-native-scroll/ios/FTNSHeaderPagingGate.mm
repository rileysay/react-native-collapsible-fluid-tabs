#import "FTNSHeaderPagingGate.h"
#import <UIKit/UIGestureRecognizerSubclass.h>
@implementation FTNSHeaderPagingGate
- (BOOL)canPreventGestureRecognizer:(UIGestureRecognizer *)other
{
  return other == self.blockedPan || other == self.blockedHandler;
}
@end
