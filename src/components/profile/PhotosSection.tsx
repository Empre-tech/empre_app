import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Photo } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { photosPlan } from '@/lib/profileLayout';
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
}

const GAP = 4;
const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;

/**
 * El mosaico de «Fotos»: muestra las que siguen a las de la portada (las 4 primeras): una ancha, dos medias, o una
 * grande con las pequeñas que haya; con 10 o más, la última lleva «+N» y abre «Todas las fotos». Con 4 o menos no
 * sale (la portada ya las cubre), salvo al dueño, que siempre tiene «+ Nueva».
 */
export function PhotosSection({ photos, color, isOwner, onOpenPhoto, onAll, onNew }: Props) {
  const [w, setW] = useState(0);
  const plan = photosPlan(photos.length);
  const rest = photos.slice(4);
  const cat = categoryColor(color);
  if (plan.mosaic === 'none' && !isOwner) return null;

  const quarter = w > 0 ? (w - GAP * 3) / 4 : 0;
  const half = w > 0 ? (w - GAP) / 2 : 0;

  const cell = (p: Photo, index: number, size: { width: number; height: number }, extra?: number) => (
    <Pressable
      key={p.id}
      accessibilityRole="button"
      accessibilityLabel={`${isVideo(p) ? 'Video' : 'Foto'}${p.caption ? `: ${p.caption}` : ''}${extra ? `. Ver ${extra} más` : ''}`}
      onPress={() => (extra ? onAll() : onOpenPhoto(index))}
      style={[styles.cell, size, isVideo(p) && { backgroundColor: cat.fg }]}
    >
      {isVideo(p) ? (
        <View style={styles.videoFill}>
          <Ionicons name="play" size={26} color="rgba(255,255,255,0.95)" />
        </View>
      ) : (
        <Image accessible={false} source={{ uri: resolveImageUrl(p.url) ?? undefined }} style={styles.image} contentFit="cover" transition={150} />
      )}
      {extra ? (
        <View style={styles.more}>
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  let cells: React.ReactNode = null;
  if (w > 0) {
    if (plan.mosaic === 'wide') cells = cell(rest[0], 4, { width: w, height: w / 1.6 });
    else if (plan.mosaic === 'half') cells = rest.slice(0, 2).map((p, i) => cell(p, 4 + i, { width: half, height: half }));
    else if (plan.mosaic === 'big') {
      const small = rest.slice(1, plan.cells);
      cells = (
        <>
          {cell(rest[0], 4, { width: quarter * 2 + GAP, height: quarter * 2 + GAP })}
          <View style={[styles.smallGrid, { width: quarter * 2 + GAP, height: quarter * 2 + GAP }]}>
            {small.map((p, i) => cell(p, 5 + i, { width: quarter, height: quarter }, i === small.length - 1 && plan.extra > 0 ? plan.extra : undefined))}
          </View>
        </>
      );
    }
  }

  return (
    <View style={styles.block} onLayout={(e) => setW(e.nativeEvent.layout.width - spacing.md * 2)}>
      <Text style={styles.title} accessibilityRole="header">
        Fotos
      </Text>
      <View style={styles.grid}>
        {isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Nueva publicación" onPress={onNew} style={[styles.cell, styles.newCell, { width: w > 0 ? quarter * 2 + GAP : 120, height: w > 0 ? quarter : 60 }]}>
            <Ionicons name="add" size={22} color={colors.primary} />
            <Text style={styles.newText}>Nueva</Text>
          </Pressable>
        ) : null}
        {cells}
      </View>
      {plan.mosaic !== 'none' ? (
        <Pressable accessibilityRole="button" onPress={onAll} style={styles.all}>
          <Text style={styles.allText}>Ver todas las fotos ›</Text>
        </Pressable>
      ) : null}
      {isOwner && photos.length < 5 ? <Text style={styles.hint}>Con 5 o más fotos tu perfil se ve más completo.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  smallGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignContent: 'flex-start' },
  cell: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.primarySoft },
  image: { width: '100%', height: '100%' },
  videoFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,20,40,0.62)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, fontFamily: fonts.display.bold, color: '#fff' },
  newCell: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  newText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  all: { minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  allText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hint: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: '#FFF4DC', fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#7A4B00' },
});
