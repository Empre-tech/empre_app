// Identidad de Empre (lienzo «Empre · Marca», 2026-11-10): luz con anclas negras.
// Base clara y neutra; el negro ancla (mapa, barra, botones); el verde pulso solo para lo que pasa ahora
// (#0D7A5F sobre claro, #2FD98F luminoso sobre negro). Cada producto tiene su tono y lo usa solo en sus piezas:
// coral en Ofertas, índigo en Plata (Finance), violeta en Agenda. Sin rojo: los errores van en negro con ícono.
export const colors = {
  primary: '#111318', // botón principal en negro (texto blanco, 18,5:1)
  primaryDark: '#0D7A5F', // enlaces y texto de acento sobre blanco (5,3:1)
  primaryPressed: '#22252B',
  primarySoft: '#E7F3EF',
  brand: '#0D7A5F', // nodo del logo, foco y lo que pasa ahora
  selected: '#111318', // lo elegido va en negro...
  selectedSoft: '#EFF0F2', // ...sobre gris claro
  // Ofertas: coral solo en sus piezas (etiqueta, precio tachado, «termina hoy»)
  accent: '#F09A7A', // fondo de la etiqueta de oferta (texto en negro encima)
  accentDark: '#E8896A',
  accentInk: '#B4552B', // coral para TEXTO sobre blanco (4,6:1)
  accentSoft: '#FBEDE6',
  ink: '#111318', // todo el texto
  muted: '#5B606B', // texto secundario (6,4:1 sobre blanco)
  line: '#E4E6EA', // bordes y separadores
  bg: '#F5F5F6', // fondo de las pantallas
  surface: '#FFFFFF', // tarjetas
  verified: '#0D7A5F', // abierto, verificado, lo bueno
  verifiedSoft: '#E7F3EF',
  danger: '#111318', // errores: negro con ícono, nunca rojo
  success: '#0D7A5F',
  warning: '#111318', // se acaba pronto: negro y subrayado, no naranja
  hairline: '#E4E6EA',
  faint: '#6B7079', // etiquetas pequeñas y pestañas sin elegir
  placeholder: '#8E929A',
  // Anclas negras y el verde que brilla sobre ellas
  night: '#111318',
  nightLine: '#22252B',
  nightSoft: '#3A3E46',
  nightText: '#CBCED4',
  glow: '#2FD98F', // verde luminoso: solo sobre negro (10:1)
  glowSoft: 'rgba(47,217,143,0.16)',
  // Tonos de producto, solo dentro de sus piezas
  finance: '#4B5BB5',
  financeLight: '#8C96D6',
  financeSoft: '#ECEEF9',
  agenda: '#7A52B3',
  agendaLight: '#B39AD6',
  agendaSoft: '#F2ECF9',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Tipografía: Inter en toda la app (títulos y texto), como en el lienzo. SF Pro solo se puede usar en Apple; Inter es
 * su par libre y se ve igual en iPhone, Android y web. Se carga con expo-font en app/_layout.tsx; hasta que carga, RN
 * usa la fuente del sistema.
 */
export const fonts = {
  display: {
    medium: 'Inter_600SemiBold',
    semibold: 'Inter_700Bold',
    bold: 'Inter_800ExtraBold',
  },
  ui: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
} as const;

/** Sombra de las tarjetas sobre fondo blanco (como en la vitrina). */
export const cardShadow = {
  shadowColor: '#111318',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** Sombra suave para tarjetas sobre el fondo gris alabastro. */
export const softShadow = {
  shadowColor: '#111318',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

/** Sombra suave de los controles que flotan sobre el mapa. */
export const shadow = {
  shadowColor: '#111318',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;
