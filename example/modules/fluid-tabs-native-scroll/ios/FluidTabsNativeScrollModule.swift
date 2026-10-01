import ExpoModulesCore

public final class FluidTabsNativeScrollModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FluidTabsNativeScroll")
    Constant("isSupported") { true }
    Constant("capabilityVersion") { 1 }

    View(FluidTabsNativeScrollHost.self) {
      ViewName("FluidTabsNativeScrollHost")
      Prop("activePageIndex", 0) { (view, index: Int) in
        view.activePageIndex = max(0, index)
      }
      Prop("paging", false) { (view, paging: Bool) in
        view.paging = paging
      }
      Prop("headerScrollEnabled", true) { (view, enabled: Bool) in
        view.headerScrollEnabled = enabled
      }
      // Expo applies a dictionary of animated props in unspecified key order.
      // Reconcile once after the complete UI-thread transaction, not per setter.
      OnViewDidUpdateProps { (view: FluidTabsNativeScrollHost) in
        view.applyConfiguration()
      }
    }

    View(FluidTabsNativeScrollPage.self) {
      ViewName("FluidTabsNativeScrollPage")
      Prop("pageIndex", 0) { (view, index: Int) in
        view.pageIndex = max(0, index)
      }
      OnViewDidUpdateProps { (view: FluidTabsNativeScrollPage) in
        view.updateRegistration()
      }
    }
  }
}
