import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, EmptyState } from '@/components/ui';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Stub'>;

export function StubScreen({ route, navigation }: Props) {
  const { title, body } = route.params;
  return (
    <SheetScreen title={title} onBack={() => navigation.goBack()}>
      <EmptyState icon="box" title={title} body={body ?? 'This section is coming to mobile soon.'} />
    </SheetScreen>
  );
}
