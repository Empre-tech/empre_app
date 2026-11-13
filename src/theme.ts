// Identidad de Empre (lienzo «Empre · Marca», 2026-11-12): blanco, negro y el rojo de Empre.
// El rojo #F03232 va en formas (punto, botón Empre, lo elegido que brilla); para TEXTO rojo o fondo con letra blanca,
// #D42020 (5,2:1). Los logos nunca van en rojo. Solo dos tonos más, cada uno en su parte:
// verde #0B7F3D para la plata y Finance, naranja #FF9A1F (con letra negra) para las ofertas.
// Los errores van en negro con ícono: el rojo es la marca, no una alarma.
export const colors = {
  primary: '#D42020', // botón principal en rojo de Empre (texto blanco, 5,2:1)
  primaryDark: '#D42020', // enlaces y texto de acento sobre blanco (5,2:1)
  primaryPressed: '#B01A1A',
  primarySoft: '#FDECEC',
  brand: '#F03232', // el rojo de Empre en formas: punto, foco y lo que pasa ahora
  selected: '#2B2622', // lo elegido: texto en tinta...
  selectedSoft: '#EADCBF', // ...sobre arena (el complemento del rojo)
  // Ofertas: naranja solo en sus piezas (etiqueta, «termina hoy», lo que ahorras)
  accent: '#FF9A1F', // fondo de la etiqueta de oferta (texto en negro encima, 8,7:1)
  accentDark: '#E8860A',
  accentInk: '#A35C13', // naranja para TEXTO sobre blanco (4,9:1)
  accentSoft: '#FEF3E9',
  ink: '#2B2622', // el texto: tinta cálida, no negro puro. El negro es solo texto (~10 %)
  muted: '#6B6358', // texto secundario cálido (5,9:1 sobre blanco, 5,3:1 sobre arena clara)
  line: '#E9E1D3', // bordes y separadores, cálidos
  bg: '#F7F3EC', // fondo de las pantallas: arena muy clara
  surface: '#FFFFFF', // tarjetas
  verified: '#D42020', // abierto, verificado, hecho
  verifiedSoft: '#FDECEC',
  danger: '#2B2622', // errores: negro con ícono, nunca rojo
  success: '#D42020',
  warning: '#2B2622', // se acaba pronto: negro y subrayado, no naranja
  hairline: '#E9E1D3',
  faint: '#6B6358', // etiquetas pequeñas y pestañas sin elegir
  placeholder: '#6B6358', // texto de ejemplo en los campos: legible (4,8:1), más claro que el texto
  // Anclas negras y el rojo que brilla sobre ellas
  night: '#F3EBDD', // las anclas ya no son negras: arena clara
  nightLine: '#E2D5BC',
  nightSoft: '#D9C9A8',
  nightText: '#6B6358',
  glow: '#D42020', // lo vivo en rojo (sobre arena 4,7:1)
  glowSoft: 'rgba(212,32,32,0.12)',
  // Arena: el complemento del rojo, en poca cantidad (chips, lo elegido, etiquetas)
  sand: '#EADCBF',
  sandSoft: '#F3EBDD',
  sandInk: '#7A6236', // arena para texto sobre blanco (5,8:1)
  // Plata y Finance: verde. Lo que entra en verde; gastos y fiado en negro.
  finance: '#0B7F3D', // texto y formas sobre blanco (5,1:1)
  financeLight: '#0B7F3D', // ya no hay fondos negros: el verde de siempre
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
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_600SemiBold',
  },
  ui: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_600SemiBold',
    extrabold: 'Inter_700Bold',
  },
} as const;

/** Sombra de las tarjetas sobre fondo blanco (como en la vitrina). */
export const cardShadow = {
  shadowColor: '#2B2622',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** Sombra suave para tarjetas sobre el fondo gris alabastro. */
export const softShadow = {
  shadowColor: '#2B2622',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

/** Sombra suave de los controles que flotan sobre el mapa. */
export const shadow = {
  shadowColor: '#2B2622',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;
