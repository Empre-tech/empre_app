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

/** Separador de fecha para listas de chat, p. ej. "Hoy", "Ayer" o "12 mar". */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: diffDays > 300 ? 'numeric' : undefined });
}

/** Tiempo relativo compacto para publicaciones, p. ej. "Publicado hace 3 días". */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Publicado hace un momento';
  if (diffMinutes < 60) return `Publicado hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Publicado hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Publicado hace 1 día';
  if (diffDays < 30) return `Publicado hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `Publicado hace ${diffMonths} ${diffMonths === 1 ? 'mes' : 'meses'}`;
  const diffYears = Math.floor(diffMonths / 12);
  return `Publicado hace ${diffYears} ${diffYears === 1 ? 'año' : 'años'}`;
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
