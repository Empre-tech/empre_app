import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type ItemCost } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { amountField, formatPesos, parseAmountInput } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Cuánto te cuesta cada producto. Con el costo, «Mi negocio» calcula cuánto ganas por cada venta (el margen). Solo lo
 * ves tú: no aparece en el perfil público del negocio.
 */
export default function CostsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId) });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title="Costo de tus productos" />
      {items.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : items.isError ? (
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tus productos" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void items.refetch() }} />
      ) : (
        <FlatList
          data={items.data ?? []}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          ListHeaderComponent={<Text style={styles.intro}>Escribe lo que te cuesta cada cosa. Si no lo sabes, déjalo vacío: lo puedes completar después.</Text>}
          ListEmptyComponent={<EmptyState icon="pricetags-outline" title="Aún no tienes productos" body="Agrega productos o servicios a tu catálogo para poder ponerles costo." />}
          renderItem={({ item }) => <CostRow entityId={entityId} item={item} />}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function CostRow({ entityId, item }: { entityId: string; item: ItemCost }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(item.cost ?? 0);
  const [saved, setSaved] = useState(item.cost ?? 0);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (cost: number | null) => ledgerApi.setItemCost(entityId, item.id, cost),
    onSuccess: (_d, cost) => {
      setSaved(cost ?? 0);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'items'] });
    },
    onError: () => setError('No se pudo guardar. Revisa tu conexión.'),
  });

  const margin = item.price && value > 0 ? Math.round(((item.price - value) / item.price) * 100) : null;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta}>{item.price !== null ? `Lo vendes en ${formatPesos(item.price)}` : 'Sin precio'}</Text>
        {margin !== null ? <Text style={[styles.margin, margin < 0 && { color: colors.danger }]}>{margin < 0 ? `Pierdes ${Math.abs(margin)} % en cada uno` : `Ganas ${margin} % en cada uno`}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.inputWrap}>
        <Text style={styles.sign}>$</Text>
        <TextInput
          value={amountField(value)}
          onChangeText={(t) => setValue(parseAmountInput(t))}
          onBlur={() => {
            if (value !== saved) save.mutate(value > 0 ? value : null);
          }}
          keyboardType="number-pad"
          placeholder="Costo"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel={`Costo de ${item.name}`}
          maxLength={10}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  intro: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  name: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  margin: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.success },
  error: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.danger },
  inputWrap: { flexDirection: 'row', alignItems: 'center', width: 130, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.bg },
  sign: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.muted },
  input: { flex: 1, minHeight: 44, fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'right' },
});
