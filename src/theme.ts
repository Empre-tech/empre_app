// Identidad de Empre (lienzo «Empre · Marca», 2026-11-13): 65 % arena (fondos), 20 % crema (tarjetas), 10 % rojo
// (lo que se toca y la marca) y 5 % tonos oscuros (el texto). El blanco puro solo como letra sobre rojo.
// El rojo #F03232 va en formas (punto, botón Empre, lo elegido que brilla); para TEXTO rojo o fondo con letra blanca,
// #D42020 (5,2:1). Los logos nunca van en rojo. Solo dos tonos más, cada uno en su parte:
// verde #0B7F3D para la plata y Finance, naranja #FF9A1F (con letra negra) para las ofertas.
// Los errores van en negro con ícono: el rojo es la marca, no una alarma.
// El rojo es un ACENTO (2026-11-14, «el rojo es como el negro: si resalta mucho, pesa»): relleno solo en el botón
// principal, el botón Empre, la pestaña activa y los puntos del mapa; en texto, solo lo urgente («Cierra en 40 min»).
// «Abierto» va en tinta con un punto rojo; enlaces y subtítulos en tinta o gris; contadores en rojo suave (#FDECEC).
export const colors = {
  primary: '#D42020', // botón principal en rojo de Empre (texto blanco, 5,2:1)
  primaryDark: '#B91C1C', // texto rojo y enlaces sobre arena (6,2:1) y crema (6,3:1)
  primaryPressed: '#B01A1A',
  primarySoft: '#FDECEC',
  brand: '#F03232', // el rojo de Empre en formas: punto, foco y lo que pasa ahora
  selected: '#2B2622', // lo elegido: texto en tinta...
  selectedSoft: '#E8DCC2', // ...sobre arena (el complemento del rojo)
  // Ofertas: naranja solo en sus piezas (etiqueta, «termina hoy», lo que ahorras)
  accent: '#FF9A1F', // fondo de la etiqueta de oferta (texto en negro encima, 8,7:1)
  accentDark: '#E8860A',
  accentInk: '#8C4E10', // naranja para TEXTO sobre arena (5,1:1)
  accentSoft: '#FEF3E9',
  ink: '#2B2622', // el texto: tinta cálida, no negro puro. El negro es solo texto (~10 %)
  muted: '#5C5448', // texto secundario (7,2:1 sobre arena, 5,5:1 sobre arena elegida)
  line: '#E6DAC3', // bordes y separadores, cálidos
  // ARENA casi blanca, ~65 %: el fondo de todas las pantallas (2026-11-14: a medio camino del blanco, con la misma
  // intensidad de arena para que el tono se note).
  // Arriba, un degradado apenas más hondo: ScreenGlow.
  bg: '#FEFAF2',
  surface: '#FFFEFB', // CREMA, ~20 %: tarjetas, hojas y barras, un paso más claras que el fondo
  verified: '#B91C1C', // abierto, verificado, hecho (texto)
  verifiedSoft: '#FDECEC',
  danger: '#2B2622', // errores: negro con ícono, nunca rojo
  success: '#B91C1C',
  warning: '#2B2622', // se acaba pronto: negro y subrayado, no naranja
  hairline: '#E6DAC3',
  faint: '#5C5448', // etiquetas pequeñas y pestañas sin elegir
  placeholder: '#5C5448', // texto de ejemplo en los campos: legible (4,8:1), más claro que el texto
  // Anclas negras y el rojo que brilla sobre ellas
  night: '#F2E9D8', // las anclas ya no son negras: arena clara
  nightLine: '#E6DAC3',
  nightSoft: '#D3C29C',
  nightText: '#5C5448',
  glow: '#B91C1C', // lo vivo en rojo, como texto (sobre arena 5,1:1)
  glowSoft: 'rgba(212,32,32,0.12)',
  // Arena: el complemento del rojo, en poca cantidad (chips, lo elegido, etiquetas)
  sand: '#E8DCC2',
  sandSoft: '#F2E9D8',
  sandInk: '#6E5830', // arena para texto sobre crema
  // Plata y Finance: verde. Lo que entra en verde; gastos y fiado en negro.
  finance: '#0A6E35', // texto y formas sobre arena (5:1)
  financeLight: '#0A6E35', // ya no hay fondos negros: el verde de siempre
  financeSoft: '#E8F5EC',
  // La agenda es de Empre: rojo y negro
  agenda: '#D42020',
  agendaLight: '#F7A8A8',
  agendaSoft: '#FDECEC',
  // El degradado de arriba en Inicio y Ofertas: arena más honda que se funde con el fondo.
  glowTop: '#F2E8D5',
  // Abajo, el fondo termina en blanco (el usuario lo pidió así, 2026-11-14): arena arriba → blanco abajo (ScreenGlow).
  bgEnd: '#FFFFFF',
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
