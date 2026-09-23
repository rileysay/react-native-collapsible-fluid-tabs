import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { TabSymbol, type TabConfig, type TabProps } from '../types';

export interface ExtractedTab {
  config: TabConfig;
  children: ReactNode;
  key: string;
}

export function extractTabs(children: ReactNode): ExtractedTab[] {
  const result: ExtractedTab[] = [];
  const names = new Set<string>();
  const visit = (nodes: ReactNode) =>
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === Fragment) {
        visit((child as ReactElement<{ children?: ReactNode }>).props.children);
        return;
      }
      const type = child.type as { $$typeofTab?: symbol } | undefined;
      if (!type || type.$$typeofTab !== TabSymbol) return;
      const tabElement = child as ReactElement<TabProps>;
      const {
        name,
        icon,
        label,
        badge,
        children: tabChildren,
      } = tabElement.props;
      if (names.has(name)) {
        throw new Error(
          `[collapsible-fluid-tabs] Tab names must be unique: "${name}" is used more than once.`
        );
      }
      names.add(name);
      result.push({
        config: { name, icon, label, badge },
        children: tabChildren,
        key: name,
      });
    });
  visit(children);
  if (result.length === 0) {
    throw new Error(
      '[collapsible-fluid-tabs] <Tabs.Container> requires at least one <Tabs.Tab> child.'
    );
  }
  return result;
}
