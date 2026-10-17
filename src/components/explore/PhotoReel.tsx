import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { resolveImageUrl } from '@/lib/image';
import type { ReelTile } from '@/lib/photoStrip';
import { colors, fonts, radius, spacing } from '@/theme';

/** Alto de cada foto de la tira (el panel compacto suma `PEEK_REEL` por ella). */
export const REEL_TILE = 64;

interface Props {
  tiles: ReelTile[];
  /** Color e inicial del negocio, para su marca en la esquina de cada foto. */
  badge: (id: string) => { color: string; letter: string };
  onPhoto: (tile: ReelTile) => void;
}

/**
 * Tira del panel compacto: las fotos más recientes de los destacados, con la inicial del negocio en la esquina.
 * Es lo que invita a subir el panel; tocar una abre el visor sin salir del mapa.
 */
export function PhotoReel({ tiles, badge, onPhoto }: Props) {
  if (tiles.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityLabel="Fotos de los destacados"
    >
      {tiles.map((t) => {
        const b = badge(t.id);
        return (
          <Pressable
            key={t.key}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Foto de ${t.name}`}
            onPress={() => onPhoto(t)}
            style={({ pressed }) => [styles.tile, { backgroundColor: b.color }, pressed && styles.pressed]}
          >
            <Image accessible={false} source={{ uri: resolveImageUrl(t.uri) ?? t.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" recyclingKey={t.uri} />
            <View style={[styles.badge, { backgroundColor: b.color }]}>
              <Text style={styles.badgeText}>{b.letter}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tile: { width: REEL_TILE, height: REEL_TILE, borderRadius: radius.md, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  badge: { position: 'absolute', left: 4, bottom: 4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, fontFamily: fonts.ui.extrabold, color: colors.surface },
});
