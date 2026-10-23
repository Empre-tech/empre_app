import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { colors } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  /** Miembros del grupo, el mejor rankeado primero. */
  items: WithDistance[];
  /** Lejos: un solo punto. Medio y cerca: pila de miniaturas. */
  tier: 'far' | 'mid' | 'near';
  /** Avisa cuando carga una miniatura, para que el marcador se vuelva a dibujar. */
  onImageLoad?: () => void;
  /** Avisa cuando la vista del marcador se dibujó, para empezar a congelarlo. */
  onLayout?: () => void;
}

/** Cara de una capa de la pila: la miniatura del negocio o el ícono de su categoría. */
function Face({ entity, onLoad }: { entity: WithDistance; onLoad?: () => void }) {
  const cat = categoryColor(entity.category_color);
  const thumb = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  if (thumb) {
    return <Image accessible={false} source={{ uri: thumb }} style={styles.face} contentFit="cover" cachePolicy="memory-disk" recyclingKey={thumb} onLoad={onLoad} onError={onLoad} />;
  }
  const icon = (entity.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[styles.face, styles.fallback, { backgroundColor: cat.bg }]}>
      <Ionicons name={icon} size={17} color={cat.fg} />
    </View>
  );
}

function Layer({
  entity,
  style,
  borderColor = colors.white,
  onLoad,
}: {
  entity: WithDistance;
  style: StyleProp<ViewStyle>;
  borderColor?: string;
  onLoad?: () => void;
}) {
  return (
    <View style={[styles.layer, style, { borderColor }]}>
      <Face entity={entity} onLoad={onLoad} />
    </View>
  );
}

/**
 * Varios negocios muy juntos, como una pila de miniaturas (hasta 3 capas
 * desfasadas), nunca como un número. Se volvió a esta forma tras probar un solo círculo con número (3.33): se entiende
 * mejor que son varios negocios. La pila mide 58 pt de ancho y el umbral de agrupación la tiene en cuenta. Arriba va un negocio con oferta si lo
 * hay, y el borde ámbar con el rayo avisa que hay oferta dentro del grupo.
 * Se ve igual a cualquier distancia: ya no hay punto de lejos (auditoría del 22 oct).
 */
export function BusinessStack({ items, tier, onImageLoad, onLayout }: Props) {
  // Con oferta primero; el orden del ranking decide entre iguales (el sort es estable).
  const ordered = [...items].sort((a, b) => Number(!!b.has_active_offer) - Number(!!a.has_active_offer));
  const [top, second, third] = ordered;
  if (!top) return null;
  const hasOffer = items.some((i) => i.has_active_offer);

  return (
    <View collapsable={false} onLayout={onLayout} style={styles.wrap}>
      <View style={styles.stack}>
        {third ? <Layer entity={third} style={styles.back} onLoad={onImageLoad} /> : null}
        {second ? <Layer entity={second} style={styles.middle} onLoad={onImageLoad} /> : null}
        <Layer entity={top} style={styles.top} borderColor={hasOffer ? colors.accent : colors.white} onLoad={onImageLoad} />
        {hasOffer ? (
          <View style={styles.bolt}>
            <Ionicons name="flash" size={11} color={colors.ink} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Margen alrededor: el marcador se dibuja como imagen y recortaría sombras y el rayo.
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  // En diagonal: la de arriba a la derecha y las otras bajando hacia la izquierda, 12 pt de lado y 11 hacia abajo.
  stack: { width: 58, height: 56 },
  layer: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  back: { left: 0, top: 22, opacity: 0.85, transform: [{ scale: 0.9 }] },
  middle: { left: 12, top: 11, opacity: 0.95, transform: [{ scale: 0.95 }] },
  top: { left: 24, top: 0 },
  face: { width: '100%', height: '100%', backgroundColor: colors.primarySoft },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  bolt: {
    position: 'absolute',
    top: -6,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
