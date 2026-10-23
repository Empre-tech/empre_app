import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveImageUrl } from '@/lib/image';
import { photoLabel } from '@/lib/photoStrip';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, spacing } from '@/theme';

export interface ViewerTarget {
  id: string;
  name: string;
  photos: string[];
  /** Fotos que tiene el negocio en total (puede haber más que las que llegaron). */
  total: number;
  index: number;
}

interface Props {
  target: ViewerTarget | null;
  onClose: () => void;
  onProfile: (id: string) => void;
  /** «Ver las N fotos»: la pantalla con todas las fotos del negocio. */
  onAllPhotos: (id: string) => void;
}

/**
 * Visor de las fotos de un destacado, encima del mapa: se pasa de una a otra deslizando y desde aquí se va al perfil o
 * a todas sus fotos. Con «Reducir movimiento» abre sin animación.
 */
export function PhotoViewer({ target, onClose, onProfile, onAllPhotos }: Props) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={target !== null} transparent={false} animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      {target ? <ViewerBody key={`${target.id}-${target.index}`} target={target} onClose={onClose} onProfile={onProfile} onAllPhotos={onAllPhotos} /> : null}
    </Modal>
  );
}

function ViewerBody({ target, onClose, onProfile, onAllPhotos }: Props & { target: ViewerTarget }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(target.index);
  const more = target.total > target.photos.length;
  // Arranca en la foto tocada (contentOffset no vale en todos los Android: se coloca al medir).
  const pager = useRef<ScrollView>(null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar fotos" onPress={onClose} style={styles.round}>
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
        <Text style={styles.name} numberOfLines={1}>
          {target.name}
        </Text>
        <Text style={styles.counter} accessibilityLiveRegion="polite">
          {index + 1} de {target.total}
        </Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        ref={pager}
        onLayout={() => pager.current?.scrollTo({ x: target.index * width, animated: false })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
      >
        {target.photos.map((uri, i) => (
          <View key={`${i}-${uri}`} style={{ width }} accessible accessibilityRole="image" accessibilityLabel={photoLabel(i, target.total, target.name)}>
            <Image source={{ uri: resolveImageUrl(uri) ?? uri }} style={styles.photo} contentFit="contain" transition={150} cachePolicy="memory-disk" />
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        {more ? (
          <Pressable accessibilityRole="button" onPress={() => onAllPhotos(target.id)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Ver las {target.total} fotos</Text>
          </Pressable>
        ) : (
          <View style={styles.flex} />
        )}
        <Pressable accessibilityRole="button" onPress={() => onProfile(target.id)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Ver perfil</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.white, 0.15), alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white },
  counter: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.onDarkMuted },
  pager: { flex: 1 },
  photo: { flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  flex: { flex: 1 },
  primary: { minHeight: 44, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.white },
  secondary: { flex: 1, minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: alpha(colors.white, 0.35), alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  pressed: { opacity: 0.8 },
});
