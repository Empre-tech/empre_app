# Empre — App móvil

App móvil (React Native + Expo + TypeScript) para descubrir negocios locales de Cartagena en un mapa,
ver su perfil, chatear en tiempo real y publicar tu propio negocio. Consume el backend
[`empre_backend`](https://github.com/Empre-tech/empre_backend) (Go + Gin + Postgres).

## Puesta en marcha (en cualquier PC)

Necesitas: **Node 20.19+**, **Git**, **Docker Desktop** (para el backend) y la app **Expo Go** en tu celular.

### 1. Backend (repo `empre_backend`)

```bash
git clone https://github.com/Empre-tech/empre_backend.git
cd empre_backend
cp .env.example .env        # en PowerShell: copy .env.example .env
# Edita .env con las credenciales de Supabase, S3 y un JWT_SECRET propio (pídelas al equipo)
docker compose up --build
```

El API queda en `http://localhost:8080` (Swagger en `/api/swagger/index.html`). Las categorías por defecto
se crean solas la primera vez.

### 2. App (este repo)

```bash
git clone <url-de-este-repo> empre_app
cd empre_app
npm install
npm run typecheck           # debe terminar sin errores
npx expo start
```

Escanea el QR con Expo Go. La app **detecta sola** dónde está el backend (la misma PC que sirve la app,
puerto 8080), así que no hace falta crear `.env` ni escribir IPs. El celular y la PC deben estar en la misma red Wi‑Fi.

Esto alcanza para todo **excepto las notificaciones push** (Expo Go ya no las soporta): ver la sección [Notificaciones push](#notificaciones-push) para ese caso.

> Importante: **no ejecutes `npm audit fix --force`** en este proyecto. Mezcla versiones de Expo y lo rompe.
> Los avisos de `npm audit` son de herramientas de desarrollo y no afectan la app.
> Si alguna vez las versiones se desalinean: `npx expo install --fix`.

## Qué incluye

- **Auth**: registro, login, recuperar contraseña; tokens en `expo-secure-store`, renovación automática del access token.
- **Explorar**: mapa de Cartagena con pines agrupados según el zoom, filtro por categoría y subcategoría
  (se recentra en tu ubicación al aplicar un filtro), búsqueda por nombre/categoría, lista ordenada por
  distancia con calificación (estrellas y cantidad de reseñas) y vista previa al tocar un pin. Se puede explorar sin cuenta.
- **Perfil de negocio** estilo Instagram: banner, foto, sello de verificado, calificación, descripción, cómo llegar
  y llamar (barra de acciones), y dos pestañas — **Publicaciones** (galería a sangre) y **Reseñas**.
- **Publicaciones**: galería estilo Instagram con visor a pantalla completa (deslizar entre fotos), descripción
  editable y borrado por el dueño.
- **Reseñas**: calificación de 1 a 5 estrellas y comentario; cada usuario puede escribir, editar o borrar su
  propia reseña de un negocio.
- **Favoritos**: marcar/desmarcar un negocio (ícono de corazón), con su propia lista en la pestaña Perfil.
- **Crear y editar negocios**: datos, categoría y subcategorías, ubicación en el mapa (tocar o arrastrar el pin),
  foto de perfil, banner y galería. Eliminar negocio.
- **Foto de perfil del usuario**: toca tu avatar en la pestaña Perfil.
- **Chat en tiempo real** (WebSocket) con historial, reconexión automática y lista de conversaciones; funciona
  tanto para clientes como para el dueño del negocio.
- **Notificaciones push**: nuevo mensaje de chat (si no estás con la conversación abierta), reseña nueva en tu
  negocio, favorito nuevo y cambio de verificación. Requiere un development build, ver más abajo.
- Las fotos se convierten a JPEG y se reducen antes de subirlas (el backend solo acepta JPEG, PNG y WebP).

## Notificaciones push

Usan el servicio de push de Expo, así que el token solo se puede generar en una app vinculada a un proyecto de
EAS — **Expo Go no funciona para esto** (Expo le quitó el soporte de push remoto). Para probarlas:

1. `npx expo install expo-notifications expo-device` (ya están en `package.json`; correr solo si hace falta reinstalar).
2. `npx eas-cli@latest init` una vez, para vincular el proyecto a tu cuenta de Expo — esto genera un
   `extra.eas.projectId` que hay que pegar a mano en `app.config.ts` (usa configuración dinámica, así que EAS no
   puede escribirlo solo). El proyecto actual (`gioleonp/empre`) es personal: si otra persona del equipo va a
   compilar, necesita que la agreguen como colaboradora en [expo.dev](https://expo.dev), o crear su propio
   proyecto de EAS y actualizar el `projectId`.
3. Generar un development build (reemplaza a Expo Go para este proyecto):
   - Android: `npx expo run:android` (compila localmente, necesita Android Studio/el SDK de Android).
   - iOS: no se puede compilar localmente desde Windows (hace falta Xcode/Mac). La alternativa es
     `npx eas-cli build --profile development --platform ios`, que compila en la nube — para instalarlo en un
     iPhone físico hace falta una cuenta de Apple Developer Program (de pago) para el certificado/provisioning.
4. Con el development build instalado, corre `npx expo start --dev-client` en vez de `npx expo start` y ábrelo
   desde ahí (ya no se abre con el QR de Expo Go).

El registro del token es automático: al iniciar sesión, `usePushNotifications` (`src/notifications/`) pide permiso,
obtiene el token de Expo y lo manda a `POST /api/users/push-token`; al cerrar sesión lo da de baja con `DELETE` del
mismo endpoint, así el celular deja de recibir notificaciones de esa cuenta. Tocar una notificación navega directo
a la conversación de chat o al perfil del negocio, según el tipo (`chat`, `review`, `favorite`, `verification`) que
viene en el `data` de la notificación.

## Limitaciones conocidas (dependen del backend)

- Los negocios nuevos quedan **pendientes** de verificación; el flujo de verificación de identidad
  (documento + selfie) aún no existe en el backend, así que no hay pantalla para eso.
- `is_read` no se actualiza: no hay indicador de mensajes no leídos.
- Las URLs de las imágenes son firmadas y caducan a los 15 minutos; se renuevan al recargar los datos.

## Estructura

```
app/                    Rutas (Expo Router)
  (auth)/               login, register, forgot-password
  (tabs)/               index (Explorar), chats, profile
  business/[id].tsx     Perfil del negocio
  business/new.tsx      Crear negocio
  business/edit/[id].tsx  Editar negocio
  chat/[entityId].tsx   Conversación
src/
  api/                  client.ts (fetch + refresh), endpoints.ts, types.ts (espejo de los DTOs del backend)
  auth/                 AuthContext + almacenamiento seguro de tokens
  chat/                 ChatProvider: un solo WebSocket compartido, con reconexión
  notifications/        Registro del token push, navegación al tocar una notificación
  components/           Button, TextField, BusinessForm, LocationPickerModal, ...
  lib/                  geo, cluster, imágenes, formato, utilidades
  config.ts, theme.ts   URL del backend (autodetección) / colores
```

## Notas

- Los colores, textos e identificadores de app (`co.empre.app`) son provisionales.
- El mapa usa `react-native-maps` (Apple Maps en iOS, Google Maps en Android). No funciona en web.
- Nunca subas `.env` a Git; en este repo está ignorado.
