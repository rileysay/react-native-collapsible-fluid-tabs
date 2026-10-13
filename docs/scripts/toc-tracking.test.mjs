import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveSection } from '../lib/toc-tracking.ts';

const fixtures = [
  {
    name: 'Introduction',
    scrollHeight: 1831,
    headings: [763, 1208.609375, 1520.59375],
  },
  {
    name: 'Quick start',
    scrollHeight: 1865,
    headings: [321, 1192.984375, 1352.96875, 1542.953125],
  },
];

function headingsAt(positions) {
  return positions.map((top, index) => ({
    url: `#section-${index + 1}`,
    top,
    scrollMarginTop: 112,
  }));
}

function transitions(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

for (const fixture of fixtures) {
  for (const viewportHeight of [720, 900, 1100]) {
    test(`${fixture.name}: every section remains reachable in both directions at ${viewportHeight}px`, () => {
      const headings = headingsAt(fixture.headings);
      const maxScroll = fixture.scrollHeight - viewportHeight;
      const positions = Array.from({ length: maxScroll + 1 }, (_, index) => index);
      const at = (scrollTop) => getActiveSection(headings, {
        scrollTop,
        viewportHeight,
        scrollHeight: fixture.scrollHeight,
      });
      const down = positions.map(at);
      const up = [...positions].reverse().map(at);
      const expected = headings.map(({ url }) => url);

      assert.deepEqual(transitions(down), expected);
      assert.deepEqual(transitions(up), [...expected].reverse());
      assert.deepEqual(up, [...down].reverse(), 'selection must not depend on scroll direction');

      for (const { url } of headings.slice(1, -1)) {
        assert.ok(
          down.filter((active) => active === url).length >= 20,
          `${url} should stay active for a usable scroll range, not a single bottom-edge pixel`,
        );
      }

      assert.equal(at(maxScroll - 3), headings.at(-2).url,
        'immediately before the end, the preceding section must still be reachable');
      assert.equal(at(maxScroll), headings.at(-1).url);
    });
  }
}

test('a page shorter than one additional viewport still exposes its middle section', () => {
  const headings = headingsAt([400, 700, 900]);
  const viewport = { viewportHeight: 720, scrollHeight: 1020 };

  assert.equal(getActiveSection(headings, { ...viewport, scrollTop: 0 }), '#section-1');
  assert.equal(getActiveSection(headings, { ...viewport, scrollTop: 230 }), '#section-2');
  assert.equal(getActiveSection(headings, { ...viewport, scrollTop: 300 }), '#section-3');
});

test('an unscrollable page does not force selection to its final heading', () => {
  const headings = headingsAt([80, 300, 500]);

  assert.equal(getActiveSection(headings, {
    scrollTop: 0,
    viewportHeight: 720,
    scrollHeight: 650,
  }), '#section-1');
});

test('ordinary sections on a long page activate as they reach the reading region', () => {
  const headings = headingsAt([250, 1200, 2400]);
  const viewport = { viewportHeight: 720, scrollHeight: 5000 };

  for (const [scrollTop, expected] of [
    [0, '#section-1'],
    [800, '#section-1'],
    [950, '#section-1'],
    [970, '#section-2'],
    [2000, '#section-2'],
    [2170, '#section-3'],
    [4280, '#section-3'],
  ]) {
    assert.equal(getActiveSection(headings, { ...viewport, scrollTop }), expected);
  }
});

test('overscroll uses the same selection as the nearest document boundary', () => {
  const headings = headingsAt(fixtures[0].headings);
  const viewport = { viewportHeight: 720, scrollHeight: fixtures[0].scrollHeight };
  const maxScroll = viewport.scrollHeight - viewport.viewportHeight;
  const at = (scrollTop) => getActiveSection(headings, { ...viewport, scrollTop });

  assert.equal(at(-150), at(0));
  assert.equal(at(maxScroll + 150), at(maxScroll));
});

test('empty and single-heading pages are stable across their scroll range', () => {
  const viewport = { viewportHeight: 720, scrollHeight: 1400 };

  for (const scrollTop of [0, 200, 680]) {
    assert.equal(getActiveSection([], { ...viewport, scrollTop }), undefined);
    assert.equal(getActiveSection(headingsAt([600]), { ...viewport, scrollTop }), '#section-1');
  }
});
