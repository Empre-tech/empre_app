import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { agendaApi, type AgendaSummary } from '@/api/agenda';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { dayKey, formatClock } from '@/lib/agendaFormat';
import { priceText, publicCatalog, type ServiceItem } from '@/lib/catalog';
import { matchProblem, problemMessage, type Family } from '@/lib/family';
import { resolveImageUrl, mediaUrl } from '@/lib/image';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  family: Family;
  entityId: string;
  items: ServiceItem[];
  /** La agenda del negocio (solo llega con sesión iniciada); sin ella no hay horas libres que mostrar. */
  agenda?: AgendaSummary;
  /** Abrir la hoja de reservar, con la hora ya elegida o sin ella («Otro día»). */
  onPickSlot: (slot?: string) => void;
  onAgent: () => void;
  /** Mandar al chat lo que contó el cliente, con el servicio que parece. */
  onSendProblem: (message: string, item: ServiceItem | null) => void;
  onOpenItem: (item: ServiceItem) => void;
}

/** Cuántas horas libres se ven de una vez. */
const SLOTS = 4;

/**
 * Lo primero del perfil según la familia del negocio (tablero «Cada negocio con su protagonista», 3.69). Cada pieza
 * sale de datos reales: si no los hay, no se dibuja y el perfil sigue como antes.
 *  - Con cita: las horas libres de hoy (Empre Agenda).
 *  - A cotizar: «Cuéntale qué le pasa», que entiende lo escrito con reglas y lo manda por chat.
 *  - Tienda: lo que tiene, con foto, en estante.
 *  - Comida: el «Menú de hoy» necesita que el servidor guarde el menú del día; mientras tanto no se muestra.
 */
export function Protagonist(props: Props) {
  if (props.family === 'cita') return <FreeSlots {...props} />;
  if (props.family === 'cotizar') return <TellProblem {...props} />;
  if (props.family === 'tienda') return <Shelf {...props} />;
  return null;
}

function FreeSlots({ entityId, agenda, onPickSlot, onAgent }: Props) {
  const now = useNow(60_000);
  const today = dayKey(new Date(now));
  const serviceId = agenda?.services[0]?.id;
  const slots = useQuery({
    queryKey: ['availability', entityId, today, serviceId ?? null],
    queryFn: () => agendaApi.availability(entityId, today, serviceId),
    enabled: Boolean(agenda?.enabled),
    staleTime: 30_000,
  });
  if (!agenda?.enabled || slots.isError) return null;
  const free = (slots.data ?? []).filter((s) => Date.parse(s) > now).slice(0, SLOTS);

  return (
    <View style={styles.wrap}>
      <View style={styles.dark}>
        <View style={styles.darkHead}>
          <Text style={styles.darkTitle}>{free.length ? 'Horas libres hoy' : 'Hoy no quedan horas libres'}</Text>
          <Pressable accessibilityRole="button" onPress={() => onPickSlot()} hitSlop={8} style={styles.otherDay}>
            <Text style={styles.otherDayText}>{free.length ? 'Otro día' : 'Ver otros días'}</Text>
          </Pressable>
        </View>
        {free.length ? (
          <View style={styles.slotRow}>
            {free.map((s) => {
              const [clock, ampm] = formatClock(s).split(' ');
              return (
                <Pressable key={s} accessibilityRole="button" accessibilityLabel={`Reservar hoy a las ${formatClock(s)}`} onPress={() => onPickSlot(s)} style={({ pressed }) => [styles.slot, pressed && styles.slotOn]}>
                  {({ pressed }) => (
                    <>
                      <Text style={[styles.slotClock, pressed && { color: colors.ink }]}>{clock}</Text>
                      <Text style={[styles.slotAmpm, pressed && { color: colors.ink }]}>{ampm}</Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : slots.isLoading ? (
          <View style={[styles.slotRow, { opacity: 0.4 }]}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.slot} />
            ))}
          </View>
        ) : null}
        <Text style={styles.darkNote}>{free.length ? 'Tocas una hora y eliges qué te vas a hacer.' : 'Te mostramos los próximos días con espacio.'}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onAgent} style={styles.agent}>
        <EmpreSymbol product="agent" size={24} />
        <Text style={styles.agentText}>Prefiero pedirla por chat con Empre Agent</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function TellProblem({ items, onSendProblem }: Props) {
  const [text, setText] = useState('');
  const services = useMemo(() => publicCatalog(items).filter((i) => i.kind !== 'product'), [items]);
  const match = useMemo(() => matchProblem(text, services), [text, services]);
  if (!services.length) return null;
  const written = text.trim().length >= 3;
  const price = match ? priceText(match) ?? 'A cotizar' : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.soft}>
        <Text style={styles.softTitle} nativeID="cuentale">
          Cuéntale qué necesitas
        </Text>
        <TextInput
          accessibilityLabelledBy="cuentale"
          accessibilityLabel="Cuéntale qué necesitas"
          value={text}
          onChangeText={setText}
          placeholder="Por ejemplo: suena al frenar"
          placeholderTextColor={colors.faint}
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => written && onSendProblem(problemMessage(text, match), match)}
        />
        <View style={styles.chips}>
          {services.slice(0, 4).map((s) => (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => setText(`Necesito ${s.name.charAt(0).toLocaleLowerCase('es')}${s.name.slice(1)}`)} style={styles.chip}>
              <Text style={styles.chipText}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
        {written && match ? (
          <View style={styles.match} accessibilityLiveRegion="polite">
            <Text style={styles.matchLead}>Esto suena a</Text>
            <Text style={styles.matchName}>
              {match.name}
              {price ? ` · ${price}` : ''}
            </Text>
            <Text style={styles.matchLead}>El negocio te confirma el precio antes de empezar.</Text>
          </View>
        ) : written ? (
          <Text style={styles.noMatch} accessibilityLiveRegion="polite">
            No está en su lista: se lo enviamos tal cual y te responde por el chat.
          </Text>
        ) : null}
        {written ? (
          <Pressable accessibilityRole="button" onPress={() => onSendProblem(problemMessage(text, match), match)} style={({ pressed }) => [styles.send, pressed && { opacity: 0.85 }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            <Text style={styles.sendText}>Pedir cotización</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Shelf({ items, onOpenItem }: Props) {
  const withPhoto = useMemo(() => publicCatalog(items).filter((i) => i.kind === 'product' && (i.photos ?? []).length > 0 && !i.sold_out).slice(0, 8), [items]);
  // Con menos de dos productos con foto, el estante no aporta: la lista de abajo ya los muestra.
  if (withPhoto.length < 2) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.shelfTitle}>Lo que tiene</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfRow}>
        {withPhoto.map((p) => {
          const uri = resolveImageUrl(mediaUrl((p.photos ?? [])[0]));
          const price = priceText(p);
          return (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={[p.name, price].filter(Boolean).join(', ')} onPress={() => onOpenItem(p)} style={styles.shelfCard}>
              <View style={styles.shelfPhoto}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessible={false} /> : null}</View>
              <Text style={styles.shelfName} numberOfLines={2}>
                {p.name}
              </Text>
              {price ? <Text style={styles.shelfPrice}>{price}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  dark: { borderRadius: radius.lg, backgroundColor: colors.sand, padding: spacing.lg, gap: spacing.md },
  darkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  darkTitle: { flexShrink: 1, fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  otherDay: { minHeight: 44, justifyContent: 'center' },
  otherDayText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  slotRow: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: '#fff', borderColor: '#fff' },
  slotClock: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  slotAmpm: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  darkNote: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  agent: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  agentText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  soft: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: spacing.md },
  softTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  match: { borderRadius: radius.md, backgroundColor: colors.bg, padding: spacing.md, gap: 2 },
  matchLead: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  matchName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  noMatch: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  send: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  sendText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
  shelfTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  shelfRow: { gap: 10, paddingRight: spacing.lg },
  shelfCard: { width: 140, gap: 4 },
  shelfPhoto: { width: 140, height: 140, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.selectedSoft },
  shelfName: { fontSize: 14, lineHeight: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  shelfPrice: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
});
