import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { track } from '@/analytics/track';
import { Button } from '@/components/Button';
import { AskSheet } from '@/components/profile/AskSheet';
import { audienceText, catalogCopy, priceText } from '@/lib/catalog';
import { chatItemParam } from '@/lib/chatItem';
import { categoryColor } from '@/lib/categoryColor';
import { safeIcon } from '@/lib/icons';
import { mediaUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { colors, fonts, radius, spacing } from '@/theme';

const PHONE_RE = /^[+\d\s()-]{7,}$/;
const GALLERY_H = 360;

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
  const { status } = useAuth();
  const [selected, setSelected] = useState(itemId ?? '');
  const [page, setPage] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const catalog = useQuery({ queryKey: ['catalog', entityId, 'sections'], queryFn: () => catalogApi.listWithSections(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const all = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const item = all.find((i) => i.id === selected);
  // Un producto con variantes se muestra con sus opciones; una variante, con las de su producto.
  const parentId = item?.parent_id ?? (all.some((i) => i.parent_id === item?.id) ? item?.id : undefined);
  const parent = parentId ? all.find((i) => i.id === parentId) : undefined;
  const options = parentId ? all.filter((i) => i.parent_id === parentId) : [];
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);

  if (catalog.isLoading || business.isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      </View>
    );
  }
  if (!item || !business.data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md }]}>
        <Text style={styles.name}>Este producto ya no está</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
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
  const cat = categoryColor(b.category?.color);
  const description = item.description || parent?.description;
  const contact = b.contact_info?.trim();
  const canCall = Boolean(contact && PHONE_RE.test(contact));
  const askName = parent && item.variant_label ? `${parent.name} (${item.variant_label})` : item.name;

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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ height: GALLERY_H + insets.top, backgroundColor: photos.length ? colors.bg : cat.bg }}>
          {photos.length ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ marginTop: 0 }}>
              {photos.map((id, i) => (
                <Pressable key={id} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${i + 1} de ${photos.length}. Ver en grande`} onPress={() => setViewer(i)}>
                  <Image source={{ uri: mediaUrl(id) }} style={{ width, height: GALLERY_H + insets.top }} contentFit="cover" transition={150} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noPhoto}>
              <Ionicons name={icon} size={72} color={cat.fg} />
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={[styles.round, { top: insets.top + spacing.sm, left: spacing.lg }]}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
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

        <View style={styles.body}>
          <View style={{ gap: 4 }}>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            <View style={styles.titleRow}>
              <Text style={styles.name}>{title}</Text>
              <Text style={price ? styles.price : styles.consult}>{price ?? 'Consultar'}</Text>
            </View>
            {shown.sold_out ? (
              <Text style={[styles.state, { color: colors.danger }]}>Agotado por ahora</Text>
            ) : shown.fresh ? (
              <Text style={[styles.state, { color: colors.success }]}>Precio actualizado</Text>
            ) : null}
            {item.duration_min ? (
              <Text style={styles.meta}>
                Dura {item.duration_min} min{item.bookable ? ' · se puede reservar' : ''}
              </Text>
            ) : null}
          </View>

          {options.length > 0 ? (
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
          <Text style={styles.meta}>Vendido por {b.name}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {canCall ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Llamar a ${b.name}`} onPress={() => void Linking.openURL(`tel:${contact!.replace(/[^\d+]/g, '')}`)} style={styles.call}>
            <Ionicons name="call-outline" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <Button title={copy.kind === 'service' ? 'Preguntar por este servicio' : 'Preguntar por este producto'} onPress={() => setAsking(askName)} style={{ flex: 1 }} />
      </View>

      <AskSheet item={asking} businessName={b.name} copy={copy} onClose={() => setAsking(null)} onSend={send} />
      <PhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} />
    </View>
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
  screen: { flex: 1, backgroundColor: colors.surface },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  round: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(22,35,58,0.72)', justifyContent: 'center' },
  counterText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  dots: { position: 'absolute', bottom: 20, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  body: { padding: spacing.lg, gap: spacing.lg },
  meta: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  name: { flex: 1, fontSize: 22, lineHeight: 28, fontFamily: fonts.display.bold, color: colors.ink },
  price: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  consult: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: 4 },
  state: { fontSize: 13.5, fontFamily: fonts.ui.extrabold },
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 48, minHeight: 42, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  optionOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  optionOut: { backgroundColor: colors.bg, borderColor: colors.bg },
  optionText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  optionTextOut: { color: '#9AA8BA', textDecorationLine: 'line-through' },
  desc: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: '#33445C' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  call: { width: 54, height: 54, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#000' },
});
