import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveImageUrl } from '@/lib/image';
import { galleryLayout, photoLabel } from '@/lib/photoStrip';
import { alpha, colors, fonts, radius } from '@/theme';

interface Props {
  name: string;
  photos?: string[];
  photosCount?: number;
  /** Color de fondo mientras llega cada foto. */
  color: string;
  height: number;
  /** Tocar una foto la abre en el visor, en esa foto. */
  onPhoto: (index: number) => void;
  /** Esquinas de arriba redondeadas (dentro de una ficha con borde) o todas. */
  rounded?: 'top' | 'all';
  /** Algo encima de la foto grande (la razón de la tarjeta). */
  children?: React.ReactNode;
}

/**
 * Fotos de un destacado: la grande y dos pequeñas; con más, «+N» en la última. Con una sola, ocupa todo el ancho.
 * Cada foto es un botón propio (el resto de la tarjeta sigue seleccionando el negocio en el mapa). Sin fotos no dibuja nada.
 */
export function PhotoGallery({ name, photos, photosCount, color, height, onPhoto, rounded = 'all', children }: Props) {
  const { mode, shown, extra } = galleryLayout(photos, photosCount);
  if (mode === 'none') return null;
  const total = shown.length + extra;
  const tile = (uri: string, i: number, style: object) => (
    <Pressable
      key={`${i}-${uri}`}
      accessibilityRole="imagebutton"
      accessibilityLabel={photoLabel(i, total, name)}
      accessibilityHint="Abre la foto"
      onPress={() => onPhoto(i)}
      style={({ pressed }) => [styles.tile, { backgroundColor: color }, style, pressed && styles.pressed]}
    >
      <Image accessible={false} source={{ uri: resolveImageUrl(uri) ?? uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" recyclingKey={uri} />
      {i === shown.length - 1 && extra > 0 ? (
        <View style={styles.more}>
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  return (
    <View style={[styles.wrap, { height }, rounded === 'top' ? styles.roundTop : styles.roundAll]}>
      {mode === 'one' ? (
        tile(shown[0], 0, styles.fill)
      ) : (
        <View style={styles.row}>
          {tile(shown[0], 0, styles.big)}
          <View style={styles.side}>{shown.slice(1).map((uri, i) => tile(uri, i + 1, styles.fill))}</View>
        </View>
      )}
      {children ? (
        <View style={styles.over} pointerEvents="none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const GAP = 3;

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  roundAll: { borderRadius: radius.lg },
  roundTop: { borderTopLeftRadius: radius.lg - 2, borderTopRightRadius: radius.lg - 2 },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  big: { flex: 2 },
  side: { flex: 1, gap: GAP },
  fill: { flex: 1 },
  tile: { minHeight: 44, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  more: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.ink, 0.55), alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white },
  over: { position: 'absolute', left: 8, top: 8 },
});
