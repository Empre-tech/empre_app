import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalogApi } from '@/api/catalog';
import { mediaApi } from '@/api/media';
import { promotionsApi } from '@/api/offers';
import type { UploadableImage } from '@/api/types';
import { Button } from '@/components/Button';
import { PromotionCardView } from '@/components/promotion/PromotionCardView';
import { TextField } from '@/components/TextField';
import { pickImage } from '@/lib/images';
import { formatOfferEndsAt } from '@/lib/offer';
import {
  MAX_PROMO_SERVICES,
  MESSAGE_MAX,
  MOTIVES,
  MOTIVE_MAX,
  TEMPLATES,
  coverMediaId,
  coverNeedsUpload,
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
  // Portada: la foto elegida y, cuando ya se subió, el id del medio (así reintentar un guardado no la sube otra vez).
  const [cover, setCover] = useState<UploadableImage | null>(null);
  const [uploaded, setUploaded] = useState<{ uri: string; id: string } | null>(null);
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

  const onPickCover = async () => {
    setError(null);
    try {
      const image = await pickImage({ aspect: [16, 9], maxWidth: 1600 });
      if (image) setCover(image);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir tus fotos');
    }
  };

  const days = parseDays(form.days);
  const preview = previewModel(form, services, days ? `Hasta el ${formatOfferEndsAt(endsInDays(days))}` : null, cover?.uri ?? null);

  const save = async (draft: boolean) => {
    const problem = validatePromotionForm(form, draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(draft ? 'draft' : 'publish');
    setError(null);
    try {
      // La foto se sube al guardar (no al elegirla: así no quedan fotos sueltas si la persona se arrepiente).
      let photoId = coverMediaId({ picked: cover, uploaded });
      if (cover && coverNeedsUpload({ picked: cover, uploaded })) {
        try {
          const media = await mediaApi.upload(cover);
          setUploaded({ uri: cover.uri, id: media.id });
          photoId = media.id;
        } catch (e) {
          setError(`No pudimos subir la imagen${e instanceof Error && e.message ? `: ${e.message}` : ''}. Inténtalo de nuevo o quítala.`);
          return;
        }
      }
      await promotionsApi.publish(entityId ?? '', {
        title: form.title.trim(),
        motive_internal: form.motive.trim() || undefined,
        public_message: form.message.trim() || undefined,
        template: form.template ?? undefined,
        service_item_ids: form.serviceIds,
        photo_media_id: photoId,
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

        <Text style={styles.step}>3 · Imagen de portada (opcional)</Text>
        {cover ? (
          <View style={styles.coverBox}>
            <Image accessible={false} source={{ uri: cover.uri }} style={styles.coverThumb} contentFit="cover" />
            <View style={styles.coverActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cambiar la imagen de portada" onPress={() => void onPickCover()} style={styles.coverButton}>
                <Text style={styles.coverButtonText}>Cambiar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Quitar la imagen de portada" onPress={() => setCover(null)} style={styles.coverButton}>
                <Text style={[styles.coverButtonText, styles.coverRemove]}>Quitar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Elegir una imagen de portada" onPress={() => void onPickCover()} style={styles.coverPick}>
            <Ionicons name="image-outline" size={20} color={colors.primary} />
            <Text style={styles.coverPickText}>Elegir una foto de tu galería</Text>
          </Pressable>
        )}
        <Text style={styles.help}>Una foto real de tu negocio o de lo que ofreces funciona mejor que una genérica.</Text>

        <Text style={styles.step}>4 · Servicios que destacas (opcional)</Text>
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

        <Text style={styles.step}>5 · Plantilla</Text>
        {TEMPLATES.map((t) => {
          const on = form.template === t.id;
          return (
            <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => pickTemplate(t.id)} style={[styles.template, on && styles.templateOn]}>
              <Text style={styles.templateName}>{t.label}</Text>
              <Text style={styles.help}>{t.hint}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.step}>6 · ¿Cuánto dura?</Text>
        <TextField label="Días (de 1 a 90)" placeholder="7" value={form.days} onChangeText={(t) => set({ days: t })} keyboardType="number-pad" />

        <Text style={styles.step}>7 · Así la verán</Text>
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
  coverPick: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  coverPickText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  coverBox: { gap: spacing.sm },
  coverThumb: { aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  coverActions: { flexDirection: 'row', gap: spacing.sm },
  coverButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  coverButtonText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  coverRemove: { color: colors.danger },
});
