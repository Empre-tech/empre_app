import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { Photo } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { isNewPhoto, photoSample, showMosaic } from '@/lib/profileLayout';
import { useNow } from '@/lib/useNow';
import { isVideoItem, type UploadItem } from '@/lib/uploadQueue';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  photos: Photo[];
  /** Color de la categoría: fondo de la celda de un video (no se reproducen aquí). */
  color?: string | null;
  isOwner: boolean;
  onOpenPhoto: (index: number) => void;
  onAll: () => void;
  /** El dueño sube una publicación nueva. */
  onNew: () => void;
  /** Lo que el dueño está subiendo a este negocio: aparece primero, con su progreso. */
  pending?: UploadItem[];
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
}

const GAP = 4;
const COLUMNS = 3;
const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;

/**
 * «Fotos» (3.27/3.28): cabecera como los demás apartados (título · cuántas · «Ver todas ›»). Para quien visita, con 6 o
 * más, un mosaico de 3 × 3: la más reciente grande (con «Nuevo» si es de las últimas 48 h y su texto) y 5 pequeñas, la
 * última con «+N». Si no, una cuadrícula pareja de 3 columnas. El dueño ve «+ Nueva» primero y lo que está subiendo.
 *
 * El ancho se mide en el contenedor de la cuadrícula (antes se medía la tarjeta sin su borde de 1 pt, la tercera celda
 * no cabía y quedaban 2 columnas con un hueco).
 */
export function PhotosSection({ photos, color, isOwner, onOpenPhoto, onAll, onNew, pending = [], onRetry, onRemove }: Props) {
  const [w, setW] = useState(0);
  const now = useNow(60_000);
  const sample = photoSample(photos.length, isOwner);
  const cat = categoryColor(color);
  if (!sample.show) return null;
  const size = w > 0 ? Math.floor((w - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  // Lo que sube ocupa las primeras celdas: la muestra sigue siendo de 6 en total.
  const shown = photos.slice(0, Math.max(0, sample.shown - pending.length));
  const extra = photos.length - shown.length;
  const mosaic = showMosaic({ count: photos.length, isOwner, uploading: pending.length });

  const tile = (p: Photo, i: number, side: number, big = false) => {
    const last = i === shown.length - 1 && extra > 0;
    const fresh = big && isNewPhoto(p.created_at, now);
    return (
      <Pressable
        key={p.id}
        accessibilityRole="button"
        accessibilityLabel={last ? `Ver las ${photos.length} fotos` : `${isVideo(p) ? 'Video' : 'Foto'} ${i + 1} de ${photos.length}${p.caption ? `: ${p.caption}` : ''}`}
        onPress={() => (last ? onAll() : onOpenPhoto(i))}
        style={[styles.cell, { width: side, height: side }, isVideo(p) && { backgroundColor: cat.fg }]}
      >
        {isVideo(p) ? (
          <View style={styles.videoFill}>
            <Ionicons name="play" size={big ? 30 : 24} color="rgba(255,255,255,0.95)" />
          </View>
        ) : (
          <Image accessible={false} source={{ uri: resolveImageUrl(p.url) ?? undefined }} style={styles.image} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        )}
        {fresh ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>Nuevo</Text>
          </View>
        ) : null}
        {big && p.caption ? (
          <View style={styles.caption}>
            <Text style={styles.captionText} numberOfLines={1}>
              {p.caption}
            </Text>
          </View>
        ) : null}
        {last ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>+{extra}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.headTitle} accessibilityRole="header">
          Fotos {photos.length > 0 ? <Text style={styles.headCount}>{photos.length}</Text> : null}
        </Text>
        {photos.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver las ${photos.length} fotos`} onPress={onAll} style={styles.headLink}>
            <Text style={styles.headLinkText}>Ver todas ›</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.block}>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {size > 0 && mosaic ? (
            <View style={styles.mosaic}>
              <View style={styles.mosaicTop}>
                {tile(shown[0], 0, size * 2 + GAP, true)}
                <View style={styles.mosaicSide}>
                  {tile(shown[1], 1, size)}
                  {tile(shown[2], 2, size)}
                </View>
              </View>
              <View style={styles.mosaicRow}>{shown.slice(3, 6).map((p, k) => tile(p, k + 3, size))}</View>
            </View>
          ) : size > 0 ? (
            <View style={styles.grid}>
              {isOwner ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Nueva publicación" onPress={onNew} style={[styles.cell, styles.newCell, { width: size, height: size }]}>
                  <Ionicons name="add" size={22} color={colors.primary} />
                  <Text style={styles.newText}>Nueva</Text>
                </Pressable>
              ) : null}
              {pending.map((u) => (
                <UploadTile key={u.id} item={u} size={size} onRetry={() => onRetry?.(u.id)} onRemove={() => onRemove?.(u.id)} />
              ))}
              {shown.map((p, i) => tile(p, i, size))}
            </View>
          ) : null}
        </View>
        {isOwner && photos.length < 5 ? <Text style={styles.hint}>Con 5 o más fotos tu perfil se ve más completo.</Text> : null}
      </View>
    </View>
  );
}

const RING = 46;
const STROKE = 4;
const R = (RING - STROKE) / 2;
const LEN = 2 * Math.PI * R;

/**
 * Una publicación que se está subiendo: la imagen elegida (o el color con ▶ si es video), apagada, con un anillo que se
 * llena y el porcentaje; al terminar, un ✓ verde hasta que llega la foto real; si falla, borde rojo con «Reintentar» y
 * «Quitar».
 */
function UploadTile({ item, size, onRetry, onRemove }: { item: UploadItem; size: number; onRetry: () => void; onRemove: () => void }) {
  const pct = Math.round(item.progress * 100);
  const failed = item.status === 'failed';
  const done = item.status === 'done';
  const label = failed ? `No se subió${item.error ? `: ${item.error}` : ''}` : done ? 'Publicada' : `Subiendo, ${pct} %`;
  return (
    <View style={[styles.cell, styles.uploadCell, { width: size, height: size }, failed && styles.uploadFailed]} accessible={!failed} accessibilityLabel={label}>
      {isVideoItem(item) ? <View style={[styles.videoFill, { backgroundColor: colors.ink }]} /> : <Image accessible={false} source={{ uri: item.uri }} style={styles.image} contentFit="cover" />}
      <View style={[styles.uploadVeil, done && styles.uploadVeilDone]}>
        {failed ? (
          <>
            <Text style={styles.failedText}>No se subió</Text>
            <View style={styles.failedRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Reintentar la subida" onPress={onRetry} style={styles.iconBtn}>
                <Ionicons name="refresh" size={18} color="#fff" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Quitar la publicación" onPress={onRemove} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : done ? (
          <Ionicons name="checkmark-circle" size={34} color="#fff" />
        ) : (
          <View style={styles.ringWrap}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke="rgba(255,255,255,0.35)" strokeWidth={STROKE} fill="none" />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={R}
                stroke="#fff"
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={LEN}
                strokeDashoffset={LEN * (1 - item.progress)}
                rotation={-90}
                origin={`${RING / 2}, ${RING / 2}`}
              />
            </Svg>
            <Text style={styles.ringText}>{pct}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  uploadCell: { backgroundColor: colors.ink },
  uploadFailed: { borderWidth: 2, borderColor: '#B3261E' },
  uploadVeil: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,20,40,0.55)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  uploadVeilDone: { backgroundColor: 'rgba(29,107,61,0.55)' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  failedText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  failedRow: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  headCount: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  headLink: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  headLinkText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  mosaic: { gap: GAP },
  mosaicTop: { flexDirection: 'row', gap: GAP },
  mosaicSide: { gap: GAP },
  mosaicRow: { flexDirection: 'row', gap: GAP },
  newBadge: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accent },
  newBadgeText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingTop: 16, paddingBottom: 6, backgroundColor: 'rgba(10,20,40,0.45)' },
  captionText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.primarySoft },
  image: { width: '100%', height: '100%' },
  videoFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,20,40,0.62)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, fontFamily: fonts.display.bold, color: '#fff' },
  newCell: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  newText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  hint: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: '#FFF4DC', fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#7A4B00' },
});
