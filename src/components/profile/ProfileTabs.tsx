import { Ionicons } from '@/components/Icon';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Photo } from '@/api/types';
import { priceText, type CatalogCopy, type ServiceItem } from '@/lib/catalog';
import { SkeletonBlock } from '@/components/Skeleton';
import { mediaUrl, resolveImageUrl } from '@/lib/image';
import { itemTab, photoPeriods, profileTabs, type ProfileTabId } from '@/lib/profileTabs';
import { colors, fonts, typeScale } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Cuántos cuadros se ven por pestaña; el resto, en «Ver los N» (catálogo completo o todas las fotos). */
const MAX_CELLS = 12;
const MAX_PHOTOS = 30;
const SIDE = 16;
const GAP = 6;

interface Props {
  /** El catálogo público (sin variantes sueltas). */
  items: ServiceItem[];
  /** Las fotos del negocio, en el orden del visor. */
  photos: Photo[];
  copy: CatalogCopy;
  isOwner: boolean;
  /** Mientras llega el catálogo: la barra y la cuadrícula en gris, para que nada salte al llegar. */
  loading?: boolean;
  /** La pestaña elegida (la puede poner el índice rápido); null = la primera. */
  tab: ProfileTabId | null;
  onTab: (tab: ProfileTabId) => void;
  onOpenItem: (item: ServiceItem) => void;
  onOpenPhoto: (index: number) => void;
  /** «Buscar y filtrar» y «Ver los N»: el catálogo completo. */
  onSearch: () => void;
  onAllPhotos: () => void;
  /** Solo el dueño: sumar un ítem o arreglar uno sin foto. */
  onAddItem?: (kind: 'service' | 'product') => void;
  onEditItem?: (item: ServiceItem) => void;
  /** Solo estas pestañas (el apartado Catálogo muestra Productos y Servicios; el de Fotos, solo las fotos). */
  only?: ProfileTabId[];
}

/**
 * Lo que ofrece el negocio, en pestañas como en Instagram (lienzo v115): Servicios, Productos y Fotos por separado, en
 * cuadrícula de tres. Solo salen las pestañas que tienen algo; con una sola, no hay barra. Fotos es su trayectoria:
 * círculos para cada momento y la cuadrícula por mes (este año) o por año, lo más nuevo arriba.
 */
export function ProfileTabs({ items, photos, copy, isOwner, loading, tab, onTab, onOpenItem, onOpenPhoto, onSearch, onAllPhotos, onAddItem, onEditItem, only }: Props) {
  const { width } = useWindowDimensions();
  const cell = (width - SIDE * 2 - GAP * 2) / 3;
  if (loading) {
    return (
      <View style={styles.wrap} accessible accessibilityLabel="Cargando lo que ofrece">
        <View style={[styles.bar, styles.barLoading]}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} width={84} height={16} borderRadius={8} />
          ))}
        </View>
        <View style={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} width={cell} height={cell} borderRadius={12} />
          ))}
        </View>
      </View>
    );
  }
  const services = items.filter((it) => itemTab(it, copy.kind) === 'services');
  const products = items.filter((it) => itemTab(it, copy.kind) === 'products');
  const tabs = profileTabs({ services: services.length, products: products.length, photos: photos.length, noun: copy.noun, sells: copy.kind }).filter((t) => !only || only.includes(t.id));
  if (!tabs.length) return null;
  const active = tabs.find((t) => t.id === tab)?.id ?? tabs[0].id;
  const iconOf = (id: ProfileTabId): IconName => (id === 'photos' ? 'grid-outline' : id === 'services' ? 'today-outline' : copy.kind === 'food' ? 'restaurant-outline' : 'bag-handle-outline');

  return (
    <View style={styles.wrap}>
      {tabs.length > 1 ? (
        <View style={styles.bar} accessibilityRole="tablist">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}, ${t.count}`}
                onPress={() => onTab(t.id)}
                style={styles.tab}
              >
                <Ionicons name={iconOf(t.id)} size={18} color={on ? colors.ink : colors.muted} />
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.tabCount}>{t.count}</Text>
                {on ? <View style={styles.tabLine} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {active === 'photos' ? (
        <PhotosTimeline photos={photos} cell={(width - 4) / 3} onOpenPhoto={onOpenPhoto} onAll={onAllPhotos} />
      ) : (
        <CatalogGrid
          list={active === 'services' ? services : products}
          kind={active === 'services' ? 'service' : 'product'}
          copy={copy}
          cell={cell}
          isOwner={isOwner}
          onOpenItem={onOpenItem}
          onSearch={onSearch}
          onAddItem={onAddItem}
          onEditItem={onEditItem}
        />
      )}
    </View>
  );
}

/** «Cortes, barba y más»: las secciones de lo que hay, para saber de un vistazo qué ofrece. */
function sectionsLine(list: ServiceItem[]): string | null {
  const names = [...new Set(list.map((it) => it.section?.trim()).filter((s): s is string => Boolean(s)))];
  if (!names.length) return null;
  const lower = (s: string) => s.charAt(0).toLocaleLowerCase('es') + s.slice(1);
  return names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} y ${lower(names[1])}` : `${names[0]}, ${lower(names[1])} y más`;
}

function CatalogGrid({
  list,
  kind,
  copy,
  cell,
  isOwner,
  onOpenItem,
  onSearch,
  onAddItem,
  onEditItem,
}: {
  list: ServiceItem[];
  kind: 'service' | 'product';
  copy: CatalogCopy;
  cell: number;
  isOwner: boolean;
  onOpenItem: (item: ServiceItem) => void;
  onSearch: () => void;
  onAddItem?: (kind: 'service' | 'product') => void;
  onEditItem?: (item: ServiceItem) => void;
}) {
  // Para quien visita, lo que no tiene foto va en una lista corta debajo; el dueño lo ve en la cuadrícula para arreglarlo.
  const withPhoto = isOwner ? list : list.filter((it) => it.photos?.length);
  const noPhoto = isOwner ? [] : list.filter((it) => !it.photos?.length);
  const shown = withPhoto.slice(0, MAX_CELLS - (isOwner && onAddItem ? 1 : 0));
  const more = withPhoto.length - shown.length;
  const line = sectionsLine(list);
  return (
    <View style={styles.catalog}>
      <View style={styles.head}>
        <Text style={styles.headText} numberOfLines={1}>
          {line ?? `${list.length} ${list.length === 1 ? copy.one : copy.plural}`}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar y filtrar en el catálogo" onPress={onSearch} hitSlop={8} style={styles.search}>
          <Ionicons name="search-outline" size={15} color={colors.ink} />
          <Text style={styles.searchText}>Buscar y filtrar</Text>
        </Pressable>
      </View>
      {shown.length || (isOwner && onAddItem) ? (
        <View style={styles.grid}>
          {isOwner && onAddItem ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Subir un ${kind === 'service' ? 'servicio' : 'producto'}`} onPress={() => onAddItem(kind)} style={{ width: cell }}>
              <View style={[styles.add, { width: cell, height: cell }]}>
                <View style={styles.addPlus}>
                  <Ionicons name="add" size={18} color={colors.ink} />
                </View>
              </View>
              <Text style={styles.cellName} numberOfLines={1}>
                {kind === 'service' ? 'Sube un servicio' : 'Sube un producto'}
              </Text>
            </Pressable>
          ) : null}
          {shown.map((it) => {
            const cover = it.photos?.[0];
            const price = it.sold_out ? 'Agotado' : (priceText(it) ?? 'Consultar');
            return (
              <Pressable
                key={it.id}
                accessibilityRole="button"
                accessibilityLabel={`${it.name}. ${price}${!cover && isOwner ? '. Falta la foto' : ''}`}
                onPress={() => (!cover && isOwner && onEditItem ? onEditItem(it) : onOpenItem(it))}
                style={({ pressed }) => [{ width: cell }, pressed && { opacity: 0.85 }]}
              >
                {cover ? (
                  <Image accessible={false} source={{ uri: mediaUrl(cover) }} style={[styles.cellImage, { width: cell, height: cell }]} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.noPhoto, { width: cell, height: cell }]}>
                    <Ionicons name="camera-outline" size={22} color={colors.muted} />
                    <Text style={styles.noPhotoText}>Falta la foto</Text>
                  </View>
                )}
                <Text style={styles.cellName} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text style={[styles.cellPrice, it.sold_out && styles.cellMuted]} numberOfLines={1}>
                  {price}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {noPhoto.length ? (
        <View style={styles.rows}>
          {noPhoto.slice(0, 4).map((it, i) => (
            <Pressable key={it.id} accessibilityRole="button" onPress={() => onOpenItem(it)} style={[styles.row, i > 0 && styles.rowLine]}>
              <Text style={styles.rowName} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={styles.rowPrice}>{it.sold_out ? 'Agotado' : (priceText(it) ?? 'Consultar')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {more > 0 || noPhoto.length > 4 ? (
        <Pressable accessibilityRole="button" onPress={onSearch} style={styles.more}>
          <Text style={styles.moreText}>{`Ver los ${list.length}`}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PhotosTimeline({ photos, cell, onOpenPhoto, onAll }: { photos: Photo[]; cell: number; onOpenPhoto: (index: number) => void; onAll: () => void }) {
  const periods = photoPeriods(photos);
  // Hasta MAX_PHOTOS en total; los períodos que no caben quedan para «Ver las N fotos».
  const visible: { key: string; label: string; count: number; shown: (typeof periods)[number]['items'] }[] = [];
  let left = MAX_PHOTOS;
  for (const p of periods) {
    if (left <= 0) break;
    const shown = p.items.slice(0, left);
    left -= shown.length;
    visible.push({ key: p.key, label: p.label, count: p.items.length, shown });
  }
  const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;
  return (
    <View style={styles.photos}>
      {/* Los momentos: un círculo por período; al tocarlo se abre en su primera foto */}
      {periods.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moments}>
          {periods.map((p) => {
            const cover = p.items.find((x) => !isVideo(x.photo)) ?? p.items[0];
            return (
              <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`${p.label}: ${p.items.length} ${p.items.length === 1 ? 'foto' : 'fotos'}`} onPress={() => onOpenPhoto(cover.index)} style={styles.moment}>
                <View style={styles.momentRing}>
                  {isVideo(cover.photo) ? (
                    <View style={[styles.momentImage, styles.video]} />
                  ) : (
                    <Image accessible={false} source={{ uri: resolveImageUrl(cover.photo.url) ?? undefined }} style={styles.momentImage} contentFit="cover" cachePolicy="memory-disk" />
                  )}
                </View>
                <Text style={styles.momentLabel} numberOfLines={1}>
                  {p.label}
                </Text>
                <Text style={styles.momentSub}>{`${p.items.length} ${p.items.length === 1 ? 'foto' : 'fotos'}`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {visible.map((p) => {
        return (
          <View key={p.key} style={styles.period}>
            <View style={styles.periodHead}>
              <Text style={styles.periodLabel} accessibilityRole="header">
                {p.label}
              </Text>
              <Text style={styles.periodSub}>{`${p.count} ${p.count === 1 ? 'foto' : 'fotos'}`}</Text>
            </View>
            <View style={styles.photoGrid}>
              {p.shown.map(({ photo, index }) => (
                <Pressable key={photo.id} accessibilityRole="imagebutton" accessibilityLabel={photo.caption?.trim() || `Foto ${index + 1}`} onPress={() => onOpenPhoto(index)} style={{ width: cell, height: cell }}>
                  {isVideo(photo) ? (
                    <View style={[styles.photoCell, styles.video]}>
                      <Ionicons name="play" size={22} color="#FFFFFF" />
                    </View>
                  ) : (
                    <Image accessible={false} source={{ uri: resolveImageUrl(photo.url) ?? undefined }} style={styles.photoCell} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      {photos.length > MAX_PHOTOS ? (
        <Pressable accessibilityRole="button" onPress={onAll} style={[styles.more, { marginHorizontal: SIDE }]}>
          <Text style={styles.moreText}>{`Ver las ${photos.length} fotos`}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  bar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 4 },
  barLoading: { minHeight: 48, alignItems: 'center', justifyContent: 'space-around' },
  tab: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabText: { ...typeScale.body, flexShrink: 1, fontFamily: fonts.ui.semibold, color: colors.muted },
  tabTextOn: { color: colors.ink },
  tabCount: { ...typeScale.body, color: colors.muted },
  tabLine: { position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 1, backgroundColor: colors.ink },
  catalog: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: SIDE },
  headText: { ...typeScale.body, flexShrink: 1, color: colors.muted },
  search: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchText: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 12, paddingHorizontal: SIDE },
  cellImage: { borderRadius: 12, backgroundColor: colors.selectedSoft },
  cellName: { ...typeScale.label, marginTop: 4, color: colors.ink },
  cellPrice: { ...typeScale.label, color: colors.ink, fontVariant: ['tabular-nums'] },
  cellMuted: { fontFamily: fonts.ui.medium, color: colors.muted },
  add: { borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  addPlus: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  noPhoto: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.line },
  noPhotoText: { ...typeScale.label, color: colors.ink },
  rows: { marginHorizontal: SIDE, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowName: { ...typeScale.body, flexShrink: 1, fontFamily: fonts.ui.semibold, color: colors.ink },
  rowPrice: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  more: { minHeight: 46, marginHorizontal: SIDE, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.selectedSoft },
  moreText: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink },
  photos: { gap: 4 },
  moments: { gap: 12, paddingHorizontal: SIDE, paddingBottom: 8 },
  moment: { width: 68, alignItems: 'center' },
  momentRing: { width: 64, height: 64, borderRadius: 32, padding: 3, borderWidth: 1.5, borderColor: colors.line },
  momentImage: { flex: 1, borderRadius: 30, backgroundColor: colors.selectedSoft },
  momentLabel: { ...typeScale.label, marginTop: 6, color: colors.ink },
  momentSub: { ...typeScale.label, fontFamily: fonts.ui.medium, color: colors.muted },
  period: { gap: 6, paddingTop: 6 },
  periodHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: SIDE },
  periodLabel: { ...typeScale.title, color: colors.ink },
  periodSub: { ...typeScale.body, color: colors.muted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  photoCell: { flex: 1, backgroundColor: colors.selectedSoft },
  video: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night },
});
