import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '@/theme';
import { Button } from './Button';

/** Pantalla vacía para secciones que requieren cuenta (mensajes, perfil). */
export function SignInPrompt({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.button} />
      <Button title="Crear cuenta" variant="secondary" onPress={() => router.push('/(auth)/register')} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 22, fontFamily: fonts.display.semibold, color: colors.ink, textAlign: 'center' },
  message: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
  button: { alignSelf: 'stretch' },
});
