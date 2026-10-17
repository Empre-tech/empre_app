import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

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
export const ACTION_BAR_HEIGHT = 80;

/**
 * La barra fija de un visitante: «Escribirle» como acción principal y «Cómo llegar», «Llamar» y «Seguir» al lado.
 * Quien decide no tiene que buscar nada. Todos miden 56 pt, con el icono arriba y un texto corto de una línea (el
 * nombre completo, «Cómo llegar», va en la etiqueta del lector de pantalla).
 */
export function ActionBar({ name, bottomInset, onMessage, onDirections, onCall, isFavorite, favoriting, onToggleFavorite }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, spacing.sm) }]} accessibilityRole="toolbar">
      <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Escribirle</Text>
      </Pressable>
      {onDirections ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Cómo llegar" onPress={onDirections} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="navigate-outline" size={17} color={colors.ink} />
          <Text style={styles.secondaryText} numberOfLines={1}>
            Llegar
          </Text>
        </Pressable>
      ) : null}
      {onCall ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={onCall} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="call-outline" size={17} color={colors.ink} />
          <Text style={styles.secondaryText} numberOfLines={1}>
            Llamar
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? 'Dejar de seguir' : 'Seguir este negocio'}
        accessibilityState={{ selected: isFavorite }}
        onPress={onToggleFavorite}
        disabled={favoriting}
        style={({ pressed }) => [styles.secondary, isFavorite && styles.secondaryOn, pressed && styles.pressed]}
      >
        {favoriting ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <Ionicons name={isFavorite ? 'checkmark' : 'add'} size={17} color={colors.primary} />
            <Text style={[styles.secondaryText, isFavorite && styles.secondaryTextOn]} numberOfLines={1}>
              {isFavorite ? 'Siguiendo' : 'Seguir'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.surface, ...shadow },
  primary: { flex: 1.5, minHeight: 56, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  primaryText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, gap: 1 },
  secondaryOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  secondaryText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  secondaryTextOn: { color: colors.primaryDark },
  pressed: { opacity: 0.85 },
});
