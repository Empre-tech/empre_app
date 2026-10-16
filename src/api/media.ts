import type { UploadableImage } from './types';
import { uploadFile } from './client';

/** Respuesta de la subida suelta: el id del medio (lo que se guarda en la promoción) y un enlace temporal. */
export interface UploadedMedia {
  id: string;
  url: string;
}

/** Imágenes sueltas: se suben sin atarlas a nada y devuelven el id del medio para usarlo después. */
export const mediaApi = {
  /** Sube una imagen (el servidor la revisa por su contenido: JPEG, PNG o WebP de hasta 8 MB). */
  upload: (image: UploadableImage) =>
    uploadFile<UploadedMedia>('/api/images/upload', image.uri, { fieldName: 'file', mimeType: image.type }),
};
