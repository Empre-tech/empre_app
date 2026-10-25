import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { categoryColor, deepen } from '@/lib/categoryColor';
import type { GroupId } from '@/lib/categoryGroups';
import { displayIcon } from '@/lib/mapView';
import { clockLabel, levelLabel, redeemedWhen, routeTitle, routeWhy, savingPesos, type MarketRoute, type MarketVoice } from '@/lib/offerBarrio';
import { pesos, type MarketItem } from '@/lib/offerMarket';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';
import { CategoryWash } from './Wash';

type IconName = keyof typeof Ionicons.glyphMap;

// Carruseles de Ofertas del barrio (3.48): «Rutas del barrio», «Lo recomiendan tus vecinos» y «¿Qué se te antoja?».

/** Perforación del boleto (una fila de rayas; Android no dibuja bordes punteados de un solo lado). */
export function Perforation({ color = colors.line }: { color?: string }) {
  return (
    <View style={styles.perf} accessible={false}>
      {Array.from({ length: 26 }, (_, i) => (
        <View key={i} style={[styles.dash, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const LEVEL_ICON: Record<MarketRoute['level'], IconName> = { walk: 'walk-outline', zone: 'location-outline', day: 'sunny-outline' };
const LEVEL_TONE: Record<MarketRoute['level'], { bg: string; fg: string }> = {
  walk: { bg: colors.successSoft, fg: colors.successInk },
  zone: { bg: colors.primarySoft, fg: colors.primaryDark },
  day: { bg: colors.accentSoft, fg: colors.accentInk },
};

/** Tarjeta de una ruta (3.49): el nombre del tema, su nivel sin adornos, la hora de cada parada y el porqué. */
function RouteCard({ r, city, hereZone, onOpen, onRoute }: { r: MarketRoute; city: string; hereZone: string; onOpen: (o: MarketItem) => void; onRoute: (r: MarketRoute) => void }) {
  const name = routeTitle(r, city);
  const level = levelLabel(r, hereZone);
  const tone = LEVEL_TONE[r.level];
  const timed = r.times.some(Boolean);
  return (
    <View style={styles.route}>
      <View style={styles.routeHead}>
        <Text style={styles.routeName} numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
        <View style={styles.routeSave}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.routeSaveText}>
            Ahorras {pesos(r.saving)}
          </Text>
        </View>
      </View>
      {/* El nivel va solo en su fila: «A pie en El Rodadero · 9 cuadras» no cabe junto al ahorro. */}
      <View style={[styles.level, { backgroundColor: tone.bg }]}>
        <Ionicons name={LEVEL_ICON[r.level]} size={12} color={tone.fg} />
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.levelText, { color: tone.fg }]}>
          {level}
        </Text>
      </View>
      <View style={styles.stops}>
        {r.stops.map((s, k) => {
          const cat = categoryColor(s.category_color).fg;
          return (
            <View key={s.id} style={styles.stopWrap}>
              {k > 0 ? <View style={[styles.leg, timed && styles.legTimed]} accessible={false} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Parada ${k + 1}${r.times[k] ? `, a las ${clockLabel(r.times[k] as string)}` : ''}: ${s.title} en ${s.entity_name}, ahorras ${pesos(savingPesos(s))}`}
                onPress={() => onOpen(s)}
                style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
              >
                {timed ? (
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.at, !r.times[k] && styles.atEmpty]}>
                    {r.times[k] ? clockLabel(r.times[k] as string) : ' '}
                  </Text>
                ) : null}
                <View style={[styles.stopIcon, { shadowColor: cat }]}>
                  <CategoryWash color={cat} />
                  <Ionicons name={displayIcon(s.category_icon) as IconName} size={20} color={colors.white} />
                </View>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.stopName} numberOfLines={1}>
                  {s.entity_name}
                </Text>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.stopSave}>
                  −{pesos(savingPesos(s))}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.routeWhy}>
        {routeWhy(r)}
      </Text>
      <View style={styles.routeFoot}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver la ruta ${name}`} onPress={() => onRoute(r)} style={({ pressed }) => [styles.routeGo, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.routeGoText}>
            Ver la ruta
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RoutesRail({ routes, city, hereZone, onOpen, onRoute }: { routes: MarketRoute[]; city: string; hereZone: string; onOpen: (o: MarketItem) => void; onRoute: (r: MarketRoute) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={ROUTE_W + 10} decelerationRate="fast">
      {routes.map((r) => (
        <RouteCard key={r.stops.map((s) => s.id).join('|')} r={r} city={city} hereZone={hereZone} onOpen={onOpen} onRoute={onRoute} />
      ))}
    </ScrollView>
  );
}

export function VoicesRail({ voices, now, onOpen }: { voices: MarketVoice[]; now: number; onOpen: (o: MarketItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={VOICE_W + 10} decelerationRate="fast">
      {voices.map((v) => {
        const o = v.item;
        const save = savingPesos(o);
        return (
          <Pressable
            key={`${o.entity_id}${v.when}`}
            accessibilityRole="button"
            accessibilityLabel={`«${v.quote}», ${v.author}, ${redeemedWhen(v.when, now)}. ${o.entity_name}${save ? `, ahorras ${pesos(save)}` : ''}`}
            onPress={() => onOpen(o)}
            style={({ pressed }) => [styles.voice, pressed && styles.pressed]}
          >
            <Text style={styles.quote} numberOfLines={3}>
              «{v.quote}»
            </Text>
            <View style={styles.who}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.whoText} numberOfLines={1}>
                {v.author ? `${v.author} · ` : ''}
              </Text>
              <Ionicons name="checkmark-circle" size={13} color={colors.successInk} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.whoOk} numberOfLines={1}>
                {redeemedWhen(v.when, now)}
              </Text>
            </View>
            <View style={styles.to}>
              <View style={[styles.logo, { backgroundColor: categoryColor(o.category_color).fg }]}>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.logoText}>
                  {(Array.from(o.entity_name.trim())[0] ?? '').toLocaleUpperCase('es')}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.toName} numberOfLines={1}>
                {o.entity_name}
              </Text>
              {save ? (
                <View style={styles.toSave}>
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.toSaveText}>
                    Ahorras {pesos(save)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const GROUPS: { id: GroupId; name: string; icon: IconName; color: string }[] = [
  { id: 'comer', name: 'Comer y beber', icon: 'restaurant-outline', color: colors.danger },
  { id: 'salud', name: 'Belleza y salud', icon: 'cut-outline', color: colors.verified },
  { id: 'compras', name: 'Compras', icon: 'bag-handle-outline', color: colors.primary },
  { id: 'servicios', name: 'Servicios', icon: 'construct-outline', color: deepen(colors.accent, 0.15) },
  { id: 'planes', name: 'Planes y viajes', icon: 'airplane-outline', color: colors.primaryDark },
];

/** «¿Qué se te antoja?»: los 5 grupos de Explorar como tarjetas con arte; debajo, el mayor ahorro que se ve de cada uno. */
export function GroupCards({ best, selected, onSelect }: { best: Partial<Record<GroupId, number>>; selected?: GroupId; onSelect: (g: GroupId | undefined) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityLabel="Tipos de negocio">
      {GROUPS.map((g) => {
        const on = selected === g.id;
        return (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${g.name}${best[g.id] ? `, hasta ${best[g.id]} por ciento` : ''}`}
            onPress={() => onSelect(on ? undefined : g.id)}
            style={({ pressed }) => [styles.group, on && styles.groupOn, pressed && styles.pressed]}
          >
            <View style={styles.art}>
              <CategoryWash color={g.color} />
              <Ionicons name={g.icon} size={72} color={alpha(colors.white, 0.9)} style={styles.artIcon} />
            </View>
            <View style={styles.groupBody}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.groupName} numberOfLines={1}>
                {g.name}
              </Text>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.groupBest} numberOfLines={1}>
                {best[g.id] ? `Hasta −${best[g.id]} %` : 'Ver ofertas'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const ROUTE_W = 296;
const VOICE_W = 262;

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.97 }] },
  rail: { gap: 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  perf: { flexDirection: 'row', justifyContent: 'space-between', height: 2, overflow: 'hidden' },
  dash: { width: 4, height: 2, borderRadius: 1 },

  route: { width: ROUTE_W, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm + 2 },
  routeHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  routeName: { flex: 1, fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  level: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: -4 },
  levelText: { flexShrink: 1, fontSize: 11, fontFamily: fonts.ui.extrabold },
  at: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 5, overflow: 'hidden', marginBottom: 2 },
  atEmpty: { backgroundColor: 'transparent' },
  legTimed: { marginTop: 41 },
  routeWhy: { fontSize: 11.5, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted, backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  routeGo: { marginLeft: 'auto', minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  routeGoText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  routeSave: { backgroundColor: colors.successSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  routeSaveText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  stops: { flexDirection: 'row' },
  stopWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  leg: { width: 14, height: 2, marginTop: 23, marginLeft: -7, marginRight: -7, backgroundColor: colors.line, zIndex: -1 },
  stop: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, minHeight: 44 },
  stopIcon: { width: 46, height: 46, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  stopName: { fontSize: 11, fontFamily: fonts.display.bold, color: colors.ink, maxWidth: 84 },
  stopSave: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk, marginTop: -2 },
  routeFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  routeWalk: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },

  voice: { width: VOICE_W, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  quote: { fontSize: 14, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.ink, minHeight: 38 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  whoText: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  whoOk: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  to: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  logo: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 12, fontFamily: fonts.display.bold, color: colors.white },
  toName: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  toSave: { backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 6 },
  toSaveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },

  group: { width: 122, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.line },
  groupOn: { borderColor: colors.ink },
  art: { height: 76, overflow: 'hidden' },
  artIcon: { position: 'absolute', right: -10, bottom: -14 },
  groupBody: { paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9 },
  groupName: { fontSize: 12.5, fontFamily: fonts.display.bold, color: colors.ink },
  groupBest: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.successInk },
});
