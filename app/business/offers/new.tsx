import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer, OfferType, RepeatPolicy } from '@/api/types';
import { catalogApi } from '@/api/catalog';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { TextField } from '@/components/TextField';
import { formatPesos, offerPreview, parsePriceInput } from '@/lib/catalog';
import { offerTypeLabel } from '@/lib/offer';
import { bandHint, bestOffer, durationHint, slotsHint, suggestedSlots, type Hint } from '@/lib/offerInsights';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { markFresh, notify } from '@/upload/uploadStore';

const TYPES: OfferType[] = ['HORAS', 'DIA'];
const HOURS_OPTIONS: Record<OfferType, number[]> = { HORAS: [1, 2, 3, 4], DIA: [8, 12], SEMANA: [168] };
const DEFAULT_HOURS: Record<OfferType, number> = { HORAS: 2, DIA: 8, SEMANA: 168 };
const SLOT_OPTIONS = [5, 8, 10, 15, 20];

/** Cuándo termina una oferta que dura `hours` horas desde `now`. */
function endsInHours(now: number, hours: number): string {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

/** Lo mismo desde este momento, al publicar (fuera del componente: depende de la hora). */
function endsFromNow(hours: number): string {
  return endsInHours(Date.now(), hours);
}

/**
 * Nueva oferta (maqueta `ofertas_dueno.html`): tipo, servicios del catálogo con su precio habitual, precio especial
 * con el ahorro, título, cupos y duración con una ★ en lo que mejor le funcionó al negocio y una pista debajo,
 * condiciones plegadas y la vista previa exacta. Arriba, «Repetir la que mejor funcionó» (o la oferta que se vuelve a
 * publicar). Las sugerencias solo salen con datos suficientes y nunca cambian un campo sin que el dueño lo toque.
 */
export default function NewOfferScreen() {
  const { entityId, from } = useLocalSearchParams<{ entityId: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const queryClient = useQueryClient();

  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId ?? ''), enabled: Boolean(entityId) });
  const offers = useQuery({ queryKey: ['offers', entityId], queryFn: () => offersApi.list(entityId ?? ''), enabled: Boolean(entityId) });
  const stats = useQuery({ queryKey: ['offer-stats', entityId], queryFn: () => offersApi.stats(entityId ?? ''), enabled: Boolean(entityId), staleTime: 60_000 });
  const services = catalog.data ?? [];
  const useCatalog = services.length > 0;
  const summary = stats.data?.summary;
  const best = bestOffer(stats.data?.offers ?? [], summary);

  const [type, setType] = useState<OfferType>('HORAS');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [normalPrice, setNormalPrice] = useState('');
  const [slots, setSlots] = useState(10);
  const [hours, setHours] = useState(DEFAULT_HOURS.HORAS);
  const [picked, setPicked] = useState<string[]>([]);
  const [special, setSpecial] = useState('');
  const [radiusM, setRadiusM] = useState(500);
  const [repeat, setRepeat] = useState<RepeatPolicy>('once');
  const [condOpen, setCondOpen] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = services.filter((s) => picked.includes(s.id));
  const specialValue = parsePriceInput(special);
  const preview = offerPreview(chosen, specialValue === undefined ? null : specialValue);
  const togglePick = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));

  /** Carga una oferta anterior tal como se publicó (título, tipo, cupos, duración, precio y servicios). */
  const loadFrom = (o: Offer, why: string) => {
    setType(o.type);
    setTitle(o.title);
    setSlots(o.total_slots);
    const durH = Math.max(1, Math.round((new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 3_600_000));
    setHours(durH);
    setRadiusM(o.radius_meters || 500);
    setRepeat(o.repeat_policy ?? 'once');
    if (typeof o.special_price === 'number') setSpecial(String(o.special_price));
    else setPrice(o.price ?? '');
    if (o.normal_price) setNormalPrice(o.normal_price);
    const ids = services.filter((s) => (o.items ?? []).some((it) => it.name === s.name)).map((s) => s.id);
    if (ids.length) setPicked(ids.slice(0, 5));
    setApplied(why);
    setAppliedFrom(o.id);
  };

  // «Volver a publicar»: la oferta pedida se carga una vez, cuando ya llegó la lista.
  const fromOffer = useMemo(() => (from ? (offers.data ?? []).find((o) => o.id === from) : undefined), [from, offers.data]);
  if (fromOffer && appliedFrom !== fromOffer.id && catalog.isFetched) {
    loadFrom(fromOffer, `Cargamos «${fromOffer.title}» como la publicaste.`);
  }

  const bestFull = best ? (offers.data ?? []).find((o) => o.id === best.offer_id) : undefined;
  const starSlots = suggestedSlots(best);
  const hints: { slots: Hint | null; duration: Hint | null; band: Hint | null } = {
    slots: slotsHint(best, slots),
    duration: type === 'HORAS' ? durationHint(summary, hours * 60) : null,
    band: type === 'HORAS' ? bandHint(summary, new Date(now).getHours()) : null,
  };

  const selectType = (t: OfferType) => {
    setType(t);
    setHours(DEFAULT_HOURS[t]);
  };

  const shownTitle = title.trim() || chosen.map((s) => s.name).join(' + ');
  const previewOffer: Offer = {
    id: 'preview',
    entity_id: entityId ?? '',
    type,
    title: shownTitle || 'Tu título',
    price: useCatalog ? '' : price,
    normal_price: useCatalog ? undefined : normalPrice,
    starts_at: new Date(now).toISOString(),
    ends_at: endsInHours(now, hours),
    total_slots: slots,
    used_slots: 0,
    slots_left: slots,
    radius_meters: radiusM,
    repeat_policy: repeat,
    special_price: useCatalog && typeof specialValue === 'number' ? specialValue : undefined,
    reference_price: useCatalog && preview.reference !== null ? preview.reference : undefined,
  };

  const onSubmit = async () => {
    const finalTitle = shownTitle;
    if (!finalTitle) {
      setError('Escribe un título o elige servicios del catálogo');
      return;
    }
    if (!slots || slots <= 0) {
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
    setLoading(true);
    setError(null);
    try {
      const created = await offersApi.publish(entityId ?? '', {
        type,
        title: finalTitle,
        price: useCatalog ? (specialValue != null ? String(specialValue) : '') : price.trim(),
        normal_price: useCatalog ? (preview.reference != null && specialValue != null ? String(preview.reference) : undefined) : normalPrice.trim() || undefined,
        ends_at: endsFromNow(hours),
        total_slots: slots,
        radius_meters: radiusM,
        repeat_policy: repeat,
        service_item_ids: useCatalog && picked.length > 0 ? picked : undefined,
        special_price: useCatalog && specialValue != null ? specialValue : undefined,
      });
      // Se ve al instante: la oferta entra a la lista ya guardada en la caché, y la lista, el perfil y las
      // estadísticas se refrescan por detrás (antes esperaban a que la caché envejeciera).
      queryClient.setQueryData<Offer[]>(['offers', entityId], (old) => [created, ...(old ?? []).filter((o) => o.id !== created.id)]);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['offers', entityId] }),
        queryClient.invalidateQueries({ queryKey: ['offers-active', entityId] }),
        queryClient.invalidateQueries({ queryKey: ['offer-stats', entityId] }),
      ]);
      markFresh(created.id);
      notify('Oferta publicada ✓');
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
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Nueva oferta
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {bestFull && !from ? (
          <Pressable accessibilityRole="button" onPress={() => loadFrom(bestFull, `Cargamos «${bestFull.title}», tu oferta con más canjes.`)} style={styles.repeat}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
            <View style={styles.repeatText}>
              <Text style={styles.repeatTitle}>Repetir la que mejor funcionó</Text>
              <Text style={styles.repeatSub} numberOfLines={2}>
                {bestFull.title} · {best?.redeemed} canjes · {Math.round((best?.duration_minutes ?? 0) / 60)} h · {bestFull.total_slots} cupos
              </Text>
            </View>
          </Pressable>
        ) : summary && !summary.enough && !from ? (
          <View style={styles.firstOnes}>
            <Text style={styles.firstTitle}>Primeras ofertas</Text>
            <Text style={styles.firstText}>Cuando tengas algunas terminadas, aquí verás qué te funcionó mejor.</Text>
          </View>
        ) : null}
        {applied ? (
          <View style={styles.applied} accessibilityRole="alert">
            <Text style={styles.appliedText}>✓ {applied} Revisa y ajusta lo que quieras.</Text>
          </View>
        ) : null}

        <Text style={styles.label}>¿Cuánto dura?</Text>
        <View style={styles.chips}>
          {TYPES.map((t) => (
            <Chip key={t} label={offerTypeLabel(t)} on={type === t} onPress={() => selectType(t)} />
          ))}
        </View>

        {useCatalog ? (
          <>
            <Text style={styles.label}>Servicios del catálogo (hasta 5)</Text>
            <View style={styles.chips}>
              {services.map((s) => (
                <Chip key={s.id} label={s.name} on={picked.includes(s.id)} onPress={() => togglePick(s.id)} role="checkbox" />
              ))}
            </View>
            {preview.reference !== null ? <Text style={styles.note}>Precio habitual: {formatPesos(preview.reference)} (de tu catálogo; no cambia).</Text> : null}
            {picked.length > 0 && preview.reference === null ? <Text style={styles.note}>Algún servicio no tiene precio habitual: la oferta se publica sin mostrar ahorro.</Text> : null}
            <TextField label="Precio especial" placeholder={preview.reference ? formatPesos(Math.round((preview.reference * 0.7) / 1000) * 1000) : '30.000'} value={special} onChangeText={setSpecial} keyboardType="numeric" />
            {preview.error ? (
              <HintView hint={{ text: preview.error, warn: true }} />
            ) : preview.saving !== null && preview.reference ? (
              <HintView hint={{ text: `Ahorro para el cliente: ${formatPesos(preview.saving)} (${Math.round((preview.saving / preview.reference) * 100)} %). Se verá en tu perfil; en el mapa no sale el precio.`, warn: false }} />
            ) : null}
          </>
        ) : (
          <>
            <TextField label="Precio especial" placeholder="$30.000" value={price} onChangeText={setPrice} keyboardType="numeric" />
            <TextField label="Precio habitual (opcional)" placeholder="$45.000" value={normalPrice} onChangeText={setNormalPrice} keyboardType="numeric" />
            <Text style={styles.note}>Se verá en tu perfil (en el mapa no sale el precio). Con tus servicios en el catálogo, el precio habitual se pone solo.</Text>
          </>
        )}

        <TextField label="Título" placeholder={chosen.map((s) => s.name).join(' + ') || 'Corte + barba'} value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Cupos</Text>
        <View style={styles.chips}>
          {SLOT_OPTIONS.map((n) => (
            <Chip key={n} label={`${n}`} star={starSlots === n} on={slots === n} onPress={() => setSlots(n)} a11y={`${n} cupos${starSlots === n ? ', lo que mejor te funcionó' : ''}`} />
          ))}
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Un cupo menos" onPress={() => setSlots((s) => Math.max(1, s - 1))} style={styles.stepBtn}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>{slots}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Un cupo más" onPress={() => setSlots((s) => Math.min(500, s + 1))} style={styles.stepBtn}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
        {hints.slots ? <HintView hint={hints.slots} /> : null}

        <Text style={styles.label}>Duración</Text>
        <View style={styles.chips}>
          {HOURS_OPTIONS[type].map((h) => {
            const star = type === 'HORAS' && Boolean(summary?.enough && summary.prefer_short) && h === 2;
            return <Chip key={h} label={`${h} h`} star={star} on={hours === h} onPress={() => setHours(h)} a11y={`${h} horas${star ? ', lo que mejor te funcionó' : ''}`} />;
          })}
        </View>
        {hints.duration ? <HintView hint={hints.duration} /> : null}
        {hints.band ? <HintView hint={hints.band} /> : null}

        <View style={styles.fold}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: condOpen }} onPress={() => setCondOpen((v) => !v)} style={styles.foldHead}>
            <Text style={styles.foldTitle}>
              Condiciones · {radiusM} m · {repeat === 'daily' ? '1 al día por persona' : '1 por persona'}
            </Text>
            <Ionicons name={condOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Pressable>
          {condOpen ? (
            <View style={styles.foldBody}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Distancia para reclamar</Text>
                <View style={styles.stepper}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Menos distancia" onPress={() => setRadiusM((r) => Math.max(100, r - 100))} style={styles.stepBtn}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{radiusM} m</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Más distancia" onPress={() => setRadiusM((r) => Math.min(2000, r + 100))} style={styles.stepBtn}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Reclamos por persona</Text>
                <View style={styles.chips}>
                  <Chip label="Una vez" on={repeat === 'once'} onPress={() => setRepeat('once')} />
                  <Chip label="Una al día" on={repeat === 'daily'} onPress={() => setRepeat('daily')} />
                </View>
              </View>
              <Text style={styles.note}>Al reclamar, el cliente recibe un QR que sirve una sola vez.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Así la verán en tu perfil</Text>
          <OfferTicket offer={previewOffer} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Publicar oferta" onPress={onSubmit} loading={loading} disabled={Boolean(useCatalog && preview.error)} />
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress, star, role = 'button', a11y }: { label: string; on: boolean; onPress: () => void; star?: boolean; role?: 'button' | 'checkbox'; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: on } : { selected: on }}
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>
        {label}
        {star ? <Text style={styles.star}> ★</Text> : null}
      </Text>
    </Pressable>
  );
}

function HintView({ hint }: { hint: Hint }) {
  return (
    <View style={[styles.hint, hint.warn && styles.hintWarn]}>
      <Text style={[styles.hintText, hint.warn && styles.hintTextWarn]}>{hint.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  note: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  chipTextOn: { color: colors.white },
  star: { color: colors.star },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stepValue: { minWidth: 44, textAlign: 'center', fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hint: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  hintWarn: { backgroundColor: colors.warningSoft },
  hintText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  hintTextWarn: { color: colors.warningInk },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  repeatText: { flex: 1 },
  repeatTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  repeatSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  firstOnes: { gap: 4, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  firstTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  firstText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  applied: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.successSoft },
  appliedText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.successInk },
  fold: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  foldHead: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md },
  foldTitle: { flex: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  foldBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  row: { gap: 6 },
  rowLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  preview: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  previewLabel: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
});
