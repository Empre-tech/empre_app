// Pares de color de Empre Finance (texto o ícono sobre fondo), por nombre de token de `colors` (theme.ts). Sin imports,
// para que la prueba de contraste los mida con Node. Cada par que use Finance tiene que estar aquí y pasar AA:
// 4,5:1 el texto normal, 3:1 el texto grande (24 px, o 18,66 px en negrita) y los íconos.

export type PairUse = 'text' | 'large' | 'icon';

export const FINANCE_PAIRS: { fg: string; bg: string; use: PairUse; where: string }[] = [
  // Superficies
  { fg: 'ink', bg: 'surface', use: 'text', where: 'títulos y montos sobre la hoja' },
  { fg: 'ink', bg: 'bg', use: 'text', where: 'montos dentro de las tarjetas interiores' },
  { fg: 'mutedDark', bg: 'surface', use: 'text', where: 'subtítulos y etiquetas sobre la hoja' },
  { fg: 'mutedDark', bg: 'bg', use: 'text', where: 'etiquetas en mayúsculas dentro de las tarjetas' },
  { fg: 'mutedDark', bg: 'surfaceAlt', use: 'text', where: 'pestañas y medios de pago sin elegir' },
  // Dinero que entra
  { fg: 'successInk', bg: 'successSoft', use: 'text', where: 'chips y líneas de venta' },
  { fg: 'successInk', bg: 'surface', use: 'large', where: 'monto de la venta en el panel' },
  { fg: 'successInk', bg: 'surface', use: 'text', where: 'montos de venta y «te deben» en Mi negocio (3.52)' },
  { fg: 'white', bg: 'successSolid', use: 'text', where: 'botón Venta y «Mantén para registrar»' },
  { fg: 'white', bg: 'success', use: 'icon', where: '+ de la cápsula y de las filas' },
  // Dinero que sale
  { fg: 'accentInk', bg: 'accentSoft', use: 'text', where: 'chips y líneas de gasto' },
  { fg: 'accentInk', bg: 'surface', use: 'large', where: 'monto del gasto en el panel' },
  { fg: 'accentInk', bg: 'surface', use: 'text', where: 'montos de gasto y «debes» en Mi negocio (3.52)' },
  { fg: 'primary', bg: 'surface', use: 'text', where: 'enlaces de las frases en Mi negocio (3.52)' },
  { fg: 'white', bg: 'accentInk', use: 'text', where: '«Mantén para registrar» del gasto' },
  { fg: 'ink', bg: 'accent', use: 'text', where: 'botón Gasto y − de la cápsula' },
  // Acción y enlaces
  { fg: 'white', bg: 'primary', use: 'text', where: 'micrófono y «Hablar»' },
  { fg: 'primary', bg: 'primarySoft', use: 'text', where: '«Ver todo en Empre» y «Agregar a la venta»' },
  { fg: 'primary', bg: 'surface', use: 'text', where: 'enlaces y fiados' },
  // Voz (fondo tinta)
  { fg: 'white', bg: 'ink', use: 'text', where: 'palabras y tarjetas de la voz' },
  { fg: 'onDarkSoft', bg: 'ink', use: 'text', where: 'subtítulos de las tarjetas de voz' },
  { fg: 'accentLight', bg: 'ink', use: 'text', where: 'avisos de la voz' },
  { fg: 'onDarkLink', bg: 'ink', use: 'text', where: 'montos resaltados mientras hablas' },
  // Pantalla final de la voz (sección 8 del mockup)
  { fg: 'successSoft', bg: 'ink', use: 'text', where: '«Entró» en el resumen guardado' },
  { fg: 'accentSoft', bg: 'ink', use: 'text', where: '«Salió» en el resumen guardado' },
  { fg: 'white', bg: 'success', use: 'icon', where: 'check de guardado' },
  { fg: 'white', bg: 'mutedDark', use: 'icon', where: 'check gris de «Deshecho»' },
  { fg: 'ink', bg: 'white', use: 'text', where: 'botón «Listo»' },
];
