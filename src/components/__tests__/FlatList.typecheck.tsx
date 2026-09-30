import { createRef } from 'react';
import type { FlatList as RNFlatList } from 'react-native';

import { FlatList, type TabsFlatListProps } from '../FlatList';

// Compile-only consumer cases, checked by tsc; no native list is mounted.
export function flatListTypeCases() {
  const data = [{ id: 'shirt' }];
  const ref = createRef<RNFlatList<(typeof data)[number]>>();
  const supported = (
    <FlatList
      data={data}
      ref={ref}
      renderItem={({ item }) => item.id}
      minContentHeight={0}
    />
  );

  const unsupported = {
    data,
    renderItem: () => null,
    CellRendererComponent: () => null,
  };
  // @ts-expect-error Reanimated overrides custom cells, including spread props.
  const invalidElement = <FlatList {...unsupported} />;
  // @ts-expect-error The named props contract must reject the same custom cell.
  const invalidProps: TabsFlatListProps<(typeof data)[number]> = unsupported;

  return { supported, invalidElement, invalidProps };
}
