import { useEffect, useRef, type ReactNode } from 'react';
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
}: {
  tabs: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  children: ReactNode[];
}) {
  const ref = useRef<PagerView>(null);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  const pageRef = useRef(index);

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
          const t = tabs[pos];
          if (t && t.value !== value) onChange(t.value);
        }}
      >
        {children.map((child, i) => (
          <View key={tabs[i]?.value ?? i} style={{ flex: 1 }}>
            {child}
          </View>
        ))}
      </PagerView>
    </View>
  );
}
