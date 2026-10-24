import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, BackHandler, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView,
  StyleSheet, Text, UIManager, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PayMethod } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { FinanceVoice } from '@/components/finance/FinanceVoice';
import { Glass, useGlass } from '@/components/finance/Glass';
import { HoldButton } from '@/components/finance/HoldButton';
import { MoneyPanel } from '@/components/finance/MoneyPanel';
import { RollingNumber } from '@/components/finance/RollingNumber';
import { WeekBars } from '@/components/finance/WeekBars';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useFinanceBusiness, useFinanceData, type KnownItem } from '@/finance/useFinance';
import { bumpLine, draftTotal, expenseInputsFrom, qtyOf, saleInputFrom, type DraftLine } from '@/lib/finance';
import { formatPesos, newClientId } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { queueExpense, queueSale, queueVoid } from '@/ledger/ledgerStore';
import { fin } from '@/finance/tokens';
import { alpha } from '@/theme';

const C = fin.color;
const M = fin.motion;
const T = fin.type;
const R = fin.radius;
const S = fin.space;

/**
 * Empre Finance (3.45). Una sola pieza de vidrio que cambia de forma: nace como cápsula («Hoy te quedó» y los botones
 * de venta, gasto y voz) y se estira hasta la hoja con el resumen del día y la semana. Desde ahí se registra con
 * intención: elegir arma un borrador y registrar pide mantener pulsado. Ver más, fiados o crédito llevan a «Mi
 * negocio». Se abre con doble toque en «+ Nueva», con el acceso rápido del ícono o con empre://finance.
 *
 * Es una capa sobre toda la app (la monta FinanceHost, 3.46 F3), no una pantalla de la navegación: así el vidrio puede
 * desenfocar lo que hay detrás también en Android.
 */

type Mode = 'peek' | 'sheet' | 'sale' | 'expense';
type Done = { kind: 'sale' | 'expense'; id: string };

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

const isExpenseKey = (key: string) => key.startsWith('exp:');

// Ganchos de prueba, SOLO en desarrollo: el banco de capturas (scripts/finance-shots.sh) abre cada estado directo con
// empre://finance?mode=sale&tab=man, ?voice=save&say=…, ?pick=2 (elige los 2 primeros), ?sim=server (resumen que
// falla) o ?sim=nobiz (sin negocio). En la app publicada se ignoran.
type ShotParams = { mode?: string; tab?: string; voice?: string; say?: string; pick?: string; sim?: string };

/** Lo que abre la bandeja: el negocio (opcional) y, solo en desarrollo, los ganchos de prueba. */
export type FinanceParams = { entity?: string } & ShotParams;
const MODES: Mode[] = ['peek', 'sheet', 'sale', 'expense'];
const pickOne = <T extends string>(v: string | undefined, list: readonly T[]): T | undefined => (__DEV__ && v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export function FinanceOverlay({ params, onClosed }: { params: FinanceParams; onClosed: () => void }) {
  const { entity: param, ...shotParams } = params;
  const shot = {
    mode: pickOne(shotParams.mode, MODES),
    tab: pickOne(shotParams.tab, ['known', 'man', 'chat'] as const),
    voice: pickOne(shotParams.voice, ['save', 'sale', 'expense'] as const),
    sim: pickOne(shotParams.sim, ['server', 'nobiz'] as const),
    say: __DEV__ ? shotParams.say : undefined,
    pick: __DEV__ ? Number(shotParams.pick ?? 0) : 0,
  };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const reduce = useReduceMotion();
  const glass = useGlass();
  const realBiz = useFinanceBusiness(param);
  const biz = shot.sim === 'nobiz' ? { ...realBiz, entity: null, list: [] } : realBiz;
  const entityId = biz.entity?.id ?? '';
  const data = useFinanceData(shot.sim === 'server' && entityId ? 'sim-404' : entityId);

  const [mode, setMode] = useState<Mode>(shot.mode ?? 'peek');
  const [voice, setVoice] = useState<null | 'save' | 'sale' | 'expense'>(shot.voice ?? null);
  const [picker, setPicker] = useState(false);
  const [quick, setQuick] = useState<DraftLine[]>([]);
  const [saleDraft, setSaleDraft] = useState<DraftLine[]>([]);
  const [expDraft, setExpDraft] = useState<DraftLine[]>([]);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [toast, setToast] = useState<{ text: string; done: Done[] } | null>(null);
  const [fly, setFly] = useState<{ n: number; amount: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rise] = useState(() => new Animated.Value(0));
  const [flyV] = useState(() => new Animated.Value(0));
  const [toastV] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduce) rise.setValue(1);
    else Animated.spring(rise, { toValue: 1, useNativeDriver: true, ...M.rise }).start();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // Solo al montar: la entrada se anima una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (text: string) => AccessibilityInfo.announceForAccessibility(text);

  const morph = (next: Mode) => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(M.morphMs, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setMode(next);
    setPicker(false);
  };

  const leave = onClosed;
  const close = () => {
    if (reduce) return leave();
    Animated.timing(rise, { toValue: 0, duration: M.sinkMs, useNativeDriver: true }).start(() => leave());
  };
  /** Ver más en «Mi negocio»: la bandeja se va y se abre la pantalla de Empre (Atrás vuelve a donde estabas). */
  const toEmpre = (href: Href) => {
    onClosed();
    router.push(href);
  };

  // Atrás de Android: de la voz o un panel se vuelve a la hoja; si no, se cierra.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (voice) {
        setVoice(null);
        return true;
      }
      if (mode === 'sale' || mode === 'expense') {
        morph('sheet');
        return true;
      }
      close();
      return true;
    });
    return () => sub.remove();
  });

  const celebrate = (amount: number, text: string, done: Done[]) => {
    setFly({ n: Date.now(), amount });
    if (!reduce) {
      flyV.setValue(0);
      Animated.timing(flyV, { toValue: 1, duration: M.flyMs, useNativeDriver: true }).start(() => setFly(null));
    }
    setToast({ text, done });
    toastV.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.spring(toastV, { toValue: 1, useNativeDriver: true, ...M.toast }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), M.undoMs);
    say(`${text}. Puedes deshacer durante 5 segundos.`);
  };

  const registerSale = (lines: DraftLine[], m: PayMethod): Done[] => {
    if (lines.length === 0) return [];
    const id = newClientId();
    queueSale(entityId, saleInputFrom(lines, m, id));
    return [{ kind: 'sale', id }];
  };
  const registerExpenses = (lines: DraftLine[]): Done[] =>
    expenseInputsFrom(lines, newClientId).map((input) => {
      queueExpense(entityId, input);
      return { kind: 'expense' as const, id: input.client_id };
    });

  const undo = () => {
    if (!toast) return;
    toast.done.forEach((d) => queueVoid(d.kind, entityId, d.id, 'Deshecho al momento'));
    setToast(null);
    say('Deshecho.');
  };

  // «Elige y confirma»: tus servicios más vendidos y tu gasto más frecuente.
  const quickOptions: KnownItem[] = useMemo(() => [...data.services.slice(0, 3), ...data.usualExpenses.slice(0, 1)], [data.services, data.usualExpenses]);
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !shot.pick || quickOptions.length === 0) return;
    picked.current = true;
    setQuick(quickOptions.slice(0, shot.pick).map((it) => ({ key: it.key, name: it.name, unitPrice: it.price, itemId: it.itemId, category: it.category, source: 'known' as const, qty: 1 })));
  }, [shot.pick, quickOptions]);
  const quickSales = quick.filter((l) => !isExpenseKey(l.key));
  const quickExp = quick.filter((l) => isExpenseKey(l.key));
  const quickNet = draftTotal(quickSales) - draftTotal(quickExp);
  const confirmQuick = () => {
    const done = [...registerSale(quickSales, 'cash'), ...registerExpenses(quickExp)];
    setQuick([]);
    celebrate(quickNet, quickNet >= 0 ? `Registrado +${formatPesos(quickNet)}` : `Registrado −${formatPesos(-quickNet)}`, done);
  };

  const confirmPanel = (kind: 'sale' | 'expense') => {
    if (kind === 'sale') {
      const t = draftTotal(saleDraft);
      const done = registerSale(saleDraft, method);
      setSaleDraft([]);
      morph('sheet');
      celebrate(t, `Venta de ${formatPesos(t)} registrada`, done);
    } else {
      const t = draftTotal(expDraft);
      const done = registerExpenses(expDraft);
      setExpDraft([]);
      morph('sheet');
      celebrate(-t, `Gasto de ${formatPesos(t)} registrado`, done);
    }
  };

  const name = biz.entity?.name ?? '';
  const maxH = winH - insets.top - 24;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [winH * 0.5, 0] });
  // La cápsula flota como tarjeta; la hoja y los paneles se pegan abajo, como las demás hojas de Empre.
  const floating = mode === 'peek' && Boolean(biz.entity) && !biz.loading;
  const dim = !floating;

  // ---- contenido según el estado ----
  let body: React.ReactNode;
  if (biz.loading) {
    body = (
      <View style={styles.capsule}>
        <ActivityIndicator color={C.action.solid} />
        <Text style={styles.capLabel}>Abriendo Empre Finance…</Text>
      </View>
    );
  } else if (!biz.signedIn) {
    body = (
      <View style={styles.stateBox}>
        <SignInPrompt title="Empre Finance" message="Inicia sesión para registrar las ventas y gastos de tu negocio." />
      </View>
    );
  } else if (biz.error) {
    body = (
      <View style={styles.stateBox}>
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tus negocios" body="Revisa la conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: biz.retry }} />
      </View>
    );
  } else if (!biz.entity) {
    body = (
      <View style={styles.stateBox}>
        <EmptyState icon="storefront-outline" title="Aún no tienes un negocio" body="Créalo y aquí llevarás tus cuentas del día." action={{ title: 'Crear negocio', onPress: () => toEmpre('/business/new') }} />
      </View>
    );
  } else if (mode === 'peek') {
    body = (
      <View style={styles.capsule}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Te quedó hoy ${formatPesos(data.net)}. Abrir Empre Finance`} onPress={() => morph('sheet')} style={styles.capMain}>
          <View style={styles.capLabelRow}>
            <Text style={styles.capLabel}>{data.problem === 'offline' && data.failed ? 'Sin conexión · registra igual' : data.failed ? 'Resumen no disponible' : 'Hoy te quedó'}</Text>
            {data.pendingCount > 0 ? <PendingBadge n={data.pendingCount} /> : null}
          </View>
          <RollingNumber value={data.net} prefix={data.net < 0 ? '−' : ''} style={styles.capValue} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Venta" onPress={() => morph('sale')} style={[styles.q, styles.qIn]}>
          <Ionicons name="add" size={22} color={C.action.on} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Gasto" onPress={() => morph('expense')} style={[styles.q, styles.qOut]}>
          <Ionicons name="remove" size={22} color={C.out.on} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Contarlo por voz" onPress={() => setVoice('save')} style={[styles.q, styles.qChat]}>
          <Ionicons name="mic" size={20} color={C.action.on} />
        </Pressable>
      </View>
    );
  } else if (mode === 'sale' || mode === 'expense') {
    body = (
      <ScrollView style={{ maxHeight: maxH }} contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" bounces={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al resumen" onPress={() => morph('sheet')} style={styles.grabHit}>
          <View style={styles.grab} />
        </Pressable>
        <MoneyPanel
          kind={mode}
          initialTab={shot.tab}
          businessName={name}
          known={mode === 'sale' ? data.services : data.usualExpenses}
          draft={mode === 'sale' ? saleDraft : expDraft}
          onDraft={mode === 'sale' ? setSaleDraft : setExpDraft}
          method={method}
          onMethod={setMethod}
          onBack={() => morph('sheet')}
          onVoice={() => setVoice(mode)}
          onFiado={() => toEmpre({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })}
          onRegister={() => confirmPanel(mode)}
          onSay={say}
        />
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView style={{ maxHeight: maxH }} contentContainerStyle={styles.sheet} bounces={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a la cápsula" onPress={() => morph('peek')} style={styles.grabHit}>
          <View style={styles.grab} />
        </Pressable>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.h1} accessibilityRole="header">
              Hoy
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={biz.list.length > 1 ? `Negocio: ${name}. Cambiar` : `Negocio: ${name}`}
              disabled={biz.list.length < 2}
              onPress={() => setPicker((p) => !p)}
              style={styles.subRow}
              hitSlop={6}
            >
              <Text style={styles.sub} numberOfLines={1}>
                en <Text style={styles.subB}>{name}</Text>
              </Text>
              {biz.list.length > 1 ? <Ionicons name={picker ? 'chevron-up' : 'chevron-down'} size={14} color={C.text} /> : null}
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={styles.x}>
            <Ionicons name="close" size={20} color={C.text} />
          </Pressable>
        </View>

        {picker ? (
          <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel="Negocio">
            {biz.list.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: e.id === entityId }}
                onPress={() => {
                  biz.choose(e.id);
                  setPicker(false);
                  setQuick([]);
                  setSaleDraft([]);
                  setExpDraft([]);
                }}
                style={[styles.pick, e.id === entityId && styles.pickOn]}
              >
                <Text style={[styles.pickText, e.id === entityId && { color: C.action.solid }]} numberOfLines={1}>
                  {e.name}
                </Text>
                {e.id === entityId ? <Ionicons name="checkmark" size={16} color={C.action.solid} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityHint="Abre Mi negocio" onPress={() => toEmpre({ pathname: '/business/ledger/[id]', params: { id: entityId } })} style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>Te quedó</Text>
            {data.changePct !== null ? (
              <View style={[styles.chg, data.changePct < 0 && styles.chgDown]}>
                <Ionicons name={data.changePct >= 0 ? 'arrow-up' : 'arrow-down'} size={11} color={data.changePct >= 0 ? C.in.ink : C.out.ink} />
                <Text style={[styles.chgText, data.changePct < 0 && { color: C.out.ink }]}>{Math.abs(data.changePct)} % vs ayer</Text>
              </View>
            ) : null}
          </View>
          {data.loading ? <ActivityIndicator color={C.action.solid} style={{ alignSelf: 'flex-start', marginVertical: 8 }} /> : <RollingNumber value={data.net} prefix={data.net < 0 ? '−' : ''} style={styles.big} />}
          <WeekBars bars={data.bars} heights={data.heights} />
          <View style={styles.split}>
            <View style={{ flex: 1 }}>
              <Text style={styles.splitLabel}>
                <Text style={{ color: C.in.fill }}>● </Text>Vendiste
              </Text>
              <RollingNumber value={data.sold} style={styles.splitValue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.splitLabel}>
                <Text style={{ color: C.out.fill }}>● </Text>Gastaste
              </Text>
              <RollingNumber value={data.spent} style={styles.splitValue} />
            </View>
          </View>
          {data.problem === 'offline' ? <Text style={styles.stale}>Sin conexión: lo que registres se envía solo cuando vuelva la señal.</Text> : null}
          {data.problem === 'server' ? <Text style={styles.stale}>No pudimos cargar el resumen. Lo que registres queda guardado y se envía después.</Text> : null}
        </Pressable>

        {quickOptions.length > 0 ? (
          <View style={{ gap: 6 }}>
            <View style={styles.quickHead}>
              <Text style={styles.kicker}>Elige y confirma</Text>
              {quick.length > 0 ? (
                <Text style={styles.preview}>
                  Quedaría {formatPesos(data.net + quickNet)} ·{' '}
                  <Text accessibilityRole="button" onPress={() => setQuick([])} style={styles.clear}>
                    Limpiar
                  </Text>
                </Text>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {quickOptions.map((it) => {
                const out = isExpenseKey(it.key);
                const n = qtyOf(quick, it.key);
                return (
                  <Pressable
                    key={it.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.name}, ${formatPesos(it.price)}${n ? `, ${n} elegidos` : ''}`}
                    accessibilityHint="Lo agrega al borrador; para registrar, mantén pulsado el botón de abajo"
                    onPress={() => setQuick((q) => bumpLine(q, { key: it.key, name: it.name, unitPrice: it.price, itemId: it.itemId, category: it.category, source: 'known' }, 1))}
                    style={[styles.chip, out ? styles.chipOut : styles.chipIn, n > 0 && { borderColor: out ? C.out.ink : C.in.ink }]}
                  >
                    <Text style={[styles.chipText, { color: out ? C.out.ink : C.in.ink }]} numberOfLines={1}>
                      {it.name} <Text style={styles.chipNum}>{formatPesos(it.price)}</Text>
                    </Text>
                    {n > 0 ? (
                      <View style={[styles.badge, { backgroundColor: out ? C.out.ink : C.in.ink }]}>
                        <Text style={styles.badgeText}>{n}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {quick.length > 0 ? (
              <HoldButton
                tone={quickNet >= 0 ? 'in' : 'out'}
                label={`Mantén para registrar ${quickNet >= 0 ? '+' : '−'}${formatPesos(Math.abs(quickNet))}`}
                onConfirm={confirmQuick}
                onEarly={() => say('Soltaste antes: no se registró nada.')}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.acts}>
          <Pressable accessibilityRole="button" onPress={() => morph('sale')} style={[styles.act, styles.actIn]}>
            <Ionicons name="add" size={18} color={C.action.on} />
            <Text style={styles.actText}>Venta</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => morph('expense')} style={[styles.act, styles.actOut]}>
            <Ionicons name="remove" size={18} color={C.out.on} />
            <Text style={[styles.actText, { color: C.out.on }]}>Gasto</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Contarlo por voz" onPress={() => setVoice('save')} style={[styles.act, styles.actChat]}>
            <Ionicons name="mic" size={19} color={C.action.on} />
          </Pressable>
        </View>

        {data.failedCount > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => toEmpre({ pathname: '/business/ledger/[id]', params: { id: entityId } })} style={styles.row}>
            <Ionicons name="alert-circle-outline" size={17} color={C.out.ink} />
            <Text style={[styles.rowText, { color: C.out.ink }]} numberOfLines={1}>
              {data.failedCount} {data.failedCount === 1 ? 'registro no se pudo enviar' : 'registros no se pudieron enviar'}
            </Text>
            <Ionicons name="chevron-forward" size={17} color={C.out.ink} />
          </Pressable>
        ) : null}
        {data.receivable > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => toEmpre({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } })} style={styles.row}>
            <Ionicons name="people-outline" size={17} color={C.action.solid} />
            <Text style={styles.rowText} numberOfLines={1}>
              Te deben {formatPesos(data.receivable)} en fiados
            </Text>
            <Ionicons name="chevron-forward" size={17} color={C.action.solid} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => toEmpre({ pathname: '/business/ledger/[id]', params: { id: entityId } })} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Ver todo en Empre</Text>
          <Ionicons name="open-outline" size={16} color={C.action.solid} />
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Empre Finance" onPress={close} style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, glass ? styles.veilGlass : styles.veil, { opacity: dim ? rise : rise.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]} />
      </Pressable>

      {toast ? (
        <Animated.View style={[styles.toastWrap, { top: insets.top + 8, transform: [{ translateY: toastV.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }] }]}>
          <Glass dark style={styles.toast}>
            <Text style={styles.toastText} numberOfLines={1}>
              {toast.text}
            </Text>
            <Pressable accessibilityRole="button" onPress={undo} style={styles.undo}>
              <Text style={styles.undoText}>Deshacer</Text>
            </Pressable>
          </Glass>
        </Animated.View>
      ) : null}

      <Animated.View style={[floating ? [styles.wrapPeek, { marginBottom: insets.bottom + S.sm }] : null, { transform: [{ translateY }] }]} accessibilityViewIsModal>
        {fly && !reduce ? (
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.fly,
              fly.amount >= 0 ? styles.flyIn : styles.flyOut,
              {
                opacity: flyV.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateY: flyV.interpolate({ inputRange: [0, 1], outputRange: fly.amount >= 0 ? [6, -64] : [-40, 30] }) }],
              },
            ]}
          >
            {fly.amount >= 0 ? '+' : '−'}
            {formatPesos(Math.abs(fly.amount))}
          </Animated.Text>
        ) : null}
        <Glass style={floating ? styles.card : [styles.sheetBox, { paddingBottom: insets.bottom }]}>{body}</Glass>
      </Animated.View>

      {voice && entityId ? (
        <FinanceVoice
          entityId={entityId}
          target={voice}
          demoText={shot.say}
          baseNet={data.net}
          hints={data.hints}
          onClose={() => setVoice(null)}
          onAdd={(lines, skipped) => {
            if (voice === 'sale') setSaleDraft((d) => [...d, ...lines]);
            else setExpDraft((d) => [...d, ...lines]);
            say(`${lines.length} agregado${lines.length === 1 ? '' : 's'} por voz${skipped ? `; ${skipped} quedaron fuera` : ''}.`);
          }}
          onSaved={() => {
            setVoice(null);
            if (mode === 'peek') morph('sheet');
          }}
          businessName={name}
          onOpenLedger={() => {
            setVoice(null);
            toEmpre({ pathname: '/business/ledger/[id]', params: { id: entityId } });
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
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
  screen: { flex: 1, justifyContent: 'flex-end' },
  veil: { backgroundColor: C.veil },
  veilGlass: { backgroundColor: C.veilGlass },
  wrapPeek: { marginHorizontal: S.sm },
  card: { borderRadius: R.capsule, ...fin.elevation.card },
  sheetBox: { borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, ...fin.elevation.sheet },
  capsule: { minHeight: fin.size.capsule, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingLeft: S.lg, paddingRight: S.md },
  capMain: { flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center' },
  capLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capLabel: T.kicker,
  capValue: T.capsuleAmount,
  q: { width: fin.size.round, height: fin.size.round, borderRadius: R.control, alignItems: 'center', justifyContent: 'center' },
  qIn: { backgroundColor: C.in.fill },
  qOut: { backgroundColor: C.out.fill },
  qChat: { backgroundColor: C.action.solid },
  pend: { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: 7, paddingVertical: 1, borderRadius: R.badge, backgroundColor: C.out.soft },
  pendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.out.fill },
  pendText: { ...T.small, fontSize: 10.5, color: C.out.ink },
  stateBox: { padding: S.lg, minHeight: 200, justifyContent: 'center' },
  sheet: { paddingHorizontal: S.lg, paddingBottom: S.lg, gap: S.md },
  grabHit: { alignSelf: 'center', paddingVertical: S.sm, paddingHorizontal: 40 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.handle },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md, marginTop: -S.xs },
  h1: T.title,
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 24 },
  sub: { ...T.label, flexShrink: 1 },
  subB: { fontFamily: T.button.fontFamily, color: C.text },
  x: { width: fin.size.touch, height: fin.size.touch, borderRadius: R.control, backgroundColor: C.inner, alignItems: 'center', justifyContent: 'center' },
  picker: { borderRadius: R.inner, backgroundColor: C.inner, padding: 6 },
  pick: { minHeight: fin.size.touch, borderRadius: R.key, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md },
  pickOn: { backgroundColor: C.action.soft },
  pickText: { ...T.body, flex: 1 },
  hero: { borderRadius: R.inner, backgroundColor: C.inner, padding: S.lg, paddingBottom: S.md, gap: 6 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: T.kicker,
  chg: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: S.sm, paddingVertical: 2, borderRadius: R.badge, backgroundColor: C.in.soft },
  chgDown: { backgroundColor: C.out.soft },
  chgText: { ...T.small, fontFamily: T.button.fontFamily, color: C.in.ink },
  big: T.heroAmount,
  split: { flexDirection: 'row', gap: S.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line },
  splitLabel: { ...T.small, fontSize: 11, color: C.textSoft },
  splitValue: T.amount,
  stale: { ...T.small, color: C.warn },
  quickHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, gap: S.sm },
  preview: { ...T.small, flexShrink: 1, color: C.textSoft },
  clear: { color: C.action.link, textDecorationLine: 'underline' },
  chip: { minHeight: fin.size.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, borderRadius: R.control, borderWidth: 2, borderColor: 'transparent', maxWidth: 220 },
  chipIn: { backgroundColor: C.in.soft },
  chipOut: { backgroundColor: C.out.soft },
  chipText: { ...T.small, fontSize: 12.5, flexShrink: 1 },
  chipNum: { fontFamily: T.amount.fontFamily },
  badge: { minWidth: 20, height: 20, borderRadius: R.badge, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { ...T.small, fontSize: 11, fontFamily: T.button.fontFamily, color: C.in.on },
  acts: { flexDirection: 'row', gap: 6 },
  act: { flex: 1, minHeight: fin.size.button, borderRadius: R.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actIn: { backgroundColor: C.in.solid },
  actOut: { backgroundColor: C.out.fill },
  actChat: { flex: 0, width: fin.size.button, backgroundColor: C.action.solid },
  actText: { ...T.button, color: C.in.on },
  row: { minHeight: fin.size.touch, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.xs, borderTopWidth: 1, borderTopColor: C.line },
  rowText: { ...T.small, fontSize: 12.5, flex: 1, color: C.action.link },
  seeAll: { minHeight: fin.size.key, borderRadius: R.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.action.soft },
  seeAllText: { ...T.button, fontSize: 13, color: C.action.link },
  fly: { position: 'absolute', top: -6, alignSelf: 'center', zIndex: 3, fontSize: 20, fontFamily: T.amount.fontFamily, paddingHorizontal: S.md, paddingVertical: S.xs, borderRadius: R.badge, overflow: 'hidden' },
  flyIn: { color: C.in.ink, backgroundColor: alpha(C.in.soft, 0.95) },
  flyOut: { color: C.out.ink, backgroundColor: alpha(C.out.soft, 0.95) },
  toastWrap: { position: 'absolute', alignSelf: 'center', zIndex: 10, maxWidth: '92%' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingLeft: S.lg, paddingRight: 6, paddingVertical: 6, borderRadius: R.control, backgroundColor: alpha(C.voice.bg, 0.92) },
  toastText: { ...T.small, fontSize: 12.5, flexShrink: 1, color: C.voice.text },
  undo: { minHeight: 36, paddingHorizontal: S.md, borderRadius: R.control, backgroundColor: C.voice.chip, justifyContent: 'center' },
  undoText: { ...T.button, fontSize: 12.5, color: C.voice.text },
});
