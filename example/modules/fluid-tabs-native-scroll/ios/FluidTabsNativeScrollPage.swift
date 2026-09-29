import ExpoModulesCore

final class FluidTabsNativeScrollPage: ExpoView {
  var pageIndex = 0
  private weak var registeredHost: FluidTabsNativeScrollHost?

  func updateRegistration() {
    var ancestor = superview
    var nextHost: FluidTabsNativeScrollHost?
    while let view = ancestor {
      if let host = view as? FluidTabsNativeScrollHost {
        nextHost = host
        break
      }
      ancestor = view.superview
    }
    if registeredHost !== nextHost {
      registeredHost?.coordinator.unregisterPage(self)
      registeredHost = nextHost
    }
    guard let host = nextHost, window != nil else { return }
    host.coordinator.registerPage(self, index: pageIndex)
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    updateRegistration()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      registeredHost?.coordinator.unregisterPage(self)
      registeredHost = nil
    } else {
      updateRegistration()
    }
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    super.mountChildComponentView(childComponentView, index: index)
    updateRegistration()
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    registeredHost?.coordinator.unregisterPage(self)
    super.unmountChildComponentView(childComponentView, index: index)
    updateRegistration()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    updateRegistration()
  }
}
