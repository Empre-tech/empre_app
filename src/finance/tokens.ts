import type { TextStyle } from 'react-native';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';

// Tokens de Empre Finance (3.46 F2), sacados de theme.ts y del mockup versión 6 (mockups/empre_finance_bandeja.html).
// Ningún estilo de Finance escribe colores, radios, tamaños de letra ni tiempos a mano: los lee de aquí. Los pares de
// color están en palette.ts y una prueba verifica que pasan AA. El gris de texto secundario es `mutedDark`: el
// `muted` de la app no llega a 4,5:1 sobre los fondos claros de las tarjetas (4,3:1 sobre `bg`).

export const fin = {
  color: {
    surface: colors.surface,
    inner: colors.bg, // tarjetas dentro de la hoja (resumen, filas, teclas)
    control: colors.surfaceAlt, // pestañas, medios de pago, categorías sin elegir
    line: colors.line,
    text: colors.ink,
    textSoft: colors.mutedDark,
    disabled: colors.mutedLight,
    veil: alpha(colors.ink, 0.45), // sin vidrio: el mismo velo de las demás hojas de la app
    veilGlass: alpha(colors.ink, 0.16), // con vidrio: casi no apaga la pantalla (mockup)
    glass: alpha(colors.surface, 0.72), // tinte sobre el desenfoque, para que el texto se lea
    glassEdge: alpha(colors.white, 0.7),
    innerGlass: alpha(colors.surface, 0.86), // tarjetas interiores sobre el vidrio (mockup: --glass-strong)
    controlGlass: alpha(colors.ink, 0.06), // pestañas y medios de pago sobre el vidrio
    roundGlass: alpha(colors.surface, 0.75), // botones redondos (cerrar, volver) sobre el vidrio
    handle: colors.line,
    in: { ink: colors.successInk, soft: colors.successSoft, solid: colors.successSolid, fill: colors.success, on: colors.white },
    out: { ink: colors.accentInk, soft: colors.accentSoft, solid: colors.accentInk, fill: colors.accent, on: colors.ink, onSolid: colors.white },
    action: { solid: colors.primary, soft: colors.primarySoft, on: colors.white, link: colors.primary },
    warn: colors.accentInk,
    voice: {
      bg: colors.ink,
      text: colors.white,
      textSoft: colors.onDarkSoft,
      hint: alpha(colors.white, 0.72),
      highlight: colors.onDarkLink,
      warn: colors.accentLight,
      card: alpha(colors.white, 0.1),
      cardEdge: alpha(colors.white, 0.14),
      chip: alpha(colors.white, 0.14),
      ring: alpha(colors.onDarkLink, 0.35),
      orb: colors.primary,
      orbListening: colors.verified,
      orbEdge: alpha(colors.onDarkLink, 0.45),
      tintIn: alpha(colors.success, 0.22),
      tintOut: alpha(colors.accent, 0.22),
      recording: colors.danger, // micrófono mientras escucha
      overlay: alpha(colors.night, 0.75), // confirmación «guardado»
      tile: colors.white, // botones blancos (micrófono, Guardar)
    },
  },

  /** Familias de letra (las mismas de la app: Nunito para títulos y montos, Manrope para la interfaz). */
  font: {
    display: fonts.display.bold,
    displaySoft: fonts.display.semibold,
    uiMedium: fonts.ui.medium,
    uiSemibold: fonts.ui.semibold,
    uiBold: fonts.ui.bold,
    uiExtra: fonts.ui.extrabold,
  },

  radius: {
    capsule: radius.lg + 6, // 26
    sheet: radius.lg + 10, // 30
    inner: radius.lg, // 20
    key: radius.md, // 14: teclas, chips, «Ver todo», pestañas por fuera
    button: radius.md + 2, // 16: botones de la cápsula, Venta y Gasto, «Mantén para registrar»
    cta: radius.md + 4, // 18: el botón grande de los paneles
    tab: radius.sm + 1, // 11: la pestaña elegida
    segItem: radius.sm + 3, // 13: el medio de pago elegido
    field: radius.sm + 2, // 12: el campo de texto y «Agregar a la venta»
    control: radius.pill,
    badge: radius.pill,
  },

  space: spacing,

  /** Desenfoque del vidrio (expo-blur): intensidad y método de Android (12+). */
  blur: { intensity: 60, tint: 'light', android: 'dimezisBlurViewSdk31Plus' },

  /** Altos mínimos de toque (dp). */
  size: { touch: 44, key: 48, button: 52, act: 48, round: 46, mic: 72, capsule: 76, tab: 38, method: 40, field: 42, step: 36 },

  type: {
    title: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.ink },
    panelTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
    heroAmount: { fontSize: 38, fontFamily: fonts.display.bold, color: colors.ink },
    panelAmount: { fontSize: 46, fontFamily: fonts.display.bold },
    capsuleAmount: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink },
    amount: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
    split: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
    key: { fontSize: 21, fontFamily: fonts.display.bold, color: colors.ink },
    kicker: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontFamily: fonts.ui.extrabold, color: colors.mutedDark },
    label: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.mutedDark },
    body: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
    button: { fontSize: 14.5, fontFamily: fonts.ui.extrabold },
    small: { fontSize: 11.5, fontFamily: fonts.ui.bold },
  } satisfies Record<string, TextStyle>,

  elevation: {
    card: shadow,
    sheet: { shadowColor: colors.black, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16 },
  },

  /** Movimiento: los mismos valores de la tabla «Movimiento» del mockup. Con «Reducir movimiento» nada se anima. */
  motion: {
    rise: { stiffness: 210, damping: 18, mass: 0.9 }, // la cápsula sube con un pequeño rebote (~460 ms)
    morphMs: 420, // cápsula → hoja, sin rebote
    sinkMs: 220, // cerrar: se hunde
    roll: { stiffness: 280, damping: 20, mass: 0.6 }, // dígitos que ruedan (~620 ms)
    bars: { stiffness: 180, damping: 14 }, // barras de la semana
    barsStaggerMs: 40,
    card: { stiffness: 220, damping: 16 }, // tarjetas de la voz
    toast: { stiffness: 240, damping: 18 },
    holdMs: 650,
    holdReducedMs: 450,
    flyMs: 1100, // el monto que sube o baja
    undoMs: 5000,
    pulseMs: 700, // la esfera respira mientras escucha
    flashMs: 900, // el tinte al entender algo
  },
} as const;
