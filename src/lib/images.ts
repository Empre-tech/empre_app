import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { UploadableImage } from '@/api/types';

interface PickOptions {
  /** Proporción del recorte (ancho, alto). Sin valor, se deja recortar libremente. */
  aspect?: [number, number];
  /** Ancho máximo en píxeles; las fotos más grandes se reducen antes de subirlas. */
  maxWidth?: number;
}

/**
 * Abre la galería y devuelve la foto elegida lista para subir, o null si se cancela.
 *
 * El backend solo acepta JPEG, PNG y WebP, y los iPhone suelen guardar HEIC, así que
 * siempre convertimos a JPEG (y de paso reducimos el tamaño para subir menos datos).
 */
export async function pickImage({ aspect, maxWidth = 1600 }: PickOptions = {}): Promise<UploadableImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Necesitamos permiso para acceder a tus fotos. Actívalo en los ajustes del celular.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 1,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > maxWidth) context.resize({ width: maxWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  return { uri: saved.uri, name: `foto-${Date.now()}.jpg`, type: 'image/jpeg' };
}


export interface PickedPostMedia extends UploadableImage {
  /** Dimensiones reales del archivo elegido, para dibujar la vista previa con la proporción correcta. */
  width: number;
  height: number;
}

interface PickPostMediaOptions {
  /** Ancho máximo en píxeles para fotos; los videos se suben tal cual (el backend limita el peso). */
  maxWidth?: number;
  /** Duración máxima permitida para un video, en segundos. */
  maxVideoSeconds?: number;
}

/**
 * Abre la galería dejando elegir foto O video para una publicación, y devuelve
 * el archivo listo para subir (o null si se cancela). Las fotos se recomprimen
 * igual que en `pickImage`; los videos se suben tal cual los grabó el celular
 * (el backend valida tipo y peso).
 */
export async function pickPostMedia({ maxWidth = 1600, maxVideoSeconds = 60 }: PickPostMediaOptions = {}): Promise<PickedPostMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Necesitamos permiso para acceder a tus fotos. Actívalo en los ajustes del celular.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  if (asset.type === 'video') {
    if (asset.duration && asset.duration / 1000 > maxVideoSeconds + 1) {
      throw new Error(`El video no puede durar más de ${maxVideoSeconds} segundos. Elige uno más corto.`);
    }
    return {
      uri: asset.uri,
      name: `video-${Date.now()}.mp4`,
      type: 'video/mp4',
      width: asset.width,
      height: asset.height,
    };
  }

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > maxWidth) context.resize({ width: maxWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });

  return {
    uri: saved.uri,
    name: `foto-${Date.now()}.jpg`,
    type: 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}
