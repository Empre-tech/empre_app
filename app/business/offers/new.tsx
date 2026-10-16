import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OfferType } from '@/api/types';
import { catalogApi } from '@/api/catalog';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { formatPesos, offerPreview, parsePriceInput } from '@/lib/catalog';
import { offerTypeLabel } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

const TYPES: OfferType[] = ['HORAS', 'DIA'];

const DEFAULT_HOURS: Record<OfferType, string> = {
  HORAS: '2',
  DIA: '8',
  SEMANA: '168',
};

/** Cuándo termina una oferta que dura `hours` horas desde ahora (fuera del componente: depende de la hora). */
function endsInHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** Pantalla de creación de oferta en <30 s: tipo, título, precio, cupos y duración. */
export default function NewOfferScreen() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<OfferType>('HORAS');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [normalPrice, setNormalPrice] = useState('');
  const [slots, setSlots] = useState('10');
  // Servicios del catálogo incluidos (hasta 5) y precio especial propio de la oferta.
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId ?? ''), enabled: Boolean(entityId) });
  const services = catalog.data ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [special, setSpecial] = useState('');
  const chosen = services.filter((s) => picked.includes(s.id));
  const specialValue = parsePriceInput(special);
  const preview = offerPreview(chosen, specialValue === undefined ? null : specialValue);
  const useCatalog = services.length > 0;
  const togglePick = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));
  const [hours, setHours] = useState(DEFAULT_HOURS.HORAS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectType = (t: OfferType) => {
    setType(t);
    setHours(DEFAULT_HOURS[t]);
  };

  const onSubmit = async () => {
    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    const totalSlots = parseInt(slots, 10);
    if (!totalSlots || totalSlots <= 0) {
      setError('Cupos inválidos');
      return;
    }
    if (useCatalog && specialValue === undefined) {
      setError('El precio especial debe ser un número, por ejemplo 30.000');
      return;
    }
    if (useCatalog && preview.error) {
      setError(preview.error);
      return;
    }
    const durationH = parseFloat(hours);
    if (!durationH || durationH <= 0) {
      setError('Duración inválida');
      return;
    }
    const endsAt = endsInHours(durationH);

    setLoading(true);
    setError(null);
    try {
      await offersApi.publish(entityId ?? '', {
        type,
        title: title.trim(),
        // Con catálogo, el precio de la oferta es el especial y el valor normal la referencia congelada (los
        // textos de siempre siguen llenos para lo que ya los muestra); sin catálogo, los campos de siempre.
        price: useCatalog ? (specialValue != null ? String(specialValue) : '') : price.trim(),
        normal_price: useCatalog ? (preview.reference != null && specialValue != null ? String(preview.reference) : undefined) : normalPrice.trim() || undefined,
        ends_at: endsAt,
        total_slots: totalSlots,
        service_item_ids: useCatalog && picked.length > 0 ? picked : undefined,
        special_price: useCatalog && specialValue != null ? specialValue : undefined,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos publicar la oferta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Nueva oferta</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>¿Cuánto tiempo?</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <Pressable
                key={t}
                onPress={() => selectType(t)}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                  {offerTypeLabel(t)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextField label="Título" placeholder="Corte + barba" value={title} onChangeText={setTitle} />
        {useCatalog ? (
          <>
            <Text style={styles.label}>Incluye (de tu catálogo, hasta 5)</Text>
            <View style={styles.pickRow}>
              {services.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${s.name}${s.price === null ? ', sin precio publicado' : ''}`}
                    onPress={() => togglePick(s.id)}
                    style={[styles.pick, on && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label="Precio especial de esta oferta (opcional)"
              placeholder="30.000"
              value={special}
              onChangeText={setSpecial}
              keyboardType="numeric"
            />
            {preview.error ? <Text style={styles.error}>{preview.error}</Text> : null}
            {!preview.error && preview.reference !== null ? (
              <Text style={styles.previewText}>
                Precio habitual de lo incluido: {formatPesos(preview.reference)}
                {preview.saving !== null ? ` · el cliente ahorra ${formatPesos(preview.saving)}` : ''}. Tu catálogo no cambia.
              </Text>
            ) : null}
            {picked.length > 0 && preview.reference === null ? (
              <Text style={styles.previewText}>Algún servicio no tiene precio habitual: la oferta se publica sin mostrar ahorro.</Text>
            ) : null}
          </>
        ) : (
          <>
            <TextField label="Precio" placeholder="$30.000" value={price} onChangeText={setPrice} keyboardType="numeric" />
            <TextField label="Valor normal (opcional)" placeholder="$45.000" value={normalPrice} onChangeText={setNormalPrice} keyboardType="numeric" />
            <Text style={styles.previewText}>Añade tus servicios al catálogo (en tu perfil) para armar la oferta con ellos.</Text>
          </>
        )}
        <TextField
          label="Cupos"
          placeholder="10"
          value={slots}
          onChangeText={setSlots}
          keyboardType="number-pad"
        />
        <TextField
          label="Duración (horas)"
          placeholder={DEFAULT_HOURS[type]}
          value={hours}
          onChangeText={setHours}
          keyboardType="number-pad"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Publicar oferta" onPress={onSubmit} loading={loading} style={styles.cta} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pick: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  pickOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pickText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  pickTextOn: { color: colors.primaryDark },
  previewText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  typeChipTextActive: { color: '#fff' },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
  cta: { marginTop: spacing.sm },
});
