// Identidad visual de Empre: amigable y luminosa, tomada del logo. El azul de
// "EMP" es el color principal (acciones, enlaces, selección), el naranja de
// "RE" es el acento que da calidez (destacados, insignias, llamadas a la
// acción secundarias) y el verde azulado del pin se reserva para confianza y
// verificación. Todas las pantallas y componentes leen de aquí, así que un
// cambio aquí se propaga a toda la app.
export const colors = {
  primary: '#2468C6', // azul "EMP": acción principal (botones, selección, enlaces)
  primaryDark: '#1A4F9C',
  primarySoft: '#E8F0FB', // fondo suave para chips/estados activos en azul
  accent: '#F58220', // naranja "RE": calidez, destacados, insignias
  accentDark: '#D96A0C',
  // Ámbar oscuro para TEXTO: 7,1:1 sobre blanco y 6,4:1 sobre accentSoft. El
  // accent (2,6:1) y el accentDark (3,5:1) no llegan a AA como texto pequeño.
  accentInk: '#8F4300',
  accentSoft: '#FFF1E3',
  ink: '#16233A', // azul tinta, no negro puro
  muted: '#66768D', // gris azulado para texto secundario
  line: '#E1E8F2', // bordes/separadores
  bg: '#F5F8FC', // fondo base (blanco azulado suave)
  surface: '#FFFFFF', // tarjetas y superficies
  verified: '#0B8A8F', // verde azulado del pin: verificado y confianza
  verifiedSoft: '#E2F4F4',
  danger: '#D64545',
  success: '#2E9E5B',
  warning: '#C98A12', // ámbar, para "pendiente"

  // --- Paso 1 de ESTRUCTURA_VISUAL.md (22 oct): todo color de la app sale de aquí. Si falta un tono, se agrega aquí con
  // nombre por lo que hace, nunca como #hex en un componente (lo impide ESLint). ---
  // Mismo valor que `surface` a propósito: `surface` es el fondo de las tarjetas (puede cambiar, por ejemplo en un modo
  // oscuro) y `white` es el texto sobre un color, que debe seguir siendo blanco pase lo que pase.
  white: '#FFFFFF', // texto e íconos sobre fondos de color
  black: '#000000', // base de las sombras y velos
  night: '#0B1220', // fondo de visores de foto a pantalla completa
  nightDeep: '#05070C',
  neutral: '#6B7280', // gris de «cerrado» sobre foto

  // Éxito: texto, fondo suave y fondos llenos con texto blanco.
  successInk: '#1D6B3D',
  successSoft: '#E3F4EA',
  successSolid: '#1F7A44', // fondo de «VÁLIDO» al canjear
  successBadge: '#2E7D4F', // ahorro sobre la foto (con texto blanco pasa AA)
  successBright: '#16A34A', // «abierto» sobre foto
  verifiedInk: '#075E62', // texto sobre verificadoSoft

  // Error: texto, borde, fondo suave y tonos del rechazo de canje.
  dangerInk: '#8E2A2A',
  dangerStrong: '#B3261E',
  dangerSoft: '#FBE4E4',
  dangerWash: '#FBEDED',
  dangerTint: '#F6CFCF',

  // Aviso y ámbar.
  warningInk: '#7A4B00',
  warningMid: '#9A5B00',
  warningSoft: '#FFF4DC',
  warningLine: '#E8C77A',
  accentDeep: '#5A2D00', // texto sobre naranja intenso
  accentLight: '#FFD2A6', // distancia sobre fondo oscuro
  accentTint: '#FAD9B8', // fondo de ícono de aviso
  star: '#E8A317', // estrellas de reseñas

  // Grises azulados (texto y superficies).
  inkSoft: '#4A5A70', // texto secundario fuerte
  mutedDark: '#5B6B80',
  mutedLight: '#9AA7B5', // cerrado, deshabilitado, esquinas del QR apagado
  surfaceAlt: '#EDF1F6', // chips y fondos grises
  surfaceFaint: '#FAFBFD',
  lineStrong: '#D7DFEA',
  mapBg: '#E8EEF6', // fondo del mapa mientras carga

  // Texto sobre fondos oscuros (visores y paneles de datos).
  onDarkSoft: '#B8C4D6',
  onDarkMuted: '#CBD5E1',
  onDarkLink: '#8FC1FF',
  onDarkKpi: '#C9D8EE',

  youDot: '#3B82F6', // el punto azul de «Tú»
} as const;

/**
 * Un color de `colors` con transparencia: `alpha(colors.white, 0.92)`. Reemplaza a los `rgba(...)` sueltos: el color sale
 * del tema y solo la transparencia queda en el componente.
 */
export function alpha(hex: string, a: number): string {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Nunito (redondeada y cercana, para nombres de negocio y títulos) + Manrope
 * (para toda la interfaz). Se cargan en app/_layout.tsx con expo-font; hasta
 * que cargan, RN usa la fuente del sistema como respaldo automático.
 */
export const fonts = {
  display: {
    medium: 'Nunito_600SemiBold',
    semibold: 'Nunito_700Bold',
    bold: 'Nunito_800ExtraBold',
  },
  ui: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extrabold: 'Manrope_800ExtraBold',
  },
} as const;

/** Sombra suave de los controles que flotan sobre el mapa. */
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

/**
 * Tope de crecimiento del texto dentro de chips, badges, pestañas y marcadores del mapa (con la letra grande del sistema).
 * Crece hasta 1,3× y no más, para que esas piezas no se rompan; el texto de lectura escala sin tope.
 */
export const DENSE_TEXT_SCALE = 1.3;
