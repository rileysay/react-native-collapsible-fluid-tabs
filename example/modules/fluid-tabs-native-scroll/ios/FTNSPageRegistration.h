#import <UIKit/UIKit.h>

@interface FTNSPageRegistration : NSObject
@property(nonatomic, weak) UIView *page;
@property(nonatomic, weak) UIScrollView *scrollView;
@property(nonatomic) NSInteger index;
@property(nonatomic, strong) NSHashTable<UIView *> *ownerViews;
@end
