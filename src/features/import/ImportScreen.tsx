import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen } from '@/components/ui';
import type { AppStackParamList } from '@/navigation/types';
import { ImportPanel, importNouns } from './ImportPanel';
import type { ImportCommitResult, ImportEntity } from './api';

type Props = NativeStackScreenProps<AppStackParamList, 'Import'>;

const TITLES: Record<ImportEntity, string> = {
  customers: 'Import customers',
  vehicles: 'Import vehicles',
};

// Thin host over ImportPanel: this screen's own behaviour after a successful
// commit — an Alert with the counts, then back — versus the onboarding
// wizard's "add to the running count and advance" (OnboardingScreen.tsx).
export function ImportScreen({ route, navigation }: Props) {
  const { entity } = route.params;
  const title = TITLES[entity];
  const nouns = importNouns[entity];

  const handleImported = (res: ImportCommitResult) => {
    const bits = [`Imported ${res.imported} ${res.imported === 1 ? nouns.singular : nouns.plural}.`];
    if (res.skipped > 0) bits.push(`${res.skipped} skipped — needed attention.`);
    if (res.vehicle_types_created?.length) {
      bits.push(
        `New vehicle type${res.vehicle_types_created.length > 1 ? 's' : ''} created: ${res.vehicle_types_created.join(', ')}.`,
      );
    }
    Alert.alert('Import complete', bits.join(' '), [{ text: 'Done', onPress: () => navigation.goBack() }]);
  };

  return (
    <ImportPanel entity={entity} onImported={handleImported}>
      {({ body, footer, hasPreview }) => (
        <SheetScreen
          eyebrow={hasPreview ? 'Check the list' : 'Import'}
          title={title}
          onBack={() => navigation.goBack()}
          footer={footer}
        >
          {body}
        </SheetScreen>
      )}
    </ImportPanel>
  );
}
