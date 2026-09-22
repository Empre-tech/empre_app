import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { authApi } from '@/api/endpoints';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim()) {
      setError('Escribe tu correo.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Recupera tu contraseña" subtitle="Te enviaremos un enlace para crear una nueva.">
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        placeholder="tu@correo.com"
        editable={!sent}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sent ? (
        <Text style={styles.success}>Si el correo existe, te enviamos un enlace para restablecer tu contraseña.</Text>
      ) : (
        <Button title="Enviar enlace" onPress={onSubmit} loading={loading} />
      )}
      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  success: { color: colors.success, fontSize: 15, fontFamily: fonts.ui.medium },
});
