import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { BusinessForm } from '@/components/BusinessForm';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/theme';

/** Crear un negocio nuevo: requiere sesión iniciada. */
export default function NewBusinessScreen() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'signedOut') router.replace('/(auth)/login');
  }, [status, router]);

  if (status !== 'signedIn') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted }}>Inicia sesión para crear un negocio.</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return <BusinessForm />;
}
