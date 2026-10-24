import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RollingNumber } from '@/components/finance/RollingNumber';
import { categoryColor } from '@/lib/categoryColor';
import type { MonthSavings } from '@/lib/offerBarrio';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, spacing } from '@/theme';
import { BandWash } from './Wash';

// La franja del barrio (3.48): arriba, en el azul de Empre, dónde estás («Tu barrio · Santa Marta / Centro
// Histórico»), «Mis boletos», el titular con el mayor ahorro real de hoy cerca de ti y el buscador. Debajo, «Tus
// vecinos hoy» (lo pone quien la usa). La tarjeta «Este mes ahorraste» se monta encima del borde inferior.

export function BarrioBand({
  city,
  zone,
  hook,
  search,
  children,
  onPlace,
  onTickets,
  ticketDot = false,
}: {
  city: string;
  zone: string;
  /** Mayor ahorro real de hoy cerca (pesos); 0 = sin titular. */
  hook: number;
  search: ReactNode;
  children?: ReactNode;
  onPlace: () => void;
  onTickets: () => void;
  /** Tienes un QR sin usar: punto naranja en «Mis boletos». */
  ticketDot?: boolean;
}) {
  const where = zone || city;
  return (
    <View style={styles.band}>
      <BandWash />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={where ? `Tu barrio: ${[zone, city].filter(Boolean).join(', ')}. Ver otros barrios` : 'Ver barrios'}
          onPress={onPlace}
          style={styles.loc}
        >
          <Ionicons name="location" size={20} color={colors.white} />
          <View style={styles.locText}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.locKick} numberOfLines={1}>
              {zone ? `Tu barrio${city ? ` · ${city}` : ''}` : city ? 'Tu ciudad' : 'Ofertas'}
            </Text>
            <View style={styles.locLine}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.locName} numberOfLines={1}>
                {where || 'Elige una ciudad'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.white} />
            </View>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={ticketDot ? 'Mis boletos, tienes uno sin usar' : 'Mis boletos'} onPress={onTickets} style={styles.tickets}>
          <Ionicons name="ticket-outline" size={21} color={colors.white} />
          {ticketDot ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>
      {hook > 0 ? (
        <View style={styles.hook} accessible accessibilityRole="header" accessibilityLabel={`Ahorra hasta ${hook} pesos con tus vecinos hoy`}>
          <View style={styles.hookLine}>
            <Text style={styles.hookText}>Ahorra hasta </Text>
            <RollingNumber value={hook} style={styles.hookNum} />
          </View>
          <Text style={styles.hookText}>con tus vecinos hoy</Text>
        </View>
      ) : null}
      <View style={styles.search}>{search}</View>
      {children}
    </View>
  );
}

/** «Este mes ahorraste»: lo que ahorraste en tus canjes del mes y las caras de esos negocios. Sin canjes aún, invita. */
export function SavedCard({ savings, onTickets }: { savings: MonthSavings | undefined; onTickets: () => void }) {
  const total = savings?.total ?? 0;
  const faces = (savings?.businesses ?? []).slice(0, 4);
  return (
    <View style={styles.saved}>
      <View style={styles.savedTop}>
        <View style={styles.savedLeft} accessible accessibilityLabel={total ? `Este mes ahorraste ${total} pesos en ${savings?.businesses.length ?? 0} negocios de tu barrio` : 'Aún no has canjeado este mes'}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.savedKick}>
            {total ? 'Este mes ahorraste' : 'Tu ahorro del mes'}
          </Text>
          {total ? <RollingNumber value={total} style={styles.savedNum} /> : <Text style={styles.savedEmpty}>Empieza con tu primer boleto</Text>}
          {total ? (
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.savedSub}>
              en {savings?.businesses.length === 1 ? '1 negocio' : `${savings?.businesses.length} negocios`} de tu barrio
            </Text>
          ) : null}
        </View>
        <View style={styles.savedRight}>
          {faces.length ? (
            <View style={styles.faces} accessible={false}>
              {faces.map((b, i) => (
                <View key={b.id} style={[styles.face, { backgroundColor: categoryColor(b.category_color).fg, marginLeft: i ? -8 : 0 }]}>
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.faceText}>
                    {(Array.from(b.name.trim())[0] ?? '').toLocaleUpperCase('es')}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onTickets} hitSlop={6} style={styles.savedBtn}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.savedBtnText}>
              Mis boletos
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </Pressable>
        </View>
      </View>
      <View style={styles.savedLine} />
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.savedMotto}>
        Cada boleto es plata que se queda en negocios de aquí.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // El azul de respaldo cubre todo mientras el degradado (SVG) toma la medida de la franja.
  band: { paddingTop: spacing.sm, paddingBottom: 46, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  loc: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locText: { flex: 1, minWidth: 0 },
  locKick: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: alpha(colors.white, 0.85) },
  locLine: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locName: { flexShrink: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.white },
  tickets: { width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.white, 0.16), alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.primaryDark },
  hook: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  hookLine: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  hookText: { fontSize: 25, lineHeight: 30, fontFamily: fonts.display.bold, color: colors.white },
  hookNum: { fontSize: 25, fontFamily: fonts.display.bold, color: colors.accentLight },
  search: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },

  saved: { marginHorizontal: spacing.lg, marginTop: -32, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, shadowColor: colors.black, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  savedTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  savedLeft: { flex: 1, minWidth: 0 },
  savedKick: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  savedNum: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.successInk },
  savedEmpty: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, marginTop: 2 },
  savedSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  savedRight: { alignItems: 'flex-end', gap: 2 },
  faces: { flexDirection: 'row' },
  face: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  faceText: { fontSize: 12, fontFamily: fonts.display.bold, color: colors.white },
  savedBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  savedBtnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  savedLine: { height: 1, backgroundColor: colors.line, marginTop: 2 },
  savedMotto: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark, paddingTop: spacing.sm },
});

