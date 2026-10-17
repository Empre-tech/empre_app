import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Photo } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { photoSample } from '@/lib/profileLayout';
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
const COLUMNS = 3;
const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;

/**
 * «Fotos» (maqueta `perfil_secciones.html`): su propio apartado siempre que haya alguna, con una muestra de hasta 6
 * en 3 columnas (la última con «+N» si hay más) y «Ver todas las fotos (N)». El dueño ve «+ Nueva» primero y, con
 * menos de 5 fotos, un aviso.
 */
export function PhotosSection({ photos, color, isOwner, onOpenPhoto, onAll, onNew }: Props) {
  const [w, setW] = useState(0);
  const sample = photoSample(photos.length, isOwner);
  const cat = categoryColor(color);
  if (!sample.show) return null;
  const size = w > 0 ? (w - GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const shown = photos.slice(0, sample.shown);

  return (
    <View style={styles.block} onLayout={(e) => setW(e.nativeEvent.layout.width - spacing.md * 2)}>
      <Text style={styles.title} accessibilityRole="header">
        Fotos
      </Text>
      {size > 0 ? (
        <View style={styles.grid}>
          {isOwner ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Nueva publicación" onPress={onNew} style={[styles.cell, styles.newCell, { width: size, height: size }]}>
              <Ionicons name="add" size={22} color={colors.primary} />
              <Text style={styles.newText}>Nueva</Text>
            </Pressable>
          ) : null}
          {shown.map((p, i) => {
            const last = i === shown.length - 1 && sample.extra > 0;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={last ? `Ver las ${photos.length} fotos` : `${isVideo(p) ? 'Video' : 'Foto'}${p.caption ? `: ${p.caption}` : ''}`}
                onPress={() => (last ? onAll() : onOpenPhoto(i))}
                style={[styles.cell, { width: size, height: size }, isVideo(p) && { backgroundColor: cat.fg }]}
              >
                {isVideo(p) ? (
                  <View style={styles.videoFill}>
                    <Ionicons name="play" size={24} color="rgba(255,255,255,0.95)" />
                  </View>
                ) : (
                  <Image accessible={false} source={{ uri: resolveImageUrl(p.url) ?? undefined }} style={styles.image} contentFit="cover" transition={150} />
                )}
                {last ? (
                  <View style={styles.more}>
                    <Text style={styles.moreText}>+{sample.extra}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {photos.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={onAll} style={styles.all}>
          <Text style={styles.allText}>Ver todas las fotos ({photos.length})</Text>
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
  cell: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.primarySoft },
  image: { width: '100%', height: '100%' },
  videoFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  more: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,20,40,0.62)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, fontFamily: fonts.display.bold, color: '#fff' },
  newCell: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  newText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  all: { minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  allText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hint: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: '#FFF4DC', fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#7A4B00' },
});
