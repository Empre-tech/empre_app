import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalogApi } from '@/api/catalog';
import { promotionsApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { PromotionCardView } from '@/components/promotion/PromotionCardView';
import { TextField } from '@/components/TextField';
import { formatOfferEndsAt } from '@/lib/offer';
import {
  MAX_PROMO_SERVICES,
  MESSAGE_MAX,
  MOTIVES,
  MOTIVE_MAX,
  TEMPLATES,
  parseDays,
  previewModel,
  suggestTemplate,
  validatePromotionForm,
  type PromotionForm,
} from '@/lib/promotion';
import { colors, fonts, radius, spacing } from '@/theme';

/** Cuándo termina una campaña que dura `days` días desde ahora (fuera del componente: depende de la hora). */
function endsInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Editor de promociones por plantillas: motivo (privado) → título y mensaje (público) → servicios del catálogo →
 * plantilla → vigencia → vista previa. Se puede guardar como borrador o publicar. El motivo no se publica nunca.
 */
export default function NewPromotionScreen() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId ?? ''), enabled: Boolean(entityId) });
  const services = catalog.data ?? [];

  const [form, setForm] = useState<PromotionForm>({ motive: '', title: '', message: '', template: null, serviceIds: [], days: '7' });
  // La plantilla se sugiere según los servicios hasta que la persona elige una a mano.
  const [templatePickedByHand, setTemplatePickedByHand] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<PromotionForm>) => setForm((f) => ({ ...f, ...patch }));
  const toggleService = (id: string) =>
    setForm((f) => {
      const serviceIds = f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : f.serviceIds.length >= MAX_PROMO_SERVICES ? f.serviceIds : [...f.serviceIds, id];
      return { ...f, serviceIds, template: templatePickedByHand ? f.template : suggestTemplate(serviceIds.length) };
    });
  const pickTemplate = (template: PromotionForm['template']) => {
    setTemplatePickedByHand(true);
    set({ template });
  };

  const days = parseDays(form.days);
  const preview = previewModel(form, services, days ? `Hasta el ${formatOfferEndsAt(endsInDays(days))}` : null);

  const save = async (draft: boolean) => {
    const problem = validatePromotionForm(form, draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(draft ? 'draft' : 'publish');
    setError(null);
    try {
      await promotionsApi.publish(entityId ?? '', {
        title: form.title.trim(),
        motive_internal: form.motive.trim() || undefined,
        public_message: form.message.trim() || undefined,
        template: form.template ?? undefined,
        service_item_ids: form.serviceIds,
        // Un borrador lleva una fecha de fin tentativa; al publicarlo se exige que siga siendo futura.
        ends_at: days ? endsInDays(days) : undefined,
        draft,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar la promoción');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Nueva promoción</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.step}>1 · ¿Por qué la creas?</Text>
        <Text style={styles.help}>Solo lo ves tú, para organizarte. No se publica.</Text>
        <View style={styles.chips}>
          {MOTIVES.map((m) => {
            const on = form.motive === m;
            return (
              <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => set({ motive: on ? '' : m })} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextField label="O escribe el tuyo (privado)" placeholder="Subir las ventas del mes" value={form.motive} onChangeText={(t) => set({ motive: t })} autoCapitalize="sentences" maxLength={MOTIVE_MAX} />

        <Text style={styles.step}>2 · Lo que verá el cliente</Text>
        <TextField label="Título" placeholder="Primer aniversario" value={form.title} onChangeText={(t) => set({ title: t })} autoCapitalize="sentences" maxLength={80} />
        <TextField
          label={`Mensaje (opcional, hasta ${MESSAGE_MAX})`}
          placeholder="Celebramos un año y queremos agradecer a quienes nos acompañan"
          value={form.message}
          onChangeText={(t) => set({ message: t })}
          autoCapitalize="sentences"
          multiline
          maxLength={MESSAGE_MAX}
        />

        <Text style={styles.step}>3 · Servicios que destacas (opcional)</Text>
        {services.length === 0 ? (
          <Text style={styles.help}>Aún no tienes servicios en tu catálogo. Añádelos en tu perfil para destacarlos aquí.</Text>
        ) : (
          <View style={styles.chips}>
            {services.map((s) => {
              const on = form.serviceIds.includes(s.id);
              return (
                <Pressable key={s.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleService(s.id)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.step}>4 · Plantilla</Text>
        {TEMPLATES.map((t) => {
          const on = form.template === t.id;
          return (
            <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => pickTemplate(t.id)} style={[styles.template, on && styles.templateOn]}>
              <Text style={styles.templateName}>{t.label}</Text>
              <Text style={styles.help}>{t.hint}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.step}>5 · ¿Cuánto dura?</Text>
        <TextField label="Días (de 1 a 90)" placeholder="7" value={form.days} onChangeText={(t) => set({ days: t })} keyboardType="number-pad" />

        <Text style={styles.step}>6 · Así la verán</Text>
        <PromotionCardView model={preview} />

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button title="Publicar promoción" onPress={() => void save(false)} loading={saving === 'publish'} disabled={saving !== null} />
        <Button title="Guardar como borrador" variant="secondary" onPress={() => void save(true)} loading={saving === 'draft'} disabled={saving !== null} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md },
  step: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm },
  help: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextOn: { color: colors.primaryDark },
  template: { gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  templateOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  templateName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
});
