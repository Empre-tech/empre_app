import { Ionicons } from '@/components/Icon';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveImageUrl } from '@/lib/image';
import type { Pill } from '@/lib/discover';
import { PhotoGallery } from './PhotoGallery';
import { colors, fonts, radius, spacing } from '@/theme';

/** Lo que necesita cualquier tarjeta o fila del panel, venga de discovery o de Descubre. */
export interface CardModel {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Foto de perfil (filas y tarjetas compactas). */
  image?: string | null;
  /** Portada (tarjetas de Descubre). Sin portada sale el círculo con el icono. */
  cover?: string | null;
  color: { bg: string; fg: string };
  icon: string;
  /** true/false si tiene horario; null si no lo configuró. */
  open: boolean | null;
  distance: string | null;
  sub: string;
  /** Tercera línea: motivo de coincidencia, frase corta o «Abierto · hasta…». */
  line?: string;
  pill?: Pill | null;
  /** Tiene un QR activo del usuario: la pastilla pasa a verde. */
  mine?: boolean;
  /** Distancia destacada: solo los resultados más cercanos de una búsqueda (F11). */
  nearChip?: string | null;
  /** Resultado lejano (más allá del radio cercano): va aparte, bajo «Más lejos». */
  far?: boolean;
  /** Calificación promedio y cantidad de reseñas (ficha de «En esta zona»). */
  rating?: number | null;
  reviews?: number;
  /** Frase corta del negocio. */
  tagline?: string;
  /** La reseña verificada más reciente, ya en cita y firma (destacados). Manda sobre la frase corta. */
  review?: { quote: string; byline: string };
  /** Zona del negocio cuando es un adicional (cerca, fuera de tu zona). */
  zoneLabel?: string | null;
  /** Fotos recientes del negocio (hasta 4, sin videos) y cuántas tiene en total (3.22). */
  photos?: string[];
  photosCount?: number;
}

function NearChip({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.nearChip} accessible={false}>
      <Text style={styles.nearChipText}>{text}</Text>
    </View>
  );
}

function Circle({ model, size }: { model: CardModel; size: number }) {
  const src = model.image ? resolveImageUrl(model.image) : null;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: model.color.fg }]}>
      {src ? (
        <Image accessible={false} source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
      ) : (
        <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={size * 0.46} color="#fff" />
      )}
    </View>
  );
}

/** Pastilla única: ⚡ y el tiempo de la oferta, «Nuevo · hace 2 h», o «Tu QR». Nunca una cantidad. */
export function PillView({ pill, mine, floating }: { pill?: Pill | null; mine?: boolean; floating?: boolean }) {
  if (mine) {
    return (
      <View style={[styles.pill, styles.pillMine, floating && styles.pillFloating]}>
        <Ionicons name="qr-code" size={11} color="#1D6B3D" />
        <Text style={[styles.pillText, styles.pillTextMine]}>Tu QR</Text>
      </View>
    );
  }
  if (!pill) return null;
  const offer = pill.kind === 'offer';
  return (
    <View style={[styles.pill, offer ? styles.pillOffer : styles.pillNew, floating && styles.pillFloating]}>
      {offer ? <Ionicons name="flash" size={11} color={colors.ink} /> : null}
      <Text style={[styles.pillText, !offer && styles.pillTextNew]}>{pill.text}</Text>
    </View>
  );
}

function StatusText({ open }: { open: boolean | null }) {
  if (open === null) return null;
  // Abierto: el punto rojo dice que está vivo; la palabra va en tinta (el rojo es acento, no un texto que pese).
  return open ? (
    <Text style={styles.open}>
      <Text style={styles.openDot}>● </Text>Abierto
    </Text>
  ) : (
    <Text style={styles.closed}>Cerrado</Text>
  );
}

/**
 * Tarjeta de Descubre: sus fotos subidas (la grande y dos pequeñas, 3.22); sin fotos, la portada o el círculo con el
 * icono; una sola razón y nada más. Tocar una foto abre el visor; el resto de la tarjeta selecciona el negocio.
 */
export function DiscoverCard({ model, selected, onPress, onPhoto }: { model: CardModel; selected?: boolean; onPress: () => void; onPhoto?: (index: number) => void }) {
  const cover = model.cover ? resolveImageUrl(model.cover) : null;
  const label = [model.name, model.sub, model.distance, model.pill?.text, model.line].filter(Boolean).join(', ');
  const text = (
    <View style={styles.dcText}>
      <Text style={styles.dcName} numberOfLines={1}>
        {model.name}
      </Text>
      <Text style={styles.dcMeta} numberOfLines={1}>
        {[model.sub, model.distance].filter(Boolean).join(' · ')}
      </Text>
      {model.line ? (
        <Text style={[styles.dcMeta, model.line.startsWith('Abierto') && styles.open]} numberOfLines={1}>
          {model.line}
        </Text>
      ) : null}
    </View>
  );
  if (onPhoto && model.photos?.length) {
    return (
      <View style={styles.dcard}>
        <View style={[styles.galleryWrap, selected && styles.coverSelected]}>
          <PhotoGallery name={model.name} photos={model.photos} photosCount={model.photosCount} color={model.color.bg} height={112} onPhoto={onPhoto}>
            <PillView pill={model.pill} mine={model.mine} />
          </PhotoGallery>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.dcTextPress, pressed && styles.pressed]}>
          {text}
        </Pressable>
      </View>
    );
  }
  if (!cover) {
    // Sin fotos ni portada: el tono suave de la categoría con su icono (3.24): se nota que falta la foto sin parecer roto.
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.dcard, pressed && styles.pressed]}>
        <View style={[styles.cover, styles.noPhoto, { backgroundColor: model.color.bg }, selected && styles.coverSelected]}>
          <View style={[styles.noPhotoIcon, { backgroundColor: model.color.fg }]}>
            <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
          </View>
          <Text style={styles.noPhotoText}>Sin fotos todavía</Text>
          <View style={styles.pillTop}>
            <PillView pill={model.pill} mine={model.mine} />
          </View>
        </View>
        {text}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.dcard, pressed && styles.pressed]}>
      <View style={[styles.cover, { backgroundColor: model.color.bg }, selected && styles.coverSelected]}>
        <Image accessible={false} source={{ uri: cover }} style={styles.coverImage} contentFit="cover" transition={250} cachePolicy="memory-disk" />
        <PillView pill={model.pill} mine={model.mine} floating />
      </View>
      {text}
    </Pressable>
  );
}

/** Tarjeta compacta (intermedio de Todos y de resultados): círculo, pastilla, nombre y estado. */
export function MiniCard({ model, selected, onPress }: { model: CardModel; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[model.name, model.distance, model.line].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.mini, model.nearChip ? styles.nearBorder : null, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.dcTop}>
        <Circle model={model} size={40} />
        <View style={styles.topRight}>
          <NearChip text={model.nearChip} />
          <PillView pill={model.pill} mine={model.mine} />
        </View>
      </View>
      <Text style={styles.dcName} numberOfLines={1}>
        {model.name}
      </Text>
      <Text style={styles.dcMeta} numberOfLines={1}>
        <StatusText open={model.open} />
        {model.open !== null && model.distance ? ' · ' : ''}
        {model.distance ?? ''}
      </Text>
      <Text style={[styles.dcMeta, model.line ? styles.why : null]} numberOfLines={1}>
        {model.line || model.sub}
      </Text>
    </Pressable>
  );
}

/** Fila del panel expandido: círculo, nombre, estado · subcategoría · distancia, motivo y pastilla. */
/**
 * Fila de un negocio, como en Google Maps (2026-11-14): el nombre; nota · tipo · a pie; «● Abierto · hasta…» una sola
 * vez; su frase o la reseña más reciente; y una tira de hasta 3 fotos suyas (tocar una abre el visor). Sin el círculo de
 * color: las fotos son la imagen del negocio. Con número, el mismo del pin del mapa.
 */
export function MiniRow({
  model,
  selected,
  onPress,
  rank,
  onPhoto,
}: {
  model: CardModel;
  selected?: boolean;
  onPress: () => void;
  /** El número del pin (búsqueda). */
  rank?: number;
  /** Tocar una foto abre el visor. */
  onPhoto?: (index: number) => void;
}) {
  const photos = (model.photos ?? []).slice(0, 3);
  const statusLine = model.line && /^(Abierto|Cerrado)/.test(model.line) ? model.line : null;
  const reason = statusLine ? null : model.line;
  const stars = model.rating && model.reviews ? `★ ${model.rating.toFixed(1)} (${model.reviews})` : null;
  const meta = [stars, model.sub, model.distance].filter(Boolean).join(' · ');
  const openNow = statusLine ? statusLine.startsWith('Abierto') : model.open === true;
  const status = statusLine ?? (model.open === null ? null : model.open ? 'Abierto' : 'Cerrado');
  const about = model.review?.quote ?? model.tagline ?? reason ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[rank ? `${rank}.` : null, model.name, stars, model.sub, model.distance, status, about].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.place, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.placeHead}>
        {rank ? (
          <View style={styles.rank}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        ) : null}
        <Text style={styles.placeName} numberOfLines={1}>
          {model.name}
        </Text>
        <PillView pill={model.pill} mine={model.mine} />
      </View>
      {meta ? (
        <Text style={styles.dcMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {status ? (
        <Text style={[styles.dcMeta, openNow ? styles.open : null]} numberOfLines={1}>
          {openNow ? <Text style={styles.openDot}>● </Text> : null}
          {status}
        </Text>
      ) : null}
      {about ? (
        <Text style={styles.about} numberOfLines={1}>
          {about}
        </Text>
      ) : null}
      {photos.length ? (
        <View style={styles.photoRow}>
          {photos.map((ph, i) => (
            <Pressable key={ph} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${i + 1} de ${model.name}`} onPress={() => (onPhoto ? onPhoto(i) : onPress())} style={styles.photoHit}>
              <Image accessible={false} source={{ uri: resolveImageUrl(ph) ?? ph }} style={styles.photo} contentFit="cover" transition={200} cachePolicy="memory-disk" recyclingKey={ph} />
            </Pressable>
          ))}
          {photos.length < 3 ? Array.from({ length: 3 - photos.length }, (_, i) => <View key={`v${i}`} style={styles.photoHit} />) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  place: { paddingVertical: 12, paddingHorizontal: spacing.lg, gap: 3, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  placeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeName: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, fontFamily: fonts.ui.semibold, color: colors.ink },
  about: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  photoRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  photoHit: { flex: 1 },
  photo: { width: '100%', height: 84, borderRadius: 12, backgroundColor: colors.sandSoft },
  rank: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  rankText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 9, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillFloating: { position: 'absolute', left: 8, bottom: 8 },
  pillOffer: { backgroundColor: colors.accent },
  pillNew: { backgroundColor: colors.sand },
  pillMine: { backgroundColor: '#FDECEC' },
  pillText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pillTextNew: { color: colors.ink },
  pillTextMine: { color: '#D42020' },
  open: { color: colors.ink, fontFamily: fonts.ui.semibold },
  openDot: { color: colors.brand, fontSize: 9 },
  closed: { color: '#9B2C2C', fontFamily: fonts.ui.bold },
  why: { color: colors.muted },
  pressed: { opacity: 0.85 },
  nearChip: { height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.sandSoft, justifyContent: 'center' },
  nearChipText: { fontSize: 11, fontFamily: fonts.ui.semibold, color: colors.ink },
  nearBorder: { borderColor: colors.primary },
  topRight: { alignItems: 'flex-end', gap: 4 },
  selected: { borderColor: colors.primary, borderWidth: 1.5 },
  dcard: { width: 216 },
  dcTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cover: { height: 112, borderRadius: radius.lg, overflow: 'hidden' },
  coverSelected: { borderWidth: 3, borderColor: colors.primary },
  coverImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  galleryWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  noPhoto: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md },
  noPhotoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { paddingBottom: 10, fontSize: 12, fontFamily: fonts.ui.semibold, fontStyle: 'italic', color: colors.muted },
  pillTop: { position: 'absolute', left: 8, top: 8 },
  dcTextPress: { minHeight: 44 },
  dcText: { paddingTop: spacing.sm, paddingHorizontal: 2, gap: 1 },
  dcName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dcMeta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  mini: { width: 168, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, gap: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, marginHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'transparent' },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
