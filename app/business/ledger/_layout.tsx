import { Stack } from 'expo-router';

/**
 * Los cuatro espacios principales de Empre Finance (Hoy, Plata, Cuentas, Rentabilidad)
 * cruzan con un fundido suave al cambiar de pestaña; las sub-pantallas mantienen la transición nativa.
 */
export default function LedgerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="plata/[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="debts/[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="rentabilidad/[id]" options={{ animation: 'fade' }} />
    </Stack>
  );
}
