import React from 'react';

import { renderListComponent } from '../renderListComponent';

function Header() {
  return null;
}

describe('renderListComponent', () => {
  it('turns memo and forwardRef component types into valid elements', () => {
    const memoHeader = React.memo(Header);
    const forwardedHeader = React.forwardRef(() => null);

    for (const component of [Header, memoHeader, forwardedHeader]) {
      const element = renderListComponent(component);
      expect(React.isValidElement(element)).toBe(true);
      expect((element as React.ReactElement).type).toBe(component);
    }
  });

  it('preserves provided elements and their props', () => {
    const element = <Header key="header" />;
    expect(renderListComponent(element)).toBe(element);
  });

  it('leaves empty header and footer slots empty', () => {
    expect(renderListComponent(undefined)).toBeNull();
    expect(renderListComponent(null)).toBeNull();
  });
});
