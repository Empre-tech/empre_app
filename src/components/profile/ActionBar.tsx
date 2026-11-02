import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fonts, spacing } from '@/theme';

interface Props {
  name: string;
  bottomInset: number;
  onMessage: () => void;
  /** Sin ubicación del negocio no hay «Cómo llegar». */
  onDirections?: () => void;
  /** Sin teléfono válido no hay «Llamar». */
  onCall?: () => void;
  isFavorite: boolean;
  favoriting: boolean;
  onToggleFavorite: () => void;
}

/** Alto aproximado de la barra (para dejar margen al contenido del perfil). */
export const ACTION_BAR_HEIGHT = 92;

/**
 * La barra flotante de quien visita (lienzo C1): «Escribir» como acción principal en rojo y, al lado, «Llamar»,
 * «Llegar» y «Seguir» con su ícono arriba. Flota separada de los bordes, redondeada y con sombra.
 */
export function ActionBar({ name, bottomInset, onMessage, onDirections, onCall, isFavorite, favoriting, onToggleFavorite }: Props) {
  return (
    <View style={[styles.bar, { bottom: Math.max(bottomInset, spacing.md) }]} accessibilityRole="toolbar">
      <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Ionicons name="chatbubble-outline" size={18} color="#fff" />
        <Text style={styles.primaryText}>Escribir</Text>
      </Pressable>
      {onCall ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={onCall} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="call-outline" size={20} color={colors.ink} />
          <Text style={styles.secondaryText}>Llamar</Text>
        </Pressable>
      ) : null}
      {onDirections ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Cómo llegar" onPress={onDirections} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="navigate-outline" size={20} color={colors.ink} />
          <Text style={styles.secondaryText}>Llegar</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? 'Dejar de seguir' : 'Seguir este negocio'}
        accessibilityState={{ selected: isFavorite }}
        onPress={onToggleFavorite}
        disabled={favoriting}
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        {favoriting ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <>
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? colors.primary : colors.ink} />
            <Text style={styles.secondaryText}>{isFavorite ? 'Siguiendo' : 'Seguir'}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 24,
    backgroundColor: colors.surface,
    ...cardShadow,
    shadowOpacity: 0.16,
  },
  primary: { flex: 1.5, height: 50, borderRadius: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  secondaryText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
