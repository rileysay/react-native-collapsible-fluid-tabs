import { Fragment, createElement } from 'react';

import { Tab } from '../../components/Tab';
import { extractTabs } from '../children';

describe('extractTabs', () => {
  it('keeps tab order and content through fragments, arrays, and conditional children', () => {
    const tabs = extractTabs([
      null,
      false,
      createElement(Tab, { name: 'first', children: 'First content' }),
      createElement(
        Fragment,
        null,
        createElement(Tab, {
          name: 'second',
          label: 'Second',
          children: 'Second content',
        }),
        createElement(
          Fragment,
          null,
          createElement(Tab, { name: 'third', children: 'Third content' })
        )
      ),
    ]);

    expect(tabs.map((tab) => tab.key)).toEqual(['first', 'second', 'third']);
    expect(tabs[1]).toMatchObject({
      config: { label: 'Second' },
      children: 'Second content',
    });
  });

  it('rejects duplicate names even across fragments', () => {
    expect(() =>
      extractTabs([
        createElement(Tab, { name: 'posts', children: null }),
        createElement(
          Fragment,
          null,
          createElement(Tab, { name: 'posts', children: null })
        ),
      ])
    ).toThrow('Tab names must be unique');
  });

  it('rejects children that contain no tabs', () => {
    expect(() => extractTabs(createElement(Fragment, null, 'No tabs'))).toThrow(
      'requires at least one'
    );
  });
});
