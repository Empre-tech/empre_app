import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { finishAuth } from '@/lib/navigation';
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
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) return setError('Escribe tu nombre.');
    if (!EMAIL_RE.test(email.trim())) return setError('Escribe un correo válido.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');

    setLoading(true);
    setError(null);
    try {
      await signUp({ name, email, password, phone });
      finishAuth(router);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError('Ese correo ya está registrado. Prueba iniciando sesión.');
      else setError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Descubre negocios cercanos y escríbeles directamente.">
      <TextField label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Tu nombre" />
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="tu@correo.com"
      />
      <TextField
        label="Celular (opcional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="300 000 0000"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="Mínimo 6 caracteres"
        onSubmitEditing={onSubmit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Crear cuenta" onPress={onSubmit} loading={loading} />
      <View style={styles.links}>
        <Button title="Ya tengo cuenta" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  links: { gap: spacing.sm },
});
