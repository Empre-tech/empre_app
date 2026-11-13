import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

const CHECKS = [
  { t: 'Con buena luz', d: 'Nada oscuro ni movido' },
  { t: 'Lo tuyo al centro', d: 'Que se vea entero' },
  { t: 'Sin texto encima', d: 'Nada de «PROMO» ni precios: el precio ya sale en la tarjeta' },
] as const;

/**
 * La guía de la foto (tablero «Subir un servicio»): la foto es lo primero que ven en Ofertas y en el perfil, así que se
 * dice antes de subirla cómo se ve bien. Tres reglas cortas, sin bloquear nada.
 */
export function PhotoGuide() {
  return (
    <View style={styles.box} accessible accessibilityLabel={`La foto es lo primero que ven en Ofertas. ${CHECKS.map((c) => `${c.t}: ${c.d}`).join('. ')}`}>
      <Text style={styles.head}>
        La foto <Text style={styles.headSub}>· es lo primero que ven en Ofertas</Text>
      </Text>
      {CHECKS.map((c) => (
        <View key={c.t} style={styles.row}>
          <Ionicons name="checkmark-circle" size={18} color={colors.verified} />
          <Text style={styles.text}>
            <Text style={styles.t}>{c.t}</Text> · {c.d}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  head: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  headSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  text: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.regular, color: colors.muted },
  t: { fontFamily: fonts.ui.semibold, color: colors.ink },
});
