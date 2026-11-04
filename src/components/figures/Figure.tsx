import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { figureFor } from '@/lib/figures';
import { safeIcon } from '@/lib/icons';
import { colors } from '@/theme';
import { FIGURE_BG, FIGURE_SVG, type FigureKey } from './figureData';

interface Props {
  /** Nombre de la categoría o sección (se elige la figura por el nombre)… */
  name?: string | null;
  /** …o la figura directa. */
  figure?: FigureKey | null;
  size?: number;
  /** Ícono de respaldo si no hay figura para ese nombre (Ionicons). */
  fallbackIcon?: string | null;
}

/** La figura con volumen de una categoría o sección; si no hay, el ícono de la categoría en negro. */
export const Figure = memo(function Figure({ name, figure, size = 48, fallbackIcon }: Props) {
  const key = figure ?? figureFor(name);
  if (key) return <SvgXml xml={FIGURE_SVG[key]} width={size} height={size} accessible={false} />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      <Ionicons name={safeIcon(fallbackIcon, 'pricetag-outline')} size={Math.round(size * 0.55)} color={colors.ink} />
    </View>
  );
});

/** Fondo claro del mosaico de esa figura (o el gris suave si no tiene). */
export function figureBg(name?: string | null, figure?: FigureKey | null): string {
  const key = figure ?? figureFor(name);
  return key ? FIGURE_BG[key] : '#EEF2F7';
}

/** Mosaico: la figura sobre su fondo claro, redondeado como en la vitrina. */
export function FigureTile({ name, figure, size = 56, style, fallbackIcon }: Props & { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ borderRadius: 18, backgroundColor: figureBg(name, figure), alignItems: 'center', justifyContent: 'center', padding: 6 }, style]}>
      <Figure name={name} figure={figure} size={size} fallbackIcon={fallbackIcon} />
    </View>
  );
}
