import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { notifyError } from '@/components/Notice';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/theme';

/**
 * Eliminar la cuenta (Perfil > Ajustes > Eliminar mi cuenta). Google Play y la App Store exigen que se pueda desde la
 * app. Dice qué se borra y qué queda, pide la contraseña para confirmar y, al terminar, cierra la sesión.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  // Las cuentas creadas con Google no tienen contraseña: basta con confirmar.
  const needsPassword = user?.has_password !== false;
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    if (needsPassword && !password.trim()) {
      setError('Escribe tu contraseña para confirmar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await usersApi.deleteAccount(password);
      await signOut();
      router.replace('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pudimos eliminar la cuenta. Intenta de nuevo.';
      setError(msg);
      notifyError('No se eliminó la cuenta', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Eliminar mi cuenta"
      subtitle="Esto no se puede deshacer."
      markIcon="trash"
      showBrand={false}
      onBack={() => router.back()}
    >
      <View style={styles.box}>
        <Text style={styles.item}>• Se borran tu nombre, correo, teléfono, foto y contraseña.</Text>
        <Text style={styles.item}>• Tus negocios, sus ofertas y su información dejan de verse en Empre.</Text>
        <Text style={styles.item}>• Se cierran tus sesiones en todos tus celulares.</Text>
        <Text style={styles.item}>• Los mensajes y reseñas que escribiste quedan como «Usuario eliminado».</Text>
        <Text style={styles.item}>• Si tienes Empre Pro pagado, el tiempo que te queda se pierde.</Text>
      </View>
      {needsPassword ? (
        <TextField
          label="Tu contraseña"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          secureTextEntry
          autoComplete="current-password"
          error={error ?? undefined}
          returnKeyType="done"
          onSubmitEditing={() => void onDelete()}
        />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      <Button title="Eliminar mi cuenta para siempre" onPress={() => void onDelete()} loading={loading} />
      <Button title="Cancelar" variant="ghost" onPress={() => router.back()} disabled={loading} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    marginBottom: 8,
  },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
  item: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
  },
});
