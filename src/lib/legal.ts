import { Linking } from 'react-native';
import { API_URL } from '@/config';

/** Las páginas legales públicas del servidor: la Política de tratamiento de datos y los Términos. */
export const LEGAL_URL = {
  privacy: `${API_URL.replace(/\/+$/, '')}/privacidad`,
  terms: `${API_URL.replace(/\/+$/, '')}/terminos`,
} as const;

export function openLegal(kind: keyof typeof LEGAL_URL) {
  void Linking.openURL(LEGAL_URL[kind]).catch(() => undefined);
}
