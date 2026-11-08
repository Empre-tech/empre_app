import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import type { ServiceItem } from '@/lib/catalog';
import type { BizFace } from '@/lib/offerLenses';
import { pesos, priceView, timeBadge, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

/** «Negocios ofreciendo hoy» (3.61): aro naranja si tiene oferta, en tinta si solo publica catálogo. */
export function BizFaces({ faces, onOpen }: { faces: BizFace[]; onOpen: (f: BizFace) => void }) {
  if (!faces.length) return null;
  return (
    <View style={styles.sec}>
      <Text style={styles.title} accessibilityRole="header">
        Negocios ofreciendo hoy
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {faces.map((f) => (
          <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${f.name}${f.hasOffer ? ', tiene oferta' : ', catálogo'}`} onPress={() => onOpen(f)} style={({ pressed }) => [styles.face, pressed && { transform: [{ scale: 0.97 }] }]}>
            <View style={[styles.ring, { borderColor: f.hasOffer ? colors.accent : colors.ink }]}>
              <Avatar uri={f.photo ?? undefined} name={f.name} size={52} />
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {f.name}
            </Text>
            <Text style={[styles.what, { color: f.hasOffer ? colors.accentInk : colors.muted }]}>{f.hasOffer ? 'Oferta' : 'Catálogo'}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** La vitrina de un negocio: primero sus ofertas y aparte su catálogo, nunca mezclados. */
export function BizVitrinaSheet({
  face,
  offers,
  catalog,
  now,
  onOffer,
  onBusiness,
  onClose,
}: {
  face: BizFace | null;
  offers: MarketItem[];
  catalog: ServiceItem[];
  now: number;
  onOffer: (o: MarketItem) => void;
  onBusiness: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  return (
    <Modal visible={face !== null} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Cerrar" onPress={onClose}>
        {face ? (
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal onPress={(e) => e.stopPropagation()}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <View style={[styles.ring, { borderColor: face.hasOffer ? colors.accent : colors.ink }]}>
                <Avatar uri={face.photo ?? undefined} name={face.name} size={52} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.headName} accessibilityRole="header">
                  {face.name}
                </Text>
                {face.category ? <Text style={styles.headSub}>{face.category}</Text> : null}
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 14 }}>
              {offers.length ? (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.label, { color: colors.accentInk }]}>Ofertas</Text>
                  {offers.map((o) => {
                    const p = priceView(o);
                    const t = timeBadge(o.ends_at, now);
                    return (
                      <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`${o.title}. ${p.now ?? ''}. ${t.text}`} onPress={() => onOffer(o)} style={styles.offer}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.offerTitle} numberOfLines={2}>
                            {o.title}
                          </Text>
                          <Text style={[styles.offerTime, t.urgent && { color: colors.warning }]}>{t.text}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {p.now ? <Text style={styles.price}>{p.now}</Text> : null}
                          {p.was ? <Text style={styles.was}>{p.was}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {catalog.length ? (
                <View>
                  <Text style={[styles.label, { marginBottom: 4 }]}>Catálogo</Text>
                  {catalog.slice(0, 6).map((s) => (
                    <View key={s.id} style={styles.svc}>
                      <Text style={styles.svcName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={styles.svcPrice}>{s.price === null ? 'Pregunta el precio' : s.price === 0 ? 'Gratis' : `${s.price_from ? 'Desde ' : ''}${pesos(s.price)}`}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => onBusiness(face.id)} style={styles.go}>
              <Text style={styles.goText}>Ver el negocio</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sec: { gap: 8 },
  title: { paddingHorizontal: 20, fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  row: { gap: 12, paddingHorizontal: 20, paddingVertical: 2 },
  face: { width: 78, alignItems: 'center', gap: 5 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  name: { fontSize: 12, lineHeight: 14, minHeight: 28, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  what: { fontSize: 11.5, fontFamily: fonts.ui.extrabold },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,35,70,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 14, ...softShadow },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headName: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  headSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  label: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  offer: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.accentSoft },
  offerTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  offerTime: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  price: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint, textDecorationLine: 'line-through' },
  svc: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  svcName: { flex: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  svcPrice: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  go: { minHeight: 52, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.ink },
  goText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
});
