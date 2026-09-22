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

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Escribe tu correo y tu contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      finishAuth(router);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError('Correo o contraseña incorrectos.');
      else setError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Bienvenido de vuelta" subtitle="Inicia sesión para escribirle a los negocios y ver tus mensajes.">
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
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        placeholder="••••••"
        onSubmitEditing={onSubmit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Iniciar sesión" onPress={onSubmit} loading={loading} />
      <View style={styles.links}>
        <Button title="¿Olvidaste tu contraseña?" variant="ghost" onPress={() => router.push('/(auth)/forgot-password')} />
        <Button title="Crear una cuenta" variant="secondary" onPress={() => router.replace('/(auth)/register')} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  links: { gap: spacing.sm },
});
