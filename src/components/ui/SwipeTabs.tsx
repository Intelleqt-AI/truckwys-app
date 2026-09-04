import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { UnderlineTabs } from './layout';

// Swipeable in-screen tabs: an UnderlineTabs bar synced to a native PagerView.
// Swiping left/right changes the tab; tapping a tab animates the pager.
export function SwipeTabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
  lazy = false,
}: {
  tabs: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  children: ReactNode[];
  // When true, a page only mounts its real content once the user has actually
  // swiped or tapped to it — the initial page mounts eagerly, the rest render
  // an empty placeholder (PagerView needs every child to exist) until first
  // visited. Without this, a screen with several data-fetching tabs fires
  // every tab's requests on mount even though only one is ever visible.
  lazy?: boolean;
}) {
  const ref = useRef<PagerView>(null);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  const pageRef = useRef(index);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([index]));

  useEffect(() => {
    if (pageRef.current !== index) {
      pageRef.current = index;
      ref.current?.setPage(index);
    }
  }, [index]);

  return (
    <View className="flex-1">
      <View className="px-screen">
        <UnderlineTabs tabs={tabs} value={value} onChange={onChange} />
      </View>
      <PagerView
        ref={ref}
        style={{ flex: 1 }}
        initialPage={index}
        onPageSelected={(e) => {
          const pos = e.nativeEvent.position;
          pageRef.current = pos;
          if (lazy) setVisited((prev) => (prev.has(pos) ? prev : new Set(prev).add(pos)));
          const t = tabs[pos];
          if (t && t.value !== value) onChange(t.value);
        }}
      >
        {children.map((child, i) => (
          <View key={tabs[i]?.value ?? i} style={{ flex: 1 }}>
            {!lazy || visited.has(i) ? child : null}
          </View>
        ))}
      </PagerView>
    </View>
  );
}
