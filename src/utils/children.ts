import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { TabSymbol, type TabConfig, type TabProps } from '../types';

export interface ExtractedTab {
  config: TabConfig;
  children: ReactNode;
  key: string;
}

export function extractTabs(children: ReactNode): ExtractedTab[] {
  const result: ExtractedTab[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type as { $$typeofTab?: symbol } | undefined;
    if (!type || type.$$typeofTab !== TabSymbol) return;
    const tabElement = child as ReactElement<TabProps>;
    const { name, icon, label, children: tabChildren } = tabElement.props;
    result.push({
      config: { name, icon, label },
      children: tabChildren,
      key: name,
    });
  });
  if (result.length === 0) {
    throw new Error(
      '[collapsible-fluid-tabs] <Tabs.Container> requires at least one <Tabs.Tab> child.'
    );
  }
  return result;
}
