import { request } from './client';

// ---------------------------------------------------------------------------
// Tipos de la agenda de citas (espejo de models.Appointment del backend).
// ---------------------------------------------------------------------------

export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'disputed'
  | 'blocked';

export interface AppointmentService {
  id: string;
  entity_id: string;
  name: string;
  duration_min: number;
  active: boolean;
}

export interface Appointment {
  id: string;
  entity_id: string;
  kind: 'booking' | 'block';
  customer_id?: string;
  service_id?: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  customer_note?: string;
  decline_reason?: 'no_space' | 'no_service' | 'other';
  decline_note?: string;
  proposed_slots?: string[];
  expires_at?: string;
  responded_at?: string;
  cancelled_by?: 'customer' | 'business';
  cancelled_at?: string;
  cancelled_late: boolean;
  customer_attended?: boolean;
  business_attended?: boolean;
  closing_deadline?: string;
  created_at: string;
  out_of_hours?: boolean;
  entity?: { id: string; name: string; owner_id: string; profile_url?: string };
  customer?: { id: string; name: string; profile_picture_url?: string };
  service?: AppointmentService;
}

export interface AgendaSettings {
  entity_id: string;
  enabled: boolean;
  slot_minutes: number;
  lunch_start: string;
  lunch_end: string;
  buffer_min: number;
  min_notice_min: number;
  horizon_days: number;
  /** Cómo recibe las solicitudes (§9b): manual | rules | auto. */
  intake_mode: 'manual' | 'rules' | 'auto';
  /** Revisar clientes con al menos N faltas (0 = apagada). */
  review_no_shows: number;
  review_first_visit: boolean;
  /** Revisar si piden con menos de N minutos (0 = apagada). */
  review_notice_min: number;
  /** Resumen de avisos cada N minutos (0 = al instante). */
  notify_every: number;
  quiet_mode: 'hours' | 'custom' | 'off';
  quiet_from: string;
  quiet_to: string;
}

export type AgendaSettingsInput = Omit<AgendaSettings, 'entity_id'>;

export interface AgendaSummary {
  enabled: boolean;
  next_slot?: string;
  slot_minutes: number;
  horizon_days: number;
  services: AppointmentService[];
  /** Cómo recibe el negocio: decide si la hoja dice «se confirma al instante» o «el negocio tiene que aceptarla». */
  intake_mode?: 'manual' | 'rules' | 'auto';
}

export interface BookingInput {
  entity_id: string;
  service_id?: string;
  starts_at: string;
  note?: string;
}

export interface DeclineInput {
  reason_code: 'no_space' | 'no_service' | 'other';
  note?: string;
  propose?: string[];
}

function list<T>(res: { data?: T[] | null }): T[] {
  return res?.data ?? [];
}

/** Una persona en la lista de espera de un día (tablero «Agenda del negocio», teléfono 3). */
export interface WaitlistEntry {
  id: string;
  entity_id: string;
  user_id: string;
  day: string;
  service_id?: string;
  status: 'waiting' | 'offered' | 'booked' | 'passed' | 'left';
  offered_slot?: string;
  offered_at?: string;
  appointment_id?: string;
  created_at: string;
  name?: string;
  entity_name?: string;
}

export const agendaApi = {
  /** Lista de espera: anotarse un día sin horas, verla (dueño), las mías, tomar la hora que se liberó o salirme. */
  joinWaitlist: (entityId: string, date: string, serviceId?: string) =>
    request<WaitlistEntry>(`/api/entities/${entityId}/waitlist`, { method: 'POST', body: { date, ...(serviceId ? { service_id: serviceId } : {}) } }),
  businessWaitlist: async (entityId: string, date: string) =>
    (await request<{ data?: WaitlistEntry[] | null }>(`/api/entities/${entityId}/waitlist`, { query: { date } })).data ?? [],
  myWaitlist: async () => (await request<{ data?: WaitlistEntry[] | null }>('/api/waitlist/mine')).data ?? [],
  takeWaitlist: (id: string) => request<Appointment>(`/api/waitlist/${id}/take`, { method: 'POST' }),
  leaveWaitlist: (id: string) => request<unknown>(`/api/waitlist/${id}`, { method: 'DELETE' }),

  summary: (entityId: string) => request<AgendaSummary>(`/api/entities/${entityId}/agenda/summary`),

  /** Horas libres (ISO) de un día `YYYY-MM-DD`. */
  availability: async (entityId: string, date: string, serviceId?: string) => {
    const res = await request<{ slots?: string[] | null }>(`/api/entities/${entityId}/agenda/availability`, {
      query: { date, service_id: serviceId },
    });
    return res.slots ?? [];
  },

  /** `idemKey`: la misma clave en un reintento devuelve la misma cita (nunca dos). */
  book: (input: BookingInput, idemKey?: string) =>
    request<Appointment>('/api/appointments', { method: 'POST', body: input, headers: idemKey ? { 'Idempotency-Key': idemKey } : undefined }),
  mine: async () => list(await request<{ data?: Appointment[] | null }>('/api/appointments/mine')),
  get: (id: string) => request<Appointment>(`/api/appointments/${id}`),
  accept: (id: string) => request<Appointment>(`/api/appointments/${id}/accept`, { method: 'POST' }),
  decline: (id: string, input: DeclineInput) =>
    request<Appointment>(`/api/appointments/${id}/decline`, { method: 'POST', body: input }),
  cancel: (id: string) => request<Appointment>(`/api/appointments/${id}/cancel`, { method: 'POST' }),
  outcome: (id: string, attended: boolean) =>
    request<Appointment>(`/api/appointments/${id}/outcome`, { method: 'POST', body: { attended } }),

  // --- negocio ---
  agenda: async (entityId: string, from: string, to: string) =>
    list(await request<{ data?: Appointment[] | null }>(`/api/entities/${entityId}/agenda`, { query: { from, to } })),
  settings: (entityId: string) => request<AgendaSettings>(`/api/entities/${entityId}/agenda/settings`),
  saveSettings: (entityId: string, input: AgendaSettingsInput) =>
    request<AgendaSettings>(`/api/entities/${entityId}/agenda/settings`, { method: 'PUT', body: input }),
  services: async (entityId: string) =>
    list(await request<{ data?: AppointmentService[] | null }>(`/api/entities/${entityId}/agenda/services`)),
  createService: (entityId: string, input: { name: string; duration_min: number }) =>
    request<AppointmentService>(`/api/entities/${entityId}/agenda/services`, { method: 'POST', body: input }),
  deleteService: (entityId: string, serviceId: string) =>
    request<void>(`/api/entities/${entityId}/agenda/services/${serviceId}`, { method: 'DELETE' }),
  /** Cita que el dueño acordó por fuera de Empre: entra confirmada, sin cuenta de cliente. */
  addOwnerAppointment: (entityId: string, input: { starts_at: string; customer_name: string; service_id?: string }) =>
    request<Appointment>(`/api/entities/${entityId}/agenda/appointments`, { method: 'POST', body: input }),
  block: (entityId: string, startsAt: string, endsAt: string, force = false) =>
    request<Appointment>(`/api/entities/${entityId}/agenda/blocks`, {
      method: 'POST',
      body: { starts_at: startsAt, ends_at: endsAt, force },
    }),
  unblock: (entityId: string, blockId: string) =>
    request<void>(`/api/entities/${entityId}/agenda/blocks/${blockId}`, { method: 'DELETE' }),
};
