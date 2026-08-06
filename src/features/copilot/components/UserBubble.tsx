import { memo } from 'react';
import { View } from 'react-native';
import { Txt } from '@/components/ui';

// The user's own message. Keeps the accent bubble — it's short, right-aligned and
// never contains markdown, so none of the reasons the assistant row went
// full-width apply here.
export const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  return (
    <View className="my-1 max-w-[86%] self-end rounded-md bg-accent px-3.5 py-2.5">
      <Txt className="text-callout text-on-accent">{text}</Txt>
    </View>
  );
});
