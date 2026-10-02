import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { Avatar } from './Avatar';
import { Button } from './Button';

type Variant = 'messages' | 'profile';

/** Pantalla vacía para secciones que requieren cuenta (mensajes, perfil).
 * Cada variante tiene su propio diseño para que no se vean como la misma
 * pantalla duplicada (ver "Propuesta visual" del análisis de UI). */
export function SignInPrompt({
  title,
  message,
  variant = 'messages',
}: {
  title: string;
  message: string;
  variant?: Variant;
}) {
  const router = useRouter();

  if (variant === 'profile') {
    return (
      <View style={styles.profileContainer}>
        <View style={styles.guestRow}>
          <Avatar uri={null} name="Invitado" size={56} />
          <View style={styles.guestInfo}>
            <Text style={styles.guestName}>Invitado</Text>
            <Text style={styles.guestMeta}>{message}</Text>
          </View>
        </View>

        <View style={styles.listSection}>
          <ListItem
            icon="notifications-outline"
            label="Notificaciones"
            onPress={() => Alert.alert('Notificaciones', 'Inicia sesión para ver tus notificaciones.')}
          />
          <ListItem
            icon="help-circle-outline"
            label="Ayuda"
            onPress={() => Alert.alert('Ayuda', '¿Tienes dudas? Escríbenos desde el perfil una vez inicies sesión.')}
          />
          <ListItem icon="storefront-outline" label="Registrar mi negocio" onPress={() => router.push('/business/new')} />
        </View>

        <View style={styles.profileActions}>
          <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.button} />
          <Button title="Crear cuenta" variant="secondary" onPress={() => router.push('/(auth)/register')} style={styles.button} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubbles-outline" size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.button} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/register')} hitSlop={8}>
        <Text style={styles.link}>¿Primera vez? Crear cuenta</Text>
      </Pressable>
    </View>
  );
}

function ListItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.85 }]}>
      <View style={styles.listItemIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.listItemLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontFamily: fonts.display.semibold, color: colors.ink, textAlign: 'center' },
  message: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
  button: { alignSelf: 'stretch' },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary, marginTop: spacing.sm },

  profileContainer: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  guestInfo: { flex: 1, gap: 2 },
  guestName: { fontSize: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  guestMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  listSection: { gap: spacing.sm },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  listItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemLabel: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  profileActions: { gap: spacing.sm, marginTop: 'auto' },
});
