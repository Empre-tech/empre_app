import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { LegalConsent } from '@/components/LegalConsent';
import { colors, fonts, spacing } from '@/theme';

/**
 * Antes de seguir, la autorización vigente (2026-11-25, Ley 1581 de 2012): a quien entró con Google sin pasar por el
 * registro, a las cuentas de antes de la casilla y a todos cuando cambie la política. Sin aceptarla, solo puede salir.
 */
export function TermsGate() {
  const { status, user, refreshUser, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = status === 'signedIn' && Boolean(user?.legal_version) && user?.terms_version !== user?.legal_version;
  if (!pending || !user?.legal_version) return null;
  const changed = Boolean(user.terms_version);

  const accept = async () => {
    if (!accepted) {
      setError('Marca la casilla para seguir.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await usersApi.acceptTerms(user.legal_version!);
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardarlo. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>{changed ? 'Actualizamos cómo cuidamos tus datos' : 'Antes de seguir'}</Text>
        <Text style={styles.lead}>
          {changed
            ? 'Cambiamos la Política de tratamiento de datos y los Términos. Léelos y acéptalos para seguir usando Empre.'
            : 'Para usar Empre necesitamos tu autorización para tratar tus datos, como pide la ley colombiana.'}
        </Text>
        <View style={styles.points}>
          <Text style={styles.point}>• Usamos tus datos para tu cuenta, mostrarte negocios cerca y que tu negocio funcione en la app. No los vendemos.</Text>
          <Text style={styles.point}>• Puedes ver, corregir o borrar tus datos y eliminar tu cuenta cuando quieras.</Text>
          <Text style={styles.point}>• Si tienes un negocio, los datos de tus clientes son tuyos: pídeles permiso antes de guardar su número y escribirles.</Text>
        </View>
        <LegalConsent value={accepted} onChange={(v) => { setAccepted(v); if (v) setError(null); }} error={error} />
        <Button title="Aceptar y seguir" onPress={() => void accept()} loading={busy} />
        <Button title="Salir de mi cuenta" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display.bold, color: colors.ink },
  lead: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.muted },
  points: { gap: spacing.sm, paddingVertical: spacing.sm },
  point: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.ink },
});
