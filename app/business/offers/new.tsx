import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OfferType } from '@/api/types';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { offerTypeLabel } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

const TYPES: OfferType[] = ['HORAS', 'DIA', 'SEMANA'];

const DEFAULT_HOURS: Record<OfferType, string> = {
  HORAS: '2',
  DIA: '8',
  SEMANA: '168',
};

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
    const durationH = parseFloat(hours);
    if (!durationH || durationH <= 0) {
      setError('Duración inválida');
      return;
    }
    const endsAt = new Date(Date.now() + durationH * 60 * 60 * 1000).toISOString();

    setLoading(true);
    setError(null);
    try {
      await offersApi.publish(entityId ?? '', {
        type,
        title: title.trim(),
        price: price.trim(),
        normal_price: normalPrice.trim() || undefined,
        ends_at: endsAt,
        total_slots: totalSlots,
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
        <TextField
          label="Precio"
          placeholder="$30.000"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />
        <TextField
          label="Valor normal (opcional)"
          placeholder="$45.000"
          value={normalPrice}
          onChangeText={setNormalPrice}
          keyboardType="numeric"
        />
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
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  typeChipTextActive: { color: '#fff' },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
  cta: { marginTop: spacing.sm },
});
