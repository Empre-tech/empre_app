// Identidad de Empre (lienzo «Empre · Marca», 2026-11-12): blanco, negro y el rojo de Empre.
// El rojo #F03232 va en formas (punto, botón Empre, lo elegido que brilla); para TEXTO rojo o fondo con letra blanca,
// #D42020 (5,2:1). Los logos nunca van en rojo. Solo dos tonos más, cada uno en su parte:
// verde #0B7F3D para la plata y Finance, naranja #FF9A1F (con letra negra) para las ofertas.
// Los errores van en negro con ícono: el rojo es la marca, no una alarma.
export const colors = {
  primary: '#111318', // botón principal en negro (texto blanco, 18,5:1)
  primaryDark: '#D42020', // enlaces y texto de acento sobre blanco (5,2:1)
  primaryPressed: '#22252B',
  primarySoft: '#FDECEC',
  brand: '#F03232', // el rojo de Empre en formas: punto, foco y lo que pasa ahora
  selected: '#111318', // lo elegido va en negro...
  selectedSoft: '#EFF0F2', // ...sobre gris claro
  // Ofertas: naranja solo en sus piezas (etiqueta, «termina hoy», lo que ahorras)
  accent: '#FF9A1F', // fondo de la etiqueta de oferta (texto en negro encima, 8,7:1)
  accentDark: '#E8860A',
  accentInk: '#A35C13', // naranja para TEXTO sobre blanco (4,9:1)
  accentSoft: '#FEF3E9',
  ink: '#111318', // todo el texto
  muted: '#5B606B', // texto secundario (6,4:1 sobre blanco)
  line: '#E4E6EA', // bordes y separadores
  bg: '#F5F5F6', // fondo de las pantallas
  surface: '#FFFFFF', // tarjetas
  verified: '#D42020', // abierto, verificado, hecho
  verifiedSoft: '#FDECEC',
  danger: '#111318', // errores: negro con ícono, nunca rojo
  success: '#D42020',
  warning: '#111318', // se acaba pronto: negro y subrayado, no naranja
  hairline: '#E4E6EA',
  faint: '#6B7079', // etiquetas pequeñas y pestañas sin elegir
  placeholder: '#8E929A',
  // Anclas negras y el rojo que brilla sobre ellas
  night: '#111318',
  nightLine: '#22252B',
  nightSoft: '#3A3E46',
  nightText: '#CBCED4',
  glow: '#FF6B6B', // rojo claro: solo sobre negro (6,6:1)
  glowSoft: 'rgba(240,50,50,0.18)',
  // Plata y Finance: verde. Lo que entra en verde; gastos y fiado en negro.
  finance: '#0B7F3D', // texto y formas sobre blanco (5,1:1)
  financeLight: '#9FCFA6', // sobre negro
  financeSoft: '#E8F5EC',
  // La agenda es de Empre: rojo y negro
  agenda: '#D42020',
  agendaLight: '#F7A8A8',
  agendaSoft: '#FDECEC',
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
