import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, EmptyState } from '@/components/ui';
import type { AppStackParamList } from '@/navigation/types';

/**
 * Insurance — a placeholder while the insurer partnerships are being set up
 * (mirrors web's src/pages/Insurance.tsx). A real route rather than a
 * disabled menu row: a row that does nothing when tapped reads as a bug.
 */
type Props = NativeStackScreenProps<AppStackParamList, 'Insurance'>;

export function InsuranceScreen({ navigation }: Props) {
  return (
    <SheetScreen title="Insurance" onBack={() => navigation.goBack()}>
      <EmptyState
        icon="shield"
        title="Launching soon"
        body="We're partnering with leading insurers to bring cover directly into Truckwys, so you can manage your fleet's risk in the same place you manage your loads."
      />
    </SheetScreen>
  );
}
