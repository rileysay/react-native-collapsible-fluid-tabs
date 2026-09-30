import { createRef, type ComponentRef } from 'react';
import type { ScrollView as RNScrollView } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';

import type { TabsRef } from '../../types';
import { Container } from '../Container';
import { FlashList } from '../FlashList';
import { ScrollView } from '../ScrollView';
import { Tab } from '../Tab';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
function assertType<T extends true>(_value?: T) {}

// Compile-only consumer cases for public refs, checked by tsc.
export function refTypeCases() {
  assertType<Equal<ComponentRef<typeof Container>, TabsRef>>();
  assertType<
    Equal<ComponentRef<typeof ScrollView>, ComponentRef<typeof RNScrollView>>
  >();

  const tabsRef = createRef<TabsRef>();
  const scrollRef = createRef<ComponentRef<typeof RNScrollView>>();
  const flashRef = createRef<FlashListRef<{ id: string }>>();
  const container = (
    <Container ref={tabsRef} renderHeader={() => null}>
      <Tab name="posts">
        <ScrollView ref={scrollRef} />
      </Tab>
      <Tab name="saved">
        <FlashList
          ref={flashRef}
          data={[{ id: 'saved' }]}
          renderItem={() => null}
        />
      </Tab>
    </Container>
  );

  // @ts-expect-error A Container ref exposes TabsRef, not a scroll view.
  const wrongRef = <Container ref={scrollRef} renderHeader={() => null} />;

  return { container, wrongRef };
}
