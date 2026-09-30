import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** 'full' (por defecto) es el hero alto de Login/Recuperar contraseña; 'compact' es
   * la franja baja de Registro (tiene más campos, así que el hero cede espacio). */
  variant?: 'full' | 'compact';
  /** Ícono que va dentro de la marca en forma de pin (storefront en login, candado en
   * recuperar contraseña). En 'compact' el pin se muestra sin ícono, como en el mockup. */
  markIcon?: keyof typeof Ionicons.glyphMap;
  /** "Empre" + el tagline debajo del pin. Recuperar contraseña no los muestra. */
  showBrand?: boolean;
  /** Si se pasa, aparece un botón de volver sobre el hero. */
  onBack?: () => void;
}

/** Marca de Empre: un pin de ubicación (como el que se ve en el mapa) con un
 * ícono centrado en el hueco, en vez de un ícono genérico suelto. */
function AuthMark({ icon, size = 62 }: { icon?: keyof typeof Ionicons.glyphMap; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="location" size={size} color={colors.primary} />
      {icon ? (
        <Ionicons
          name={icon}
          size={size * 0.26}
          color={colors.primary}
          style={[styles.markIcon, { top: size * 0.24 }]}
        />
      ) : null}
    </View>
  );
}

/**
 * Cascarón compartido por login, registro y "olvidé mi contraseña": un hero
 * de marca (pin + nombre + tagline) y el formulario como una tarjeta que
 * sube desde abajo, superpuesta al hero — antes era una pantalla en blanco
 * con solo un label chiquito "EMPRE" arriba, sin ninguna identidad.
 */
export function AuthLayout({ title, subtitle, children, variant = 'full', markIcon, showBrand = true, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const compact = variant === 'compact';

  return (
    <View style={styles.flex}>
      <View
        style={[
          styles.hero,
          compact ? styles.heroCompact : styles.heroFull,
          { paddingTop: insets.top + spacing.lg },
        ]}
      >
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={onBack}
            style={[styles.backButton, { top: insets.top + spacing.sm }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
        ) : null}

        <AuthMark icon={compact ? undefined : markIcon} size={compact ? 34 : 62} />

        {showBrand && !compact ? (
          <>
            <Text style={styles.brand}>Empre</Text>
            <Text style={styles.tagline}>Descubre y apoya negocios de tu barrio</Text>
          </>
        ) : null}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.card}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.primarySoft },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  heroFull: { paddingBottom: spacing.xxl },
  heroCompact: { height: 128, paddingBottom: 0 },
  backButton: {
    position: 'absolute',
    left: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markIcon: { position: 'absolute' },
  brand: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.ink },
  tagline: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  card: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    marginTop: -spacing.xl,
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl },
  header: { gap: spacing.xs },
  title: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.ink },
  subtitle: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  form: { gap: spacing.lg },
});
