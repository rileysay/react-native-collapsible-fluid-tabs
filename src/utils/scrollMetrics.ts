export type ListScrollMetrics = {
  contentHeight: number;
  viewportHeight: number;
  enabled: boolean;
  deceleration: number;
};

export const INITIAL_SCROLL_METRICS: ListScrollMetrics = {
  contentHeight: 0,
  viewportHeight: 0,
  enabled: true,
  deceleration: 0.998,
};
