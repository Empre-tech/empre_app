import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { BusinessForm } from '@/components/BusinessForm';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/theme';

/** Editar un negocio propio. */
export default function EditBusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['entity', id],
    queryFn: () => entitiesApi.get(id),
    enabled: Boolean(id),
  });

  const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg, padding: spacing.xl } as const;

  if (query.isLoading) {
    return (
      <View style={centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View style={centered}>
        <Text style={{ color: colors.muted }}>No pudimos cargar este negocio.</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (user && query.data.owner_id !== user.id) {
    return (
      <View style={centered}>
        <Text style={{ color: colors.muted }}>Solo el dueño puede editar este negocio.</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  // `key` reinicia el formulario si cambia el negocio o llegan datos frescos.
  return <BusinessForm key={query.data.id} initial={query.data} />;
}
