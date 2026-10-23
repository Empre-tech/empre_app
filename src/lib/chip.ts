// Chip único (paso 2 de docs/ESTRUCTURA_VISUAL.md): lo que el lector de pantalla oye de cada tipo de chip. Sin React para
// probarlo con Node.

export type ChipRole = 'button' | 'tab' | 'radio' | 'checkbox';

/**
 * El estado que se anuncia. Botón y pestaña dicen «seleccionado»; opción y casilla dicen «marcado» (es lo que oye quien
 * usa el lector de pantalla). Un chip que solo dispara una acción (`selected` indefinido) no anuncia ningún estado: decir
 * «no seleccionado» en un botón de acción confunde.
 */
export function chipA11yState(role: ChipRole, selected: boolean | undefined, disabled = false): { selected?: boolean; checked?: boolean; disabled?: boolean } {
  const state: { selected?: boolean; checked?: boolean; disabled?: boolean } = {};
  if (selected !== undefined) {
    if (role === 'radio' || role === 'checkbox') state.checked = selected;
    else state.selected = selected;
  }
  if (disabled) state.disabled = true;
  return state;
}

/** Etiqueta para el lector: la que se pasa o, si no hay, el texto del chip (nunca vacía). */
export function chipA11yLabel(label: string, custom?: string): string {
  const c = custom?.trim();
  return c ? c : label;
}
