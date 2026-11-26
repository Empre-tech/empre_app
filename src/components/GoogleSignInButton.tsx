import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/auth/AuthContext';
import { googleAvailable, googleIdToken } from '@/auth/google';
import { finishAuth } from '@/lib/navigation';
import { colors, fonts, radius, spacing } from '@/theme';

/** La «G» de colores que pide la guía de marca de Google para el botón de inicio de sesión. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/**
 * «Continuar con Google» en el login y el registro, con una línea «o» que lo separa del formulario. Si el build no
 * trae el módulo de Google (Expo Go) no se muestra nada.
 */
export function GoogleSignInButton({ onError, needsTerms, acceptedTerms }: { onError: (message: string | null) => void; needsTerms?: boolean; acceptedTerms?: boolean }) {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  if (!googleAvailable()) return null;

  const onPress = async () => {
    // En el registro, Google también pide la casilla de la política (Ley 1581: autorización previa).
    if (needsTerms && !acceptedTerms) {
      onError('Marca la casilla de la política y los términos para crear tu cuenta.');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const idToken = await googleIdToken();
      if (!idToken) return; // canceló
      await signInWithGoogle(idToken, Boolean(acceptedTerms));
      finishAuth(router);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No pudimos entrar con Google. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.orRow} accessible={false}>
        <View style={styles.line} />
        <Text style={styles.or}>o</Text>
        <View style={styles.line} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continuar con Google"
        onPress={() => void onPress()}
        disabled={loading}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}
      >
        {loading ? <ActivityIndicator color={colors.ink} /> : <GoogleG />}
        <Text style={styles.label}>Continuar con Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  or: { color: colors.muted, fontSize: 13, fontFamily: fonts.ui.semibold },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  label: { fontSize: 16, fontFamily: fonts.ui.semibold, color: '#1F1F1F' },
});
