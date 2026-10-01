import ExpoModulesCore

final class FluidTabsNativeScrollHost: ExpoView {
  var activePageIndex = 0
  var paging = false
  var headerScrollEnabled = true
  private(set) lazy var coordinator = FTNSScrollCoordinator(host: self)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Establish the observer before any touches or child registrations arrive.
    _ = coordinator
  }

  func applyConfiguration() {
    coordinator.update(activePageIndex: activePageIndex, paging: paging, enabled: headerScrollEnabled)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    coordinator.setAttached(window != nil)
    applyConfiguration()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    coordinator.reconcile()
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    if let hit, let event {
      coordinator.recordHitView(hit, event: event)
    }
    return hit
  }
}
