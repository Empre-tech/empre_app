import { Ionicons } from '@/components/Icon';
import { loadFacts } from '@/lib/agentPrefsStore';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { catalogApi } from '@/api/catalog';
import { BookingSheet } from '@/components/agenda/BookingSheet';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { track } from '@/analytics/track';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Cover } from '@/components/Cover';
import { AskSheet } from '@/components/profile/AskSheet';
import { attrGroups, pickVariant, audienceText, catalogCopy, priceText, searchTerms } from '@/lib/catalog';
import { chatItemParam } from '@/lib/chatItem';
import { safeIcon } from '@/lib/icons';
import { mediaUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

/** «hoy 2:00 pm» o «vie 9:00 am»: la próxima hora libre, corta. */
function nextSlotLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const today = new Date().toDateString() === d.toDateString();
  return today ? `hoy ${time}` : `${d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')} ${time}`;
}

const PHONE_RE = /^[+\d\s()-]{7,}$/;
/** Las fotos, dentro de la hoja: se ven bien sin ocupar la pantalla. */
const GALLERY_H = 220;

/**
 * La hoja (2026-11-14): el producto se abre encima de lo que estabas viendo, como en Ofertas, no en una página entera.
 * Ocupa un poco más de media pantalla y se agranda al deslizar o al tocar la barrita; tocar fuera o la ✕ la cierra.
 */
function SheetFrame({ expanded, onClose, onToggle, children }: { expanded: boolean; onClose: () => void; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, { height: expanded ? '92%' : '64%' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Achicar' : 'Ver todo'} onPress={onToggle} style={styles.grabberHit}>
          <View style={styles.grabber} />
        </Pressable>
        {children}
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={4} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.ink} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

/**
 * El detalle de un producto o servicio, como lo ve el cliente: sus fotos (se deslizan; un toque las abre a pantalla
 * completa), la sección y para quién es, el precio, las opciones (tallas, sabores; las agotadas, tachadas), la
 * descripción y «Preguntar por este producto», que abre el chat con el mensaje listo.
 */
export default function ProductScreen() {
  const { entityId: rawEntity, itemId } = useLocalSearchParams<{ entityId: string; itemId: string }>();
  const entityId = rawEntity ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { status, user } = useAuth();
  const [selected, setSelected] = useState(itemId ?? '');
  const [page, setPage] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const close = () => router.back();
  const toggle = () => setExpanded((e) => !e);

  // Tu talla, si le dijiste a Agent que la recuerde: se marca y se elige con un toque.
  const mySize = useQuery({ queryKey: ['agent-facts'], queryFn: loadFacts }).data?.find((f) => f.name === 'Talla')?.value ?? null;
  // Un servicio que se reserva: el botón principal es «Reservar» (tablero «Empre Offers», teléfono 4).
  const agenda = useQuery({ queryKey: ['agenda-summary', entityId], queryFn: () => agendaApi.summary(entityId), enabled: Boolean(entityId), staleTime: 30_000 });
  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const catalog = useQuery({ queryKey: ['catalog', entityId, 'sections'], queryFn: () => catalogApi.listWithSections(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const all = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const item = all.find((i) => i.id === selected);
  // Un producto con variantes se muestra con sus opciones; una variante, con las de su producto.
  const parentId = item?.parent_id ?? (all.some((i) => i.parent_id === item?.id) ? item?.id : undefined);
  const parent = parentId ? all.find((i) => i.id === parentId) : undefined;
  const options = parentId ? all.filter((i) => i.parent_id === parentId) : [];
  // Con atributos (talla, color), se elige cada uno por separado; sin ellos, la lista de siempre.
  const attrOpts = attrGroups(options);
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);

  if (catalog.isLoading || business.isLoading) {
    return (
      <SheetFrame expanded={false} onClose={close} onToggle={toggle}>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      </SheetFrame>
    );
  }
  if (!item || !business.data) {
    return (
      <SheetFrame expanded={false} onClose={close} onToggle={toggle}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={styles.name}>Este producto ya no está</Text>
          <Button title="Volver" variant="secondary" onPress={close} />
        </View>
      </SheetFrame>
    );
  }

  const b = business.data;
  const shown = item.parent_id || options.length === 0 ? item : options[0];
  const photos = item.photos?.length ? item.photos : parent?.photos ?? [];
  const title = parent ? parent.name : item.name;
  const price = priceText(shown);
  const meta = [item.section || parent?.section, audienceText(item.audience?.length ? item.audience : parent?.audience)].filter(Boolean).join(' · ');
  const sectionIcon = catalog.data?.sections.find((s) => s.name === (item.section || parent?.section))?.icon;
  const icon = safeIcon(sectionIcon, safeIcon(displayIcon(b.category?.icon), 'pricetag-outline'));
  const isOwner = Boolean(user && b.owner_id === user.id);
  const description = item.description || parent?.description;
  const contact = b.contact_info?.trim();
  const canCall = Boolean(contact && PHONE_RE.test(contact));
  const askName = parent && item.variant_label ? `${parent.name} (${item.variant_label})` : item.name;
  const canBook = Boolean(item.kind === 'service' && item.bookable && agenda.data?.enabled && agenda.data.services.some((x) => x.id === item.id && x.active));
  // Lo que se registró se vuelve búsqueda en todo Empre (tablero «Perfil», teléfono 2d).
  const terms = searchTerms({ name: title, section: item.section || parent?.section, audience: item.audience?.length ? item.audience : parent?.audience }, shown.attrs ?? []);
  // De la misma sección: otros productos de ese negocio, sin las variantes de este.
  const familyId = parentId ?? item.id;
  const sectionName = item.section || parent?.section;
  const family = sectionName ? all.filter((i) => !i.parent_id && i.id !== familyId && i.section === sectionName).slice(0, 8) : [];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const send = (message: string) => {
    setAsking(null);
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    track('contact_started', b.id);
    // La tarjeta del producto viaja con el mensaje: el negocio sabe por cuál le preguntan.
    const priced = item.price != null ? item : shown;
    const card = chatItemParam({
      id: item.id,
      name: askName,
      price: priced.price ?? null,
      price_from: Boolean(priced.price_from),
      ...(photos[0] ? { photo: photos[0] } : {}),
      ...(item.section || parent?.section ? { section: item.section || parent?.section } : {}),
    });
    router.push({ pathname: '/chat/[entityId]', params: { entityId: b.id, name: b.name, avatar: b.profile_url, draft: message, item: card } });
  };

  return (
    <SheetFrame expanded={expanded} onClose={close} onToggle={toggle}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        scrollEventThrottle={64}
        onScroll={(e) => {
          if (!expanded && e.nativeEvent.contentOffset.y > 24) setExpanded(true);
        }}
      >
        {photos.length ? (
        <View style={{ height: GALLERY_H }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>
            {photos.map((id, i) => (
              <Pressable key={id} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${i + 1} de ${photos.length}. Ver en grande`} onPress={() => setViewer(i)}>
                <Image source={{ uri: mediaUrl(id) }} style={{ width, height: GALLERY_H }} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </ScrollView>
          {photos.length > 1 ? (
            <>
              <View style={styles.counter}>
                <Text style={styles.counterText}>
                  {page + 1} / {photos.length}
                </Text>
              </View>
              <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {photos.map((id, i) => (
                  <View key={id} style={[styles.dot, i === page && styles.dotOn]} />
                ))}
              </View>
            </>
          ) : null}
        </View>
        ) : null}

        <View style={styles.body}>
          <View style={[styles.head, !photos.length && styles.headFlat]}>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            <View style={styles.titleRow}>
              {photos.length ? null : <Cover category={b.category?.name} icon={b.category?.icon} iconName={icon} iconSize={30} style={styles.thumb} />}
              <Text style={styles.name}>{title}</Text>
              <Text style={price ? styles.price : styles.consult}>{price ?? 'Consultar'}</Text>
            </View>
            {shown.sold_out || shown.fresh || item.duration_min ? (
              <View style={styles.facts}>
                {shown.sold_out ? <Fact icon="alert-circle-outline" text="Agotado por ahora" /> : null}
                {item.duration_min ? <Fact icon="time-outline" text={`${item.duration_min} min`} /> : null}
                {item.bookable ? <Fact icon="calendar-outline" text="Se puede reservar" /> : null}
                {!shown.sold_out && shown.fresh ? <Fact icon="checkmark" text="Precio al día" /> : null}
              </View>
            ) : null}
          </View>

          {attrOpts.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              {attrOpts.map((g) => {
                const current = (shown.attrs ?? []).find((a) => a.name.toLowerCase() === g.name.toLowerCase())?.value;
                return (
                  <View key={g.name} style={{ gap: spacing.sm }}>
                    <View style={styles.sizeRow}>
                      <Text style={styles.label}>
                        {g.name}
                        {current ? ` · ${current}` : ''}
                      </Text>
                      {g.name.toLowerCase() === 'talla' && mySize && current !== mySize && g.values.some((v) => v.value.toUpperCase() === mySize.toUpperCase()) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Elegir tu talla ${mySize}`}
                          onPress={() => {
                            const v = g.values.find((x) => x.value.toUpperCase() === mySize.toUpperCase())!;
                            const next = pickVariant(options, shown, g.name, v.value);
                            if (next) setSelected(next.id);
                          }}
                          style={styles.mySize}
                        >
                          <Text style={styles.mySizeText}>Tu talla {mySize} ›</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={g.name}>
                      {g.values.map((v) => {
                        const on = v.value === current;
                        return (
                          <Pressable
                            key={v.value}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                            accessibilityLabel={`${g.name} ${v.value}${v.available ? '' : ', agotado'}`}
                            onPress={() => {
                              const next = pickVariant(options, shown, g.name, v.value);
                              if (next) setSelected(next.id);
                            }}
                            style={[styles.option, on && styles.optionOn, !v.available && !on && styles.optionOut]}
                          >
                            <Text style={[styles.optionText, !v.available && !on && styles.optionTextOut]}>{v.value}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {shown.sold_out ? <Text style={styles.meta}>Esta combinación está agotada.</Text> : null}
            </View>
          ) : options.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Opciones</Text>
              <View style={styles.options} accessibilityRole="radiogroup">
                {options.map((o) => {
                  const on = o.id === shown.id;
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${o.variant_label ?? o.name}${o.sold_out ? ', agotado' : ''}`}
                      onPress={() => setSelected(o.id)}
                      style={[styles.option, on && styles.optionOn, o.sold_out && styles.optionOut]}
                    >
                      <Text style={[styles.optionText, o.sold_out && styles.optionTextOut]}>{o.variant_label ?? o.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {options.some((o) => o.sold_out) ? (
                <Text style={styles.meta}>
                  Agotado: {options.filter((o) => o.sold_out).map((o) => o.variant_label ?? o.name).join(', ')}
                </Text>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Descripción</Text>
              <Text style={styles.desc}>{description}</Text>
            </View>
          ) : null}
          {isOwner && terms.length >= 2 ? (
            <View style={styles.terms}>
              <Text style={styles.label}>Así lo encuentran en Empre</Text>
              <View style={styles.termRow}>
                {terms.map((t) => (
                  <Text key={t} style={styles.term}>
                    {t}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {family.length ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>De la misma sección</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyRow}>
                {family.map((f) => {
                  const ph = f.photos?.[0];
                  const fp = priceText(f);
                  return (
                    <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={[f.name, fp].filter(Boolean).join(', ')} onPress={() => setSelected(f.id)} style={styles.familyCard}>
                      {ph ? <Image source={{ uri: mediaUrl(ph) }} style={styles.familyImg} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[styles.familyImg, styles.familyNoImg]}><Ionicons name={icon} size={22} color={colors.muted} /></View>}
                      <Text style={styles.familyName} numberOfLines={2}>
                        {f.name}
                      </Text>
                      {fp ? <Text style={styles.familyPrice}>{fp}</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <Pressable accessibilityRole="link" accessibilityLabel={`Vendido por ${b.name}. Ver el negocio`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })} style={styles.seller}>
            <Avatar uri={b.profile_url} name={b.name} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sellerLabel}>Vendido por</Text>
              <Text style={styles.sellerName} numberOfLines={1}>
                {b.name}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {canCall && !isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Llamar a ${b.name}`} onPress={() => void Linking.openURL(`tel:${contact!.replace(/[^\d+]/g, '')}`)} style={styles.call}>
            <Ionicons name="call-outline" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        {isOwner ? (
          <Button title="Editar" onPress={() => router.push({ pathname: '/business/products/item', params: { entityId: b.id, itemId: item.id } })} style={{ flex: 1 }} />
        ) : canBook ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={`Preguntar por ${askName}`} onPress={() => setAsking(askName)} style={styles.call}>
              <Ionicons name="chatbubble-outline" size={22} color={colors.ink} />
            </Pressable>
            <Button title={agenda.data?.next_slot ? `Reservar · ${nextSlotLabel(agenda.data.next_slot)}` : 'Reservar'} onPress={() => (status === 'signedIn' ? setBooking(true) : router.push('/(auth)/login'))} style={{ flex: 1 }} />
          </>
        ) : (
          <Button title={copy.kind === 'service' ? 'Preguntar por este servicio' : 'Preguntar por este producto'} onPress={() => setAsking(askName)} style={{ flex: 1 }} />
        )}
      </View>

      <AskSheet item={asking} businessName={b.name} copy={copy} onClose={() => setAsking(null)} onSend={send} />
      <PhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} />
      {canBook && agenda.data ? (
        <BookingSheet
          visible={booking}
          entityId={b.id}
          entityName={b.name}
          summary={agenda.data}
          initialServiceId={item.id}
          onClose={() => setBooking(false)}
          onBooked={(a) => {
            setBooking(false);
            router.push({ pathname: '/appointment/[id]', params: { id: a.id } });
          }}
        />
      ) : null}
    </SheetFrame>
  );
}

/** Las fotos a pantalla completa, para deslizar. */
function PhotoViewer({ photos, start, onClose }: { photos: string[]; start: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ref = useRef<ScrollView>(null);
  if (start === null) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={() => ref.current?.scrollTo({ x: start * width, animated: false })}
        >
          {photos.map((id) => (
            <Image key={id} source={{ uri: mediaUrl(id) }} style={{ width, height }} contentFit="contain" />
          ))}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={[styles.round, { top: insets.top + spacing.sm, right: spacing.lg }]}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43,38,34,0.32)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: colors.bg },
  grabberHit: { height: 22, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  close: { position: 'absolute', top: 8, right: 12, zIndex: 2, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,254,251,0.92)' },
  headFlat: { marginTop: 0, paddingRight: 52 },
  thumb: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  round: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(22,35,58,0.72)', justifyContent: 'center' },
  counterText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  dots: { position: 'absolute', bottom: 20, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  head: { gap: 8, padding: 16, marginTop: -28, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.selectedSoft },
  factText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  seller: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  sellerLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  sellerName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  name: { flex: 1, fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  price: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  consult: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: 4 },
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 48, minHeight: 42, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionOut: { backgroundColor: colors.well, borderColor: colors.well },
  optionText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  optionTextOut: { color: '#9AA8BA', textDecorationLine: 'line-through' },
  desc: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: '#33445C' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  call: { width: 54, height: 54, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#000' },
  terms: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.well },
  termRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  term: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink, overflow: 'hidden' },
  familyRow: { gap: 10 },
  familyCard: { width: 130, gap: 4 },
  familyImg: { width: 130, height: 130, borderRadius: 14, backgroundColor: colors.well },
  familyNoImg: { alignItems: 'center', justifyContent: 'center' },
  familyName: { fontSize: 13, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.ink },
  familyPrice: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mySize: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.primarySoft },
  mySizeText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
});
