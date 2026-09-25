export function formatDistance(km: number | null | undefined): string | null {
  if (km === null || km === undefined || Number.isNaN(km)) return null;
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Hora si es de hoy; si no, día/mes. */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
}

/** Fecha corta para reseñas y contenido similar, p. ej. "12 mar 2025". */
export function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function verificationLabel(status: 'pending' | 'verified' | 'rejected'): string {
  switch (status) {
    case 'verified':
      return 'Verificado';
    case 'rejected':
      return 'Rechazado';
    default:
      return 'En revisión';
  }
}
