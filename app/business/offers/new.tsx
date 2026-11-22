import { Ionicons } from '@/components/Icon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer, OfferType, RepeatPolicy } from '@/api/types';
import { catalogApi } from '@/api/catalog';
import { offersApi } from '@/api/offers';
import { ledgerApi } from '@/api/ledger';
import { AIWritingAssist } from '@/components/AIWritingAssist';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { TextField } from '@/components/TextField';
import { formatPesos, offerPreview, parsePriceInput, publicCatalog } from '@/lib/catalog';
import { chosenCost, offerTitleIdeas, priceVerdict, quietSlot, suggestedPrice } from '@/lib/empreAI';
import { presetRange, todayCO } from '@/lib/finance';
import { offerTypeLabel } from '@/lib/offer';
import { bandHint, bestOffer, durationHint, slotsHint, suggestedSlots, type Hint } from '@/lib/offerInsights';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { markFresh, notify } from '@/upload/uploadStore';

const TYPES: OfferType[] = ['HORAS', 'DIA'];
const DEFAULT_HOURS: Record<OfferType, number> = { HORAS: 2, DIA: 8, SEMANA: 168 };

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
  // Empre AI piensa con tus últimos 30 días. Sin Finanzas o sin datos simplemente no dice nada.
  const aiRange = useMemo(() => presetRange('30d', todayCO()), []);
  const numbers = useQuery({
    queryKey: ['ledger', entityId, 'analytics', aiRange.from, aiRange.to, aiRange.compare],
    queryFn: () => ledgerApi.analytics(entityId ?? '', { from: aiRange.from, to: aiRange.to, compare: aiRange.compare }),
    enabled: Boolean(entityId),
    staleTime: 60_000,
    retry: false,
  });
  const services = publicCatalog(catalog.data ?? []);
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
  const [stepIdx, setStepIdx] = useState(0);
  const [itemQuery, setItemQuery] = useState('');
  const scrollRef = useRef<ScrollView>(null);

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
  const chosenNames = chosen.map((s) => s.name);
  const cost = chosenCost(chosenNames, numbers.data?.products ?? []);
  const verdict = priceVerdict(cost, specialValue);
  const priceIdea = specialValue == null && cost !== null ? suggestedPrice(cost, preview.reference) : null;
  const titleIdeas = title.trim() ? [] : offerTitleIdeas(chosenNames, specialValue, preview.reference);
  const quiet = numbers.data ? quietSlot(numbers.data.heat) : null;
  const idle = (numbers.data?.inventory.idle ?? []).map((l) => ({ line: l, service: services.find((s) => s.name === l.name) })).find((x) => x.service && !picked.includes(x.service.id));
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

  // Por pasos (2026-11-22), como crear un producto: qué y a qué precio, cuándo y cuántos, y revisar antes de publicar.
  const steps = [
    { key: 'que', title: 'Qué ofreces' },
    { key: 'cuando', title: 'Cuándo y cuántos' },
    { key: 'revisar', title: 'Revisar y publicar' },
  ] as const;
  const current = steps[stepIdx].key;
  const goStep = (i: number) => {
    setError(null);
    setStepIdx(i);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const stepProblem = (k: (typeof steps)[number]['key']): string | null => {
    if (k === 'que') {
      if (!shownTitle) return useCatalog ? 'Elige qué va en la oferta o escribe un título' : 'Escribe un título';
      if (useCatalog && specialValue === undefined) return 'El precio especial debe ser un número, por ejemplo 30.000';
      if (useCatalog && preview.error) return preview.error;
    }
    if (k === 'cuando' && (!slots || slots <= 0)) return 'Cupos inválidos';
    return null;
  };
  const nextStep = () => {
    const p = stepProblem(current);
    if (p) return setError(p);
    goStep(stepIdx + 1);
  };

  // El catálogo: lo elegido primero y, con muchos, un buscador (sin tildes ni mayúsculas).
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const kindsHere = new Set(services.map((s) => s.kind ?? 'service'));
  const catalogLabel = kindsHere.size > 1 ? 'Productos y servicios' : kindsHere.has('product') ? 'Productos' : 'Servicios';
  const listed = [...chosen, ...services.filter((s) => !picked.includes(s.id) && (!itemQuery.trim() || fold(s.name).includes(fold(itemQuery.trim()))))];
  // Nunca más de 12 a la vista (más lo elegido), aunque sean 100 o la búsqueda encuentre muchos.
  const shownItems = listed.slice(0, chosen.length + 12);
  const hiddenCount = listed.length - shownItems.length;

  const priceText = useCatalog
    ? specialValue != null
      ? `${formatPesos(specialValue)}${preview.reference ? ` (antes ${formatPesos(preview.reference)})` : ''}`
      : 'Sin precio especial'
    : price.trim() || 'Sin precio';
  const summaryRows: { label: string; value: string; step: number }[] = [
    ...(useCatalog ? [{ label: 'Incluye', value: chosenNames.join(', ') || 'Nada del catálogo', step: 0 }] : []),
    { label: 'Precio', value: priceText, step: 0 },
    { label: 'Título', value: shownTitle || 'Falta', step: 0 },
    { label: 'Dura', value: `${offerTypeLabel(type)} · ${hours} h`, step: 1 },
    { label: 'Cupos', value: `${slots}`, step: 1 },
    { label: 'Condiciones', value: `${radiusM} m · ${repeat === 'daily' ? '1 al día por persona' : '1 por persona'}`, step: 1 },
  ];

  const stepQue = (
    <>
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
      ) : null}
      {applied ? (
        <View style={styles.applied} accessibilityRole="alert">
          <Text style={styles.appliedText}>✓ {applied} Revisa y ajusta lo que quieras.</Text>
        </View>
      ) : null}

      {useCatalog ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{`${catalogLabel} · hasta 5`}</Text>
          {idle ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${idle.line.name} a la oferta`} onPress={() => togglePick(idle.service!.id)} style={styles.aiInline}>
              <EmpreSymbol product="ai" size={22} animated={false} />
              <Text style={styles.aiInlineText}>
                <Text style={styles.aiStrong}>{idle.line.name}</Text> está quieto: {idle.line.text.toLowerCase()}. Toca para agregarlo.
              </Text>
            </Pressable>
          ) : null}
          {services.length > 8 ? (
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput value={itemQuery} onChangeText={setItemQuery} placeholder={`Buscar en ${services.length}`} placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar en el catálogo" />
              {itemQuery ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={() => setItemQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.chips}>
            {shownItems.map((s) => (
              <Chip key={s.id} label={s.name} on={picked.includes(s.id)} onPress={() => togglePick(s.id)} role="checkbox" />
            ))}
          </View>
          {hiddenCount > 0 ? <Text style={styles.note}>{itemQuery.trim() ? `Y ${hiddenCount} más con «${itemQuery.trim()}»: escribe más para afinar.` : `Y ${hiddenCount} más: búscalos arriba.`}</Text> : null}
          {itemQuery.trim() && shownItems.length === chosen.length ? <Text style={styles.note}>{`Nada con «${itemQuery.trim()}».`}</Text> : null}
          {preview.reference !== null ? <Text style={styles.note}>Precio habitual: {formatPesos(preview.reference)} (de tu catálogo; no cambia).</Text> : null}
          {picked.length > 0 && preview.reference === null ? <Text style={styles.note}>Alguno no tiene precio habitual: la oferta se publica sin mostrar ahorro.</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        {useCatalog ? (
          <>
            <TextField label="Precio especial" placeholder={preview.reference ? formatPesos(Math.round((preview.reference * 0.7) / 1000) * 1000) : '30.000'} value={special} onChangeText={setSpecial} keyboardType="numeric" />
            {priceIdea ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Usar ${formatPesos(priceIdea)} como precio especial`} onPress={() => setSpecial(String(priceIdea))} style={styles.aiInline}>
                <EmpreSymbol product="ai" size={22} animated={false} />
                <Text style={styles.aiInlineText}>
                  Empre AI sugiere <Text style={styles.aiStrong}>{formatPesos(priceIdea)}</Text>: da ahorro y aún te deja algo. Toca para usarlo.
                </Text>
              </Pressable>
            ) : null}
            {verdict && !preview.error ? <HintView hint={verdict} /> : null}
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
            <Text style={styles.note}>Se verá en tu perfil (en el mapa no sale el precio). Con tu catálogo, el precio habitual se pone solo.</Text>
          </>
        )}
      </View>

      <View style={styles.card}>
        <TextField label={useCatalog ? 'Título (opcional)' : 'Título'} placeholder={chosen.map((s) => s.name).join(' + ') || 'Corte + barba'} value={title} onChangeText={setTitle} />
        {useCatalog && !title.trim() && chosen.length ? <Text style={styles.note}>Si lo dejas vacío, se llama como lo que elegiste.</Text> : null}
        {titleIdeas.length ? (
          <View style={styles.chips} accessibilityLabel="Títulos que sugiere Empre AI">
            {titleIdeas.map((t) => (
              <Chip key={t} label={t} on={false} onPress={() => setTitle(t)} a11y={`Usar el título ${t}`} />
            ))}
          </View>
        ) : null}
        <AIWritingAssist kind="offer_title" currentText={[title.trim() || chosenNames.join(' + '), specialValue ? `Precio especial: ${formatPesos(specialValue)}` : '', preview.reference ? `Precio habitual: ${formatPesos(preview.reference)}` : ''].filter(Boolean).join('. ')} onApply={setTitle} label="Redactar con Empre AI" entityId={entityId} fallback={offerTitleIdeas(chosenNames.length ? chosenNames : title.trim() ? [title.trim()] : [], specialValue, preview.reference)} />
      </View>
    </>
  );

  const stepCuando = (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>¿Cuánto dura?</Text>
        <View style={styles.chips}>
          {TYPES.map((t) => (
            <Chip key={t} label={offerTypeLabel(t)} on={type === t} onPress={() => selectType(t)} />
          ))}
        </View>
        <Regulator label="Duración" value={hours} unit="h" min={type === 'HORAS' ? 1 : 8} max={type === 'HORAS' ? 12 : 24} onChange={setHours} />
        <Text style={styles.note}>Empieza al publicarla y termina {type === 'HORAS' ? `en ${hours} h` : 'al final del tiempo elegido'}.</Text>
        {hints.duration ? <HintView hint={hints.duration} /> : null}
        {hints.band ? <HintView hint={hints.band} /> : null}
        {quiet ? <HintView hint={{ text: `Empre AI: lo que menos te vende es ${quiet}. Si quieres mover ese momento, publícala entonces.`, warn: false }} /> : null}
      </View>

      <View style={styles.card}>
        <Regulator label="Cupos" value={slots} unit={slots === 1 ? 'cupo' : 'cupos'} min={1} max={500} onChange={setSlots} />
        {starSlots && starSlots !== slots ? (
          <Pressable accessibilityRole="button" onPress={() => setSlots(starSlots)} style={styles.bestLine}>
            <Text style={styles.bestText}>Lo que mejor te funcionó: {starSlots} cupos. Usar</Text>
          </Pressable>
        ) : null}
        {hints.slots ? <HintView hint={hints.slots} /> : null}
      </View>

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
    </>
  );

  const stepRevisar = (
    <>
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>Así la verán en tu perfil</Text>
        <OfferTicket offer={previewOffer} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revisa antes de publicar</Text>
        {summaryRows.map((r, i) => (
          <Pressable key={r.label} accessibilityRole="button" accessibilityLabel={`${r.label}: ${r.value}. Cambiar`} onPress={() => goStep(r.step)} style={[styles.sumRow, i > 0 && styles.sumLine]}>
            <Text style={styles.sumLabel}>{r.label}</Text>
            <Text style={styles.sumValue} numberOfLines={2}>
              {r.value}
            </Text>
            <Text style={styles.sumLink}>Cambiar</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (stepIdx > 0 ? goStep(stepIdx - 1) : router.back())} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            Nueva oferta
          </Text>
          <Text style={styles.stepLine}>{`Paso ${stepIdx + 1} de ${steps.length} · ${steps[stepIdx].title}`}</Text>
        </View>
      </View>
      <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {steps.map((x, i) => (
          <View key={x.key} style={[styles.progressBit, i <= stepIdx && styles.progressOn]} />
        ))}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]} keyboardShouldPersistTaps="handled">
        {current === 'que' ? stepQue : current === 'cuando' ? stepCuando : stepRevisar}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.footRow}>
          {stepIdx > 0 ? <Button title="Atrás" variant="secondary" onPress={() => goStep(stepIdx - 1)} style={{ flex: 1 }} /> : null}
          {current === 'revisar' ? (
            <Button title="Publicar oferta" onPress={onSubmit} loading={loading} disabled={Boolean(useCatalog && preview.error)} style={{ flex: 2 }} />
          ) : (
            <Button title="Siguiente" onPress={nextStep} style={{ flex: 2 }} />
          )}
        </View>
      </View>
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

/** Sube o baja un número; dejar presionado corre más rápido. Reemplaza las listas de números fijos. */
function Regulator({ label, value, unit, min, max, onChange }: { label: string; value: number; unit: string; min: number; max: number; onChange: (n: number) => void }) {
  const live = useRef(value);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    live.current = value;
  }, [value]);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const step = (d: number) => {
    const next = Math.max(min, Math.min(max, live.current + d));
    live.current = next;
    onChange(next);
  };
  const hold = (d: number) => {
    stop();
    timer.current = setInterval(() => step(d), 90);
  };
  const btn = (d: number, name: 'remove' | 'add', a11y: string, off: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: off }} disabled={off} onPress={() => step(d)} onLongPress={() => hold(d)} onPressOut={stop} delayLongPress={350} style={({ pressed }) => [styles.regBtn, off && styles.regBtnOff, pressed && styles.regBtnPressed]}>
      <Ionicons name={name} size={22} color={off ? colors.placeholder : colors.ink} />
    </Pressable>
  );
  return (
    <View style={styles.reg} accessibilityLabel={`${label}: ${value} ${unit}`}>
      <Text style={styles.regLabel}>{label}</Text>
      {btn(-1, 'remove', `${label}: uno menos`, value <= min)}
      <View style={styles.regValue}>
        <Text style={styles.regNum} accessibilityLiveRegion="polite">
          {value}
        </Text>
        <Text style={styles.regUnit}>{unit}</Text>
      </View>
      {btn(1, 'add', `${label}: uno más`, value >= max)}
    </View>
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
  reg: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12, borderRadius: 20, backgroundColor: colors.surface },
  regLabel: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  regBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.selectedSoft },
  regBtnOff: { opacity: 0.5 },
  regBtnPressed: { transform: [{ scale: 0.94 }] },
  regValue: { minWidth: 64, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3 },
  regNum: { fontSize: 24, lineHeight: 28, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  regUnit: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  bestLine: { minHeight: 36, justifyContent: 'center', marginTop: -6 },
  bestText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  ai: { gap: 10, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surface },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiTitle: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  aiRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiStrong: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  aiSub: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  aiAct: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  aiInline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.selectedSoft },
  aiInlineText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  note: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  chipTextOn: { color: colors.onPrimary},
  star: { color: '#E6A100' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stepValue: { minWidth: 44, textAlign: 'center', fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hint: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.selectedSoft },
  hintWarn: { backgroundColor: colors.accentSoft },
  hintText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.ink },
  hintTextWarn: { color: colors.accentInk },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  repeatText: { flex: 1 },
  repeatTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  repeatSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  stepLine: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  progressBit: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  progressOn: { backgroundColor: colors.primary },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingVertical: 6 },
  sumLine: { borderTopWidth: 1, borderTopColor: colors.line },
  sumLabel: { width: 92, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  sumValue: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sumLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  footRow: { flexDirection: 'row', gap: spacing.sm },
  applied: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: '#FEF3E9' },
  appliedText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#A35C13' },
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
