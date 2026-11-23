import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { finishAuth } from '@/lib/navigation';
import { colors, fonts } from '@/theme';

/**
 * Verificar el correo (2026-11-23): al crear la cuenta con contraseña llega un código de 6 dígitos. Sirve para
 * recuperar la cuenta si olvidas la contraseña. Se puede dejar para después (Perfil lo recuerda).
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  const { user, refreshUser } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const leave = () => (fresh ? finishAuth(router) : router.back());

  const verify = async () => {
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) return setError('El código tiene 6 números.');
    setLoading(true);
    setError(null);
    try {
      await usersApi.verifyEmail(c);
      await refreshUser();
      leave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos verificarlo. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      await usersApi.sendEmailCode();
      setNote('Te mandamos un código nuevo. Revisa también la carpeta de spam.');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Espera un minuto para pedir otro código.' : e instanceof Error ? e.message : 'No pudimos mandarlo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout title="Verifica tu correo" subtitle={`Te mandamos un código de 6 números a ${user?.email ?? 'tu correo'}.`} markIcon="mail" showBrand={false} onBack={leave}>
      <TextField
        label="Código"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        error={error ?? undefined}
        returnKeyType="done"
        onSubmitEditing={() => void verify()}
      />
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <Button title="Verificar" onPress={() => void verify()} loading={loading} />
      <Button title="Mandarme otro código" variant="secondary" onPress={() => void resend()} loading={sending} />
      <Button title="Hacerlo después" variant="ghost" onPress={leave} />
      <Text style={styles.note}>Con el correo verificado puedes recuperar tu cuenta si olvidas la contraseña.</Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
