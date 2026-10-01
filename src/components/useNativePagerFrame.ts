import { useCallback, useState } from 'react';
import {
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type LayoutFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A layout event's frame, or null when it can't place anything. */
function frameOf(event: LayoutChangeEvent): LayoutFrame | null {
  const { x, y, width, height } = event.nativeEvent.layout;
  // Signed origins are legitimate. Sizes may be zero while hidden.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!(width >= 0 && height >= 0)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { x, y, width, height };
}

function sameFrame(a: LayoutFrame | null, b: LayoutFrame) {
  return (
    !!a &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * Whether the pager's place is known to be the whole host before anything is
 * measured: a column container without padding, which is the default.
 */
export function fillsHostUnmeasured(style: StyleProp<ViewStyle>) {
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    (flat.flexDirection ?? 'column') === 'column' &&
    (flat.flexWrap ?? 'nowrap') === 'nowrap' &&
    Object.entries(flat).every(
      ([key, value]) => !key.startsWith('padding') || !value
    )
  );
}

/**
 * Places the pager where the container's content box is. Both frames are
 * physical and relative to the container, so the host's origin is removed
 * once. The frame lays out left to right, so the physical side paddings stay
 * physical even where React Native swaps left and right for RTL.
 */
export function pagerFrameStyle(
  probe: LayoutFrame,
  host: LayoutFrame
): ViewStyle {
  return {
    top: probe.y - host.y,
    height: probe.height,
    // Padding can't be negative. These are only while the two frames come
    // from different layouts, such as a host that shrank before the probe
    // reported, or where the content box leaves the host; the pager then
    // keeps a zero side until the next event.
    paddingLeft: Math.max(0, probe.x - host.x),
    paddingRight: Math.max(0, host.x + host.width - (probe.x + probe.width)),
  };
}

/**
 * Measures where the pager belongs inside the native header scroll host: the
 * container resolves its own padding once, around an empty probe, and the
 * pager is placed at the probe's frame. Idle unless `enabled`.
 *
 * Each view reports its layout separately, so the probe and host can briefly
 * describe different layouts; the frame follows whichever arrived last.
 * `viewportWidth` is the width the pages use, measured from the pager itself.
 */
export function useNativePagerFrame(
  containerStyle: StyleProp<ViewStyle>,
  enabled: boolean,
  viewportWidth: number
) {
  const [probe, setProbe] = useState<LayoutFrame | null>(null);
  const [host, setHost] = useState<LayoutFrame | null>(null);
  const [revealed, setRevealed] = useState(false);

  const onProbeLayout = useCallback((event: LayoutChangeEvent) => {
    const frame = frameOf(event);
    if (frame) setProbe((last) => (sameFrame(last, frame) ? last : frame));
  }, []);
  const onHostLayout = useCallback((event: LayoutChangeEvent) => {
    const frame = frameOf(event);
    if (frame) setHost((last) => (sameFrame(last, frame) ? last : frame));
  }, []);

  const measured = probe && host ? pagerFrameStyle(probe, host) : null;
  // The first reveal also waits for the pages to take the probe's width, so
  // they never show at the width of the unplaced frame. Within a point allows
  // for pixel rounding. After that the pager stays shown, and later events
  // only move it. A zero width has nothing to show, so it doesn't wait, but
  // it doesn't count as that first reveal either.
  const empty = !!measured && probe!.width === 0;
  const matched =
    !!measured &&
    probe!.width > 0 &&
    Math.abs(viewportWidth - probe!.width) < 1;
  if (enabled && matched && !revealed) setRevealed(true);
  return {
    onProbeLayout,
    onHostLayout,
    style: measured,
    ready:
      !enabled ||
      revealed ||
      matched ||
      empty ||
      fillsHostUnmeasured(containerStyle),
  };
}
