import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fin } from '@/finance/tokens';
import { RollingNumber } from './RollingNumber';

const C = fin.color;
const T = fin.type;
const R = fin.radius;
const S = fin.space;

// La cápsula de Empre Finance (3.45): «Hoy te quedó» y los botones de venta, gasto y voz. Tocar el monto estira la
// pieza hasta la hoja. Mientras se busca el negocio, la misma cápsula dice «Abriendo…».

export function CapsuleLoading() {
  return (
    <View style={styles.capsule}>
      <ActivityIndicator color={C.action.solid} />
      <Text style={styles.label}>Abriendo Empre Finance…</Text>
    </View>
  );
}

export function FinanceCapsule({
  net,
  label,
  a11y,
  pendingCount,
  onOpen,
  onSale,
  onExpense,
  onVoice,
}: {
  /** null si el resumen no llegó: se muestra «—», nunca un $0 que no es real. */
  net: number | null;
  label: string;
  a11y: string;
  pendingCount: number;
  onOpen: () => void;
  onSale: () => void;
  onExpense: () => void;
  onVoice: () => void;
}) {
  return (
    <View style={styles.capsule}>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onOpen} style={styles.main}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {pendingCount > 0 ? <PendingBadge n={pendingCount} /> : null}
        </View>
        {net === null ? <Text style={[styles.value, styles.unknown]}>—</Text> : <RollingNumber value={net} prefix={net < 0 ? '−' : ''} style={styles.value} />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Venta" onPress={onSale} style={[styles.q, styles.qIn]}>
        <Ionicons name="add" size={22} color={C.action.on} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Gasto" onPress={onExpense} style={[styles.q, styles.qOut]}>
        <Ionicons name="remove" size={22} color={C.out.on} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Contarlo por voz" onPress={onVoice} style={[styles.q, styles.qChat]}>
        <Ionicons name="mic" size={20} color={C.action.on} />
      </Pressable>
    </View>
  );
}

function PendingBadge({ n }: { n: number }) {
  return (
    <View style={styles.pend}>
      <View style={styles.pendDot} />
      <Text style={styles.pendText}>{n} sin enviar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: { minHeight: fin.size.capsule, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingLeft: S.lg, paddingRight: S.md },
  main: { flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: T.kicker,
  value: T.capsuleAmount,
  unknown: { color: C.textSoft },
  q: { width: fin.size.round, height: fin.size.round, borderRadius: R.button, alignItems: 'center', justifyContent: 'center' },
  qIn: { backgroundColor: C.in.fill },
  qOut: { backgroundColor: C.out.fill },
  qChat: { backgroundColor: C.action.solid },
  pend: { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: 7, paddingVertical: 1, borderRadius: R.badge, backgroundColor: C.out.soft },
  pendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.out.fill },
  pendText: { ...T.small, fontSize: 10.5, color: C.out.ink },
});
