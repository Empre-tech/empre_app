import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { chipA11yLabel, chipA11yState, type ChipRole } from '@/lib/chip';
import { colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

type Tone = 'ink' | 'primary' | 'soft';

interface Props {
  label: string;
  onPress: () => void;
  /** Elegido o no. Indefinido: el chip solo dispara una acción (sugerencias) y no anuncia estado. */
  selected?: boolean;
  /** Cómo se ve cuando está elegido: tinta (filtros), azul (opciones) o azul suave (elección discreta). */
  tone?: Tone;
  /** Píldora (filtros) o rectángulo de esquinas suaves (horas y opciones de agenda). */
  shape?: 'pill' | 'square';
  /** `md`: 13 pt en negrita; `lg`: 14 pt, para opciones con más aire. */
  size?: 'md' | 'lg';
  /** Cómo se ve sin elegir: `plain` (borde gris), `dashed` («Otra pregunta») o `outlined` (opciones accionables, borde azul). */
  look?: 'plain' | 'dashed' | 'outlined';
  icon?: keyof typeof Ionicons.glyphMap;
  /** Va después de la etiqueta, dentro del mismo texto (por ejemplo la ★ de «lo que mejor te funcionó»). */
  trailing?: ReactNode;
  role?: ChipRole;
  accessibilityLabel?: string;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  style?: StyleProp<ViewStyle>;
}

/**
 * Chip único de Empre (paso 2 de docs/ESTRUCTURA_VISUAL.md). Reemplaza a los 12 que cada pantalla hacía por su cuenta:
 * 44 pt de alto (el mínimo táctil), borde de 1,5, texto que crece con la letra grande del sistema hasta 1,3× y una
 * pulsación que lo encoge un poco. Las etiquetas que solo informan y no se tocan no son chips: son otra pieza.
 */
export function Chip({ label, onPress, selected, tone = 'ink', shape = 'pill', size = 'md', look = 'plain', icon, trailing, role = 'button', accessibilityLabel, disabled, hitSlop, style }: Props) {
  const on = selected === true;
  const fill = tone === 'ink' ? styles.onInk : tone === 'primary' ? styles.onPrimary : styles.onSoft;
  const text = on ? (tone === 'soft' ? styles.textSoft : styles.textOn) : look === 'dashed' ? styles.textDashed : look === 'outlined' ? styles.textOutlined : null;
  const iconColor = on ? (tone === 'soft' ? colors.primaryDark : colors.white) : colors.ink;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={chipA11yLabel(label, accessibilityLabel)}
      accessibilityState={chipA11yState(role, selected, disabled)}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        shape === 'square' ? styles.square : styles.pill,
        size === 'lg' ? styles.padLg : styles.padMd,
        !on && look === 'dashed' && styles.dashed,
        !on && look === 'outlined' && styles.outlined,
        on && fill,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={iconColor} style={styles.icon} /> : null}
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.text, size === 'lg' ? styles.textLg : styles.textMd, text]}>
        {label}
        {trailing}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  pill: { borderRadius: radius.pill },
  square: { borderRadius: radius.sm },
  padMd: { paddingHorizontal: 14 },
  padLg: { paddingHorizontal: spacing.lg },
  dashed: { borderStyle: 'dashed' },
  outlined: { borderColor: colors.primary },
  onInk: { backgroundColor: colors.ink, borderColor: colors.ink },
  onPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  onSoft: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { transform: [{ scale: 0.97 }] },
  icon: { marginRight: 6 },
  text: { color: colors.ink },
  textMd: { fontSize: 13, fontFamily: fonts.ui.bold },
  textLg: { fontSize: 14, fontFamily: fonts.ui.semibold },
  textOn: { color: colors.white },
  textSoft: { color: colors.primaryDark },
  textDashed: { color: colors.muted },
  textOutlined: { color: colors.primaryDark },
});
