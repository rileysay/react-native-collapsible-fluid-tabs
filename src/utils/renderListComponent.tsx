import React from 'react';

/** Render list slots without mistaking memo/forwardRef component types for elements. */
export function renderListComponent(component: unknown): React.ReactNode {
  if (component == null) return null;
  if (React.isValidElement(component)) return component;
  return React.createElement(component as React.ComponentType);
}
