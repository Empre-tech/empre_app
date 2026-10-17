import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { entitiesApi } from '@/api/endpoints';
import { OffersFicha } from '@/components/profile/OffersFicha';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { colors, spacing } from '@/theme';

/** «Todas las ofertas» de un negocio: la lista completa apilada, la que termina antes primero. */
export default function PublicOffersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  return (
    <View style={styles.screen}>
      <SubScreenHeader title={business.data ? `Ofertas · ${business.data.name}` : 'Ofertas'} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        <OffersFicha entityId={id ?? ''} isOwner={false} variant="all" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
