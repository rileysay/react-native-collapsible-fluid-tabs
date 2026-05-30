import { collapseTranslateY, resolveSnapIndex, rubberBand } from '../paging';

const PAGE = 300;

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
});
