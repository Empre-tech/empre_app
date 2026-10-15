import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { promotionsApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { formatDiscount } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

/** Pantalla de creación de promoción: título, descripción, precio o descuento,
 * valor normal, vigencia (días), condiciones y etiquetas. */
export default function NewPromotionScreen() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [normalPrice, setNormalPrice] = useState('');
  const [days, setDays] = useState('7');
  const [conditions, setConditions] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    if (!price.trim() && !discount.trim()) {
      setError('Indica un precio o un descuento');
      return;
    }
    if (discount.trim() && !formatDiscount(discount)) {
      setError('El descuento debe estar entre 1 y 100');
      return;
    }
    const durationDays = parseFloat(days);
    if (!durationDays || durationDays <= 0) {
      setError('Vigencia inválida');
      return;
    }
    const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    setLoading(true);
    setError(null);
    try {
      await promotionsApi.publish(entityId ?? '', {
        title: title.trim(),
        description: description.trim(),
        price: price.trim(),
        discount: String(Number(discount) || ''),
        normal_price: normalPrice.trim(),
        ends_at: endsAt,
        conditions: conditions.trim(),
        tags: tags.trim(),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos publicar la promoción');
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
        <Text style={styles.title}>Nueva promoción</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField label="Título" placeholder="Tapizado con 20% de descuento" value={title} onChangeText={setTitle} />
        <TextField label="Descripción (opcional)" placeholder="Una o dos líneas" value={description} onChangeText={setDescription} multiline />
        <TextField label="Precio" placeholder="$25.000" value={price} onChangeText={setPrice} keyboardType="numeric" />
        <TextField
          label="Descuento (%)"
          placeholder="20"
          value={discount}
          onChangeText={(t) => setDiscount(t.replace(/\D/g, '').slice(0, 3))}
          keyboardType="numeric"
          maxLength={3}
        />
        <TextField label="Valor normal (opcional)" placeholder="$30.000" value={normalPrice} onChangeText={setNormalPrice} keyboardType="numeric" />
        <TextField label="Vigencia (días)" placeholder="7" value={days} onChangeText={setDays} keyboardType="number-pad" />
        <TextField label="Condiciones (opcional)" placeholder="Válido de lunes a viernes" value={conditions} onChangeText={setConditions} />
        <TextField label="Etiquetas (separadas por coma)" placeholder="tapizado, sillas, hogar" value={tags} onChangeText={setTags} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Publicar promoción" onPress={onSubmit} loading={loading} style={styles.cta} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
  cta: { marginTop: spacing.sm },
});
