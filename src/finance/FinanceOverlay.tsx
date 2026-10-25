import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Reanimated, { Easing, FadeIn, FadeInLeft, FadeInRight, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { PayMethod } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { FlyAmount, UndoToast } from '@/components/finance/Celebration';
import { CapsuleLoading, FinanceCapsule } from '@/components/finance/FinanceCapsule';
import { FinanceSheet, GRAB_SLOP, isExpenseKey } from '@/components/finance/FinanceSheet';
import { FinanceVoice } from '@/components/finance/FinanceVoice';
import { Glass, useGlass } from '@/components/finance/Glass';
import { MoneyPanel } from '@/components/finance/MoneyPanel';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useCelebration, type Done } from '@/finance/useCelebration';
import { useFinanceBusiness, useFinanceData, type KnownItem } from '@/finance/useFinance';
import { draftTotal, expenseInputsFrom, saleInputFrom, type DraftLine } from '@/lib/finance';
import { formatPesos, newClientId } from '@/lib/ledger';
import { useEventCallback } from '@/lib/useEventCallback';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { queueExpense, queueSale, queueVoid } from '@/ledger/ledgerStore';
import { fin } from '@/finance/tokens';

const C = fin.color;
const M = fin.motion;
const R = fin.radius;
const S = fin.space;

/**
 * Empre Finance (3.45). Una sola pieza de vidrio que cambia de forma: nace como cápsula («Hoy te quedó» y los botones
 * de venta, gasto y voz) y se estira hasta la hoja con el resumen del día y la semana. Desde ahí se registra con
 * intención: elegir arma un borrador y registrar pide mantener pulsado. Ver más, fiados o crédito llevan a «Mi
 * negocio». Se abre con doble toque en «+ Nueva», con el acceso rápido del ícono o con empre://finance.
 *
 * Es una capa sobre toda la app (la monta FinanceHost, 3.46 F3), no una pantalla de la navegación: así el vidrio puede
 * desenfocar lo que hay detrás también en Android. Este archivo lleva la forma de la pieza, el modo, los borradores y
 * el registro; lo que se ve está en FinanceCapsule, FinanceSheet, MoneyPanel, FinanceVoice y Celebration (3.51).
 */

type Mode = 'peek' | 'sheet' | 'sale' | 'expense';

// Ganchos de prueba, SOLO en desarrollo: el banco de capturas (scripts/finance-shots.sh) abre cada estado directo con
// empre://finance?mode=sale&tab=man, ?voice=save&say=…, ?pick=2 (elige los 2 primeros), ?sim=server (resumen que
// falla) o ?sim=nobiz (sin negocio). En la app publicada se ignoran.
type ShotParams = { mode?: string; tab?: string; voice?: string; say?: string; pick?: string; sim?: string };

/** Lo que abre la bandeja: el negocio (opcional) y, solo en desarrollo, los ganchos de prueba. */
export type FinanceParams = { entity?: string } & ShotParams;
const MODES: Mode[] = ['peek', 'sheet', 'sale', 'expense'];
const pickOne = <T extends string>(v: string | undefined, list: readonly T[]): T | undefined => (__DEV__ && v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

const say = (text: string) => AccessibilityInfo.announceForAccessibility(text);
const toLine = (it: KnownItem): DraftLine => ({ key: it.key, name: it.name, unitPrice: it.price, itemId: it.itemId, category: it.category, source: 'known', qty: 1 });

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
  const party = useCelebration();

  const [mode, setMode] = useState<Mode>(shot.mode ?? 'peek');
  const [fromMode, setFromMode] = useState<Mode>(mode); // de dónde viene (para que el contenido entre del lado correcto)
  const [voice, setVoice] = useState<null | 'save' | 'sale' | 'expense'>(shot.voice ?? null);
  const [quick, setQuick] = useState<DraftLine[]>([]);
  const [saleDraft, setSaleDraft] = useState<DraftLine[]>([]);
  const [expDraft, setExpDraft] = useState<DraftLine[]>([]);
  const [method, setMethod] = useState<PayMethod>('cash');

  const rise = useSharedValue(0);
  const shape = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    rise.set(reduce ? 1 : withSpring(1, M.rise));
    // Solo al montar: la entrada se anima una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La misma pieza cambia de forma: el cambio de modo solo cambia el contenido; el alto, las esquinas y los márgenes
  // se animan solos en el hilo de la interfaz (ver frameStyle).
  const morph = (next: Mode) => {
    setFromMode(mode);
    setMode(next);
  };

  const close = () => {
    if (reduce) return onClosed();
    rise.set(
      withTiming(0, { duration: M.sinkMs, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(onClosed);
      }),
    );
  };
  /** Ver más en «Mi negocio»: la bandeja se va y se abre la pantalla de Empre (Atrás vuelve a donde estabas). */
  const toEmpre = (href: Href) => {
    onClosed();
    router.push(href);
  };

  // Atrás de Android: de la voz o un panel se vuelve a la hoja; si no, se cierra. Se registra una sola vez y siempre
  // llama a la versión actual.
  const onBack = useEventCallback(() => {
    if (voice) setVoice(null);
    else if (mode === 'sale' || mode === 'expense') morph('sheet');
    else close();
    return true;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [onBack]);

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
    party.take().forEach((d) => queueVoid(d.kind, entityId, d.id, 'Deshecho al momento'));
    say('Deshecho.');
  };

  // «Elige y confirma»: tus servicios más vendidos y tu gasto más frecuente.
  const quickOptions: KnownItem[] = useMemo(() => [...data.services.slice(0, 3), ...data.usualExpenses.slice(0, 1)], [data.services, data.usualExpenses]);
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !shot.pick || quickOptions.length === 0) return;
    picked.current = true;
    setQuick(quickOptions.slice(0, shot.pick).map(toLine));
  }, [shot.pick, quickOptions]);
  const quickSales = quick.filter((l) => !isExpenseKey(l.key));
  const quickExp = quick.filter((l) => isExpenseKey(l.key));
  const quickNet = draftTotal(quickSales) - draftTotal(quickExp);
  const confirmQuick = () => {
    const done = [...registerSale(quickSales, 'cash'), ...registerExpenses(quickExp)];
    setQuick([]);
    party.celebrate(quickNet, quickNet >= 0 ? `Registrado +${formatPesos(quickNet)}` : `Registrado −${formatPesos(-quickNet)}`, done);
  };

  const confirmPanel = (kind: 'sale' | 'expense') => {
    const lines = kind === 'sale' ? saleDraft : expDraft;
    const t = draftTotal(lines);
    const done = kind === 'sale' ? registerSale(lines, method) : registerExpenses(lines);
    (kind === 'sale' ? setSaleDraft : setExpDraft)([]);
    morph('sheet');
    party.celebrate(kind === 'sale' ? t : -t, kind === 'sale' ? `Venta de ${formatPesos(t)} registrada` : `Gasto de ${formatPesos(t)} registrado`, done);
  };

  const chooseBusiness = (id: string) => {
    biz.choose(id);
    setQuick([]);
    setSaleDraft([]);
    setExpDraft([]);
  };

  const name = biz.entity?.name ?? '';
  const maxH = winH - insets.top - 24;
  // La cápsula flota como tarjeta; la hoja y los paneles se pegan abajo, como las demás hojas de Empre.
  const floating = mode === 'peek' && Boolean(biz.entity) && !biz.loading;
  useEffect(() => {
    const to = floating ? 0 : 1;
    shape.set(reduce ? to : withTiming(to, { duration: M.morphMs, easing: Easing.out(Easing.cubic) }));
  }, [floating, reduce, shape]);

  const bottomGap = insets.bottom + S.sm;
  const frameStyle = useAnimatedStyle(() => ({
    height: height.get() > 0 ? height.get() : undefined,
    marginHorizontal: interpolate(shape.get(), [0, 1], [S.sm, 0]),
    marginBottom: interpolate(shape.get(), [0, 1], [bottomGap, 0]),
    borderTopLeftRadius: interpolate(shape.get(), [0, 1], [R.capsule, R.sheet]),
    borderTopRightRadius: interpolate(shape.get(), [0, 1], [R.capsule, R.sheet]),
    borderBottomLeftRadius: interpolate(shape.get(), [0, 1], [R.capsule, 0]),
    borderBottomRightRadius: interpolate(shape.get(), [0, 1], [R.capsule, 0]),
    transform: [{ translateY: interpolate(rise.get(), [0, 1], [winH * 0.5, 0]) }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: rise.get() * interpolate(shape.get(), [0, 1], [0.35, 1]) }));

  /** El alto del contenido manda: la pieza se estira o se encoge hasta él (la primera vez, sin animar: ya sube). */
  const onContent = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    const current = height.get();
    if (h <= 0 || Math.abs(h - current) < 1) return;
    height.set(current === 0 || reduce ? h : withTiming(h, { duration: M.morphMs, easing: Easing.out(Easing.cubic) }));
  };
  // Al cambiar de contenido, el nuevo entra suave: los paneles desde la derecha y la vuelta a la hoja desde la izquierda.
  const entering = reduce
    ? undefined
    : mode === 'sale' || mode === 'expense'
      ? FadeInRight.duration(M.morphMs)
      : fromMode === 'sale' || fromMode === 'expense'
        ? FadeInLeft.duration(M.morphMs)
        : FadeIn.duration(220).delay(60);

  // ---- contenido según el estado ----
  let body: React.ReactNode;
  if (biz.loading) {
    body = <CapsuleLoading />;
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
      <FinanceCapsule
        net={data.net}
        label={data.problem === 'offline' && data.failed ? 'Sin conexión · registra igual' : data.failed ? 'Resumen no disponible' : 'Hoy te quedó'}
        pendingCount={data.pendingCount}
        onOpen={() => morph('sheet')}
        onSale={() => morph('sale')}
        onExpense={() => morph('expense')}
        onVoice={() => setVoice('save')}
      />
    );
  } else if (mode === 'sale' || mode === 'expense') {
    body = (
      <ScrollView style={{ maxHeight: maxH }} contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" bounces={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al resumen" onPress={() => morph('sheet')} hitSlop={GRAB_SLOP} style={styles.grabHit}>
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
      <FinanceSheet
        maxHeight={maxH}
        name={name}
        list={biz.list}
        entityId={entityId}
        data={data}
        glass={glass}
        quickOptions={quickOptions}
        quick={quick}
        quickNet={quickNet}
        onQuick={setQuick}
        onConfirmQuick={confirmQuick}
        onChoose={chooseBusiness}
        onPeek={() => morph('peek')}
        onClose={close}
        onSale={() => morph('sale')}
        onExpense={() => morph('expense')}
        onVoice={() => setVoice('save')}
        onEmpre={toEmpre}
        onSay={say}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Empre Finance" onPress={close} style={StyleSheet.absoluteFill}>
        <Reanimated.View style={[StyleSheet.absoluteFill, glass ? styles.veilGlass : styles.veil, veilStyle]} />
      </Pressable>

      {party.toast ? <UndoToast toast={party.toast} top={insets.top + 8} onUndo={undo} /> : null}

      <Reanimated.View style={[styles.frame, floating && styles.frameFloating, !glass && styles.frameSolid, frameStyle]} accessibilityViewIsModal>
        {party.fly ? <FlyAmount fly={party.fly} onDone={party.flyDone} /> : null}
        <Glass style={StyleSheet.absoluteFill} />
        <View style={[styles.content, { paddingBottom: floating ? 0 : insets.bottom }]} onLayout={onContent}>
          <Reanimated.View key={`${mode}:${biz.loading ? 'l' : biz.entity ? 'e' : 'n'}`} entering={entering}>
            {body}
          </Reanimated.View>
        </View>
      </Reanimated.View>

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

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  veil: { backgroundColor: C.veil },
  veilGlass: { backgroundColor: C.veilGlass },
  // Un marco recorta el vidrio y el contenido; su forma la anima frameStyle. El contenido va arriba y se mide.
  frame: { overflow: 'hidden', ...fin.elevation.sheet },
  frameFloating: fin.elevation.card,
  frameSolid: { backgroundColor: C.surface }, // Android solo dibuja la sombra (elevation) si el marco tiene fondo
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
  stateBox: { padding: S.lg, minHeight: 200, justifyContent: 'center' },
  sheet: { paddingHorizontal: S.lg, paddingBottom: S.lg, gap: S.md },
  grabHit: { alignSelf: 'center', paddingVertical: S.sm, paddingHorizontal: 40 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.handle },
});
