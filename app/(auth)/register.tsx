import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { LegalConsent } from '@/components/LegalConsent';
import { TextField } from '@/components/TextField';
import { colors, fonts, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Cada error va debajo de su campo (tablero «Primera vez»): dice qué pasa y, si se puede, qué hacer.
  const [fieldErr, setFieldErr] = useState<{ name?: string; email?: string; password?: string; taken?: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsErr, setTermsErr] = useState<string | null>(null);

  const onSubmit = async () => {
    const errs = {
      name: name.trim() ? undefined : 'Escribe tu nombre.',
      email: EMAIL_RE.test(email.trim()) ? undefined : 'Revisa el correo: le falta algo, como la @.',
      password: password.length >= 6 ? undefined : 'Usa al menos 6 letras o números.',
    };
    setFieldErr(errs);
    setTermsErr(accepted ? null : 'Marca la casilla para crear tu cuenta.');
    if (errs.name || errs.email || errs.password || !accepted) return;

    setLoading(true);
    setError(null);
    try {
      await signUp({ name, email, password, phone, accept_terms: true });
      // El código de verificación ya salió al correo: se pide de una vez (se puede dejar para después).
      router.replace({ pathname: '/verify-email', params: { fresh: '1' } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setFieldErr({ email: 'Ese correo ya tiene cuenta.', taken: true });
      else setError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Tres datos. Con eso reservas, guardas ofertas y les escribes a los negocios."
      variant="compact"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
    >
      <TextField label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Tu nombre" error={fieldErr.name} />
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="tu@correo.com"
        error={fieldErr.email}
      />
      {fieldErr.taken ? (
        <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/login')} style={styles.taken}>
          <Text style={styles.takenText}>Entrar con ese correo ›</Text>
        </Pressable>
      ) : null}
      <TextField
        label="Celular (opcional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="300 000 0000"
      />
      <Text style={styles.hint}>El celular solo lo ve el negocio cuando reservas con él.</Text>
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="Mínimo 6 letras o números"
        error={fieldErr.password}
        onSubmitEditing={onSubmit}
      />
      <LegalConsent
        value={accepted}
        onChange={(v) => {
          setAccepted(v);
          if (v) setTermsErr(null);
        }}
        error={termsErr}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Crear cuenta" onPress={onSubmit} loading={loading} />
      <GoogleSignInButton onError={setError} needsTerms acceptedTerms={accepted} />
      <View style={styles.links}>
        <Button title="Ya tengo cuenta" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  links: { gap: spacing.sm },
  taken: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  takenText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  hint: { marginTop: -6, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
});
