interface HeadingPosition {
  url: string;
  top: number;
  scrollMarginTop: number;
}

interface ViewportPosition {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

export function getActiveSection(
  headings: readonly HeadingPosition[],
  { scrollTop, viewportHeight, scrollHeight }: ViewportPosition,
): string | undefined {
  const last = headings.at(-1);
  if (!last) return undefined;

  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  const position = Math.max(0, Math.min(scrollTop, maxScroll));
  const baseLine = Math.min(240, viewportHeight / 3);
  const lastLine = Math.max(last.scrollMarginTop, baseLine);
  const overflow = Math.max(0, last.top - maxScroll - lastLine);
  const tailLength = Math.min(viewportHeight, maxScroll);
  const tailProgress = tailLength > 0
    ? Math.max(0, (position - (maxScroll - tailLength)) / tailLength)
    : 0;

  // Near page end, move the reading line down gradually so short final
  // sections each get a turn instead of jumping straight to the last one.
  const adjustment = overflow * tailProgress;
  let active = headings[0]?.url;
  for (const heading of headings) {
    const line = Math.max(heading.scrollMarginTop, baseLine) + adjustment;
    if (heading.top > position + line + 1) break;
    active = heading.url;
  }
  return active;
}
