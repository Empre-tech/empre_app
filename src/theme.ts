// Identidad visual de Empre: cálida y costera (Cartagena), con un único acento
// de acción (coral) y el verde océano reservado para confianza/verificación.
// Todas las pantallas y componentes leen de aquí, así que un cambio aquí se
// propaga a toda la app.
export const colors = {
  primary: '#E1572B', // coral: única acción principal (botones, envío de mensaje)
  primaryDark: '#C24420',
  ink: '#241C17', // tinta cálida, no negro puro
  muted: '#8A7B69', // gris cálido para texto secundario
  line: '#E7DAC5', // bordes/separadores color arena
  bg: '#FBF6EE', // fondo base (arena)
  surface: '#F3ECDF', // tarjetas y superficies (arena tostada)
  verified: '#0E6B67', // océano: verificado, estados activos de confianza
  danger: '#C23B3B',
  success: '#2F8F5B',
  warning: '#B8842E', // oro viejo, para "pendiente"
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/**
 * Fraunces (con carácter, para nombres de negocio y títulos) + Manrope (para
 * toda la interfaz). Se cargan en app/_layout.tsx con expo-font; hasta que
 * cargan, RN usa la fuente del sistema como respaldo automático.
 */
export const fonts = {
  display: {
    medium: 'Fraunces_500Medium',
    semibold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
  ui: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extrabold: 'Manrope_800ExtraBold',
  },
} as const;
