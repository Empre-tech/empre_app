import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  /** Miembros del grupo, el mejor rankeado primero. */
  items: WithDistance[];
  /** Lejos: un solo punto. Medio y cerca: el círculo del negocio de arriba con cuántos hay. */
  tier: 'far' | 'mid' | 'near';
  /** Avisa cuando carga una miniatura, para que el marcador se vuelva a dibujar. */
  onImageLoad?: () => void;
  /** Avisa cuando la vista del marcador se dibujó, para empezar a congelarlo. */
  onLayout?: () => void;
}

/** Cara de una capa de la pila: la miniatura del negocio o el ícono de su categoría. */
function Face({ entity, size, onLoad }: { entity: WithDistance; size: number; onLoad?: () => void }) {
  const cat = categoryColor(entity.category_color);
  const thumb = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  if (thumb) {
    return <Image accessible={false} source={{ uri: thumb }} style={styles.face} contentFit="cover" cachePolicy="memory-disk" recyclingKey={thumb} onLoad={onLoad} onError={onLoad} />;
  }
  const icon = (entity.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[styles.face, styles.fallback, { backgroundColor: cat.bg }]}>
      <Ionicons name={icon} size={size > 40 ? 20 : 16} color={cat.fg} />
    </View>
  );
}

/**
 * Varios negocios muy juntos (3.31): un solo círculo del tamaño de un pin, con la cara del negocio de arriba y una
 * pastilla con cuántos hay. Antes eran hasta 3 miniaturas encimadas, que se leían como pines uno encima de otro.
 * Arriba va un negocio con oferta si lo hay, y el borde ámbar con el rayo avisa que hay oferta dentro del grupo.
 * Lejos se reduce a un punto del color del negocio de arriba, con el mismo número.
 */
export function BusinessStack({ items, tier, onImageLoad, onLayout }: Props) {
  // Con oferta primero; el orden del ranking decide entre iguales (el sort es estable).
  const ordered = [...items].sort((a, b) => Number(!!b.has_active_offer) - Number(!!a.has_active_offer));
  const [top] = ordered;
  if (!top) return null;
  const hasOffer = items.some((i) => i.has_active_offer);

  if (tier === 'far') {
    return (
      <View collapsable={false} onLayout={onLayout} style={styles.wrap}>
        <View style={[styles.dot, { backgroundColor: categoryColor(top.category_color).fg }]}>
          <Text style={styles.dotCount}>{items.length}</Text>
        </View>
      </View>
    );
  }

  const size = tier === 'near' ? 46 : 34;
  return (
    <View collapsable={false} onLayout={onLayout} style={styles.wrap}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderColor: hasOffer ? colors.accent : '#ffffff' }]}>
        <Face entity={top} size={size} onLoad={onImageLoad} />
      </View>
      {hasOffer ? (
        <View style={styles.bolt}>
          <Ionicons name="flash" size={11} color={colors.ink} />
        </View>
      ) : null}
      <View style={styles.count}>
        <Text style={styles.countText}>{items.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Margen alrededor: el marcador se dibuja como imagen y recortaría sombras y el rayo.
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  // Lejos: un punto algo mayor que el de un negocio solo, con el número adentro.
  dot: { minWidth: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff', paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  dotCount: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff', lineHeight: 14 },
  circle: { borderWidth: 3, overflow: 'hidden', backgroundColor: '#fff' },
  // Pastilla con cuántos hay, en la esquina de abajo a la derecha (el rayo va arriba).
  count: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: '#fff', lineHeight: 13 },
  face: { width: '100%', height: '100%', backgroundColor: colors.primarySoft },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  bolt: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
