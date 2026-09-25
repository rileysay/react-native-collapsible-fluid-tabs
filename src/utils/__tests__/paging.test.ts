import {
  clampTabIndex,
  collapseTranslateY,
  getHeaderCollapseRange,
  getHeaderScrollOffset,
  resolveSnapIndex,
  rubberBand,
} from '../paging';

const PAGE = 300;

describe('clampTabIndex', () => {
  it('normalizes initial, controlled and imperative indices consistently', () => {
    expect(clampTabIndex(-2, 3)).toBe(0);
    expect(clampTabIndex(10, 3)).toBe(2);
    expect(clampTabIndex(1.6, 3)).toBe(2);
    expect(clampTabIndex(0.4, 3)).toBe(0);
  });

  it('keeps invalid numeric input out of layout transforms and array lookups', () => {
    expect(clampTabIndex(NaN, 3)).toBe(0);
    expect(clampTabIndex(Infinity, 3)).toBe(0);
    expect(clampTabIndex(-Infinity, 3)).toBe(0);
  });
});

describe('resolveSnapIndex', () => {
  it('stays on the current page for a small, slow drag', () => {
    expect(resolveSnapIndex(1, -20, 0, PAGE, 3)).toBe(1);
    expect(resolveSnapIndex(1, 20, 0, PAGE, 3)).toBe(1);
  });

  it('advances when dragged past a quarter page', () => {
    expect(resolveSnapIndex(0, -(PAGE / 4) - 1, 0, PAGE, 3)).toBe(1);
  });

  it('goes back when dragged past a quarter page the other way', () => {
    expect(resolveSnapIndex(2, PAGE / 4 + 1, 0, PAGE, 3)).toBe(1);
  });

  it('flips on a fast flick even with little translation', () => {
    expect(resolveSnapIndex(0, -5, -1200, PAGE, 3)).toBe(1);
    expect(resolveSnapIndex(2, 5, 1200, PAGE, 3)).toBe(1);
  });

  it('uses velocity projection so a short fast flick still flips', () => {
    // translation alone (-10) is under a quarter page (-75), and projected
    // with velocity (-10 + -400*0.12 = -58) is still under, so no flip...
    expect(resolveSnapIndex(0, -10, -400, PAGE, 3)).toBe(0);
    // ...a larger drag with the same velocity projects past the threshold
    // (-40 + -400*0.12 = -88 < -75).
    expect(resolveSnapIndex(0, -40, -400, PAGE, 3)).toBe(1);
  });

  it('clamps at the first and last page', () => {
    expect(resolveSnapIndex(0, 200, 2000, PAGE, 3)).toBe(0);
    expect(resolveSnapIndex(2, -200, -2000, PAGE, 3)).toBe(2);
  });

  it('follows a fast reversal symmetrically in both directions', () => {
    expect(resolveSnapIndex(1, -240, 1000, PAGE, 3)).toBe(0);
    expect(resolveSnapIndex(1, 240, -1000, PAGE, 3)).toBe(2);
  });

  it('returns to the current tab when a recognized swipe is canceled', () => {
    expect(resolveSnapIndex(1, -240, -1200, PAGE, 3, true)).toBe(1);
    expect(resolveSnapIndex(1, 240, 1200, PAGE, 3, true)).toBe(1);
  });

  it('does not navigate before a valid page width is available', () => {
    expect(resolveSnapIndex(1, -100, -1200, 0, 3)).toBe(1);
    expect(resolveSnapIndex(1, -100, -1200, NaN, 3)).toBe(1);
  });

  it('normalizes the current index and keeps a single page at index zero', () => {
    expect(resolveSnapIndex(99, 0, 0, PAGE, 3)).toBe(2);
    expect(resolveSnapIndex(0, -240, -1200, PAGE, 1)).toBe(0);
  });
});

describe('rubberBand', () => {
  it('passes values through when inside bounds', () => {
    expect(rubberBand(-150, -600, 0)).toBe(-150);
    expect(rubberBand(0, -600, 0)).toBe(0);
    expect(rubberBand(-600, -600, 0)).toBe(-600);
  });

  it('applies resistance past the max bound', () => {
    expect(rubberBand(100, -600, 0)).toBeCloseTo(30);
  });

  it('applies resistance past the min bound', () => {
    expect(rubberBand(-700, -600, 0)).toBeCloseTo(-630);
  });

  it('honors a custom resistance factor', () => {
    expect(rubberBand(100, -600, 0, 0.5)).toBeCloseTo(50);
  });
});

describe('collapseTranslateY', () => {
  it('collapses upward as the list scrolls down, clamped to header height', () => {
    expect(collapseTranslateY(0, 200, false)).toBe(-0);
    expect(collapseTranslateY(120, 200, false)).toBe(-120);
    expect(collapseTranslateY(500, 200, false)).toBe(-200);
  });

  it('ignores overscroll when not stretching', () => {
    expect(collapseTranslateY(-80, 200, false)).toBe(0);
  });

  it('pushes the header down on overscroll when stretching', () => {
    expect(collapseTranslateY(-80, 200, true)).toBe(80);
  });

  it('stops collapsing once the minimum visible header height remains', () => {
    expect(getHeaderCollapseRange(200, 60)).toBe(140);
    expect(collapseTranslateY(100, 200, false, 60)).toBe(-100);
    expect(collapseTranslateY(500, 200, false, 60)).toBe(-140);
    expect(collapseTranslateY(-80, 200, true, 60)).toBe(80);
  });
});

describe('getHeaderScrollOffset', () => {
  const pages = (...values: number[]) => values.map((value) => ({ value }));

  it('returns the active page offset in normal scrolling', () => {
    expect(getHeaderScrollOffset(1, 3, pages(10, 120, 0), 120, -1, 0)).toBe(
      120
    );
  });

  it('returns the programmatic offset during scroll-to-top on the active tab', () => {
    expect(getHeaderScrollOffset(1, 3, pages(10, 120, 0), 120, 1, 42)).toBe(42);
  });

  it('ignores scroll-to-top running on another tab', () => {
    expect(getHeaderScrollOffset(0, 3, pages(10, 120, 0), 10, 1, 42)).toBe(10);
  });

  it('prefers a negative fallback while the page rests at the top (custom pull)', () => {
    expect(getHeaderScrollOffset(0, 3, pages(0, 0, 0), -56, -1, 0)).toBe(-56);
  });

  it('prefers a negative fallback when the page rests at a fractional offset', () => {
    expect(getHeaderScrollOffset(0, 3, pages(0.4, 0, 0), -56, -1, 0)).toBe(-56);
  });

  it('does not let a negative fallback mask a genuinely scrolled page', () => {
    expect(getHeaderScrollOffset(0, 3, pages(80, 0, 0), -56, -1, 0)).toBe(80);
  });

  it('clamps the active index into range', () => {
    expect(getHeaderScrollOffset(5, 3, pages(0, 0, 90), 90, -1, 0)).toBe(90);
  });

  it('uses a real page for fractional or invalid indices', () => {
    expect(getHeaderScrollOffset(0.6, 3, pages(10, 120, 90), 40, -1, 0)).toBe(
      120
    );
    expect(getHeaderScrollOffset(NaN, 3, pages(10, 120, 90), 40, -1, 0)).toBe(
      10
    );
  });
});
