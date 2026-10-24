#!/usr/bin/env bash
# Banco de capturas de Empre Finance (PLAN_MEJORAS_VISUALES 3.46, F0).
#
# Abre cada estado de Finance en el emulador (o un teléfono con depuración USB) y guarda una captura por estado, para
# compararlas con el mockup. Los estados se abren con los ganchos de prueba de app/finance.tsx, que solo existen en
# desarrollo (?mode=, ?tab=, ?voice=, ?say=, ?pick=, ?sim=).
#
# Requisitos: la app de desarrollo instalada, `npx expo start --dev-client` corriendo y el backend local en marcha.
# Uso:
#   scripts/finance-shots.sh [carpeta]          # por defecto ../docs/mockups/antes/finance
#   LOGIN=1 scripts/finance-shots.sh            # inicia sesión antes con la cuenta demo del seed (demo01@empre.app)
#   SIZE=360x800 DENSITY=320 scripts/finance-shots.sh   # otro tamaño de pantalla (se restaura al terminar)
set -euo pipefail
# En Git Bash (Windows), sin esto «/sdcard/…» se convierte en una ruta de Windows antes de llegar a adb.
export MSYS_NO_PATHCONV=1

ADB=${ADB:-"${LOCALAPPDATA:-}/Android/Sdk/platform-tools/adb.exe"}
command -v "$ADB" >/dev/null 2>&1 || ADB=adb
OUT=${1:-"$(dirname "$0")/../../docs/mockups/antes/finance"}
PKG=co.empre.app
METRO=${METRO:-http://10.0.2.2:8081}
WAIT=${WAIT:-3}
# Cuenta demo del seed del backend (cmd/seeddemo): solo existe en bases locales de desarrollo.
EMAIL=${EMAIL:-demo01@empre.app}
PASS=${PASS:-demo1234}

mkdir -p "$OUT"
adb() { "$ADB" "$@"; }

open_url() { adb shell am start -a android.intent.action.VIEW -d "'$1'" "$PKG" >/dev/null; }
# Cierra Finance del todo (y la voz o el panel, si están abiertos) antes del siguiente estado: si el enlace llega con
# Finance abierto, la pantalla conserva su estado y la captura sale repetida.
back() {
  for _ in $(seq 1 5); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb exec-out cat /sdcard/ui.xml 2>/dev/null | grep -qE 'Hoy te quedó|Hoy quedaría|Ver todo en Empre|Mantén para registrar|Agrega algo a la venta|Agrega un gasto|Aún no tienes un negocio|Cerrar Empre Finance' || return 0
    adb shell input keyevent KEYCODE_BACK
    sleep 1.2
  done
}
shot() {
  local name=$1
  [ -n "${2:-}" ] && wait_for "$2"
  sleep "$WAIT"
  adb exec-out screencap -p > "$OUT/$name.png"
  echo "  ✓ $name"
}

# Toca el primer elemento cuyo texto, pista o descripción contiene $1 (con el árbol de uiautomator).
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  local xml bounds
  xml=$(adb exec-out cat /sdcard/ui.xml)
  bounds=$(printf '%s' "$xml" | tr '>' '\n' | grep -E "(text|hint|content-desc)=\"[^\"]*$1" | head -1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  [ -n "$bounds" ] || { echo "No encontré «$1» en pantalla" >&2; return 1; }
  read -r x1 y1 x2 y2 <<<"$bounds"
  adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}

# Espera hasta que en pantalla aparezca el texto $1 (máximo 60 s): el emulador puede tardar en dibujar.
wait_for() {
  for _ in $(seq 1 30); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb exec-out cat /sdcard/ui.xml 2>/dev/null | grep -q "$1" && return 0
    sleep 2
  done
  echo "  (no apareció «$1»)" >&2
}
restore() {
  if [ -n "${SIZE:-}" ]; then adb shell wm size reset; adb shell wm density reset; fi
  adb shell svc wifi enable >/dev/null 2>&1 || true
  adb shell svc data enable >/dev/null 2>&1 || true
}
trap restore EXIT

if [ -n "${SIZE:-}" ]; then
  adb shell wm size "$SIZE"
  [ -n "${DENSITY:-}" ] && adb shell wm density "$DENSITY"
fi

# Espera a que la app termine de cargar el código desde Metro (la primera vez puede tardar varios minutos).
wait_ready() {
  for _ in $(seq 1 90); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    local xml
    xml=$(adb exec-out cat /sdcard/ui.xml 2>/dev/null || true)
    if printf '%s' "$xml" | grep -q 'text="[^"]\{3,\}"' && ! printf '%s' "$xml" | grep -qE 'Loading from|Bundling|Cargando'; then return 0; fi
    sleep 2
  done
  echo "La app no terminó de cargar en 3 minutos" >&2
  return 1
}

# Permisos concedidos de antemano: así no aparecen diálogos del sistema encima de las capturas.
for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION RECORD_AUDIO POST_NOTIFICATIONS; do
  adb shell pm grant "$PKG" "android.permission.$perm" >/dev/null 2>&1 || true
done

if [ -z "${SKIP_CONNECT:-}" ]; then
  echo "Conectando la app de desarrollo a $METRO…"
  open_url "empre://expo-development-client/?url=$(printf '%s' "$METRO" | sed 's/:/%3A/g; s#/#%2F#g')"
  wait_ready || true
fi
# La primera vez, el menú de desarrollo muestra su bienvenida («Continue») encima de todo.
tap_text "Continue" 2>/dev/null || true
# Google pide «Precisión de ubicación»: se rechaza (lo más privado) para que no tape la app.
tap_text "No thanks" 2>/dev/null || tap_text "No, gracias" 2>/dev/null || true
sleep 1

if [ -n "${LOGIN:-}" ]; then
  echo "Iniciando sesión con $EMAIL…"
  # Por la pestaña Perfil (un enlace directo a /login dejaba la pantalla en blanco en la app de desarrollo).
  wait_for "Perfil"; tap_text "Perfil"; sleep 2
  wait_for "Iniciar sesión"; tap_text "Iniciar sesión"; sleep 2
  wait_for "tu@correo.com"; tap_text "tu@correo.com"; adb shell input text "$EMAIL"
  tap_text "••••••"; adb shell input text "$PASS"
  adb shell input keyevent KEYCODE_ENTER # la contraseña envía el formulario
  wait_for "$EMAIL"
fi

echo "Capturas en $OUT"
open_url "empre://finance";                                    shot 01-capsula "Hoy te quedó";             back
open_url "empre://finance?mode=sheet";                         shot 02-hoja "Ver todo en Empre";                back
open_url "empre://finance?mode=sheet&pick=2";                  shot 03-elige-y-confirma "Mantén para registrar";    back
open_url "empre://finance?mode=sale&tab=known";                shot 04-venta-servicios "Servicios";  back
open_url "empre://finance?mode=sale&tab=man";                  shot 05-venta-manual "Agregar a la venta";  back
open_url "empre://finance?mode=sale&tab=chat";                 shot 06-venta-por-chat "Dilo como lo dirías";  back
open_url "empre://finance?mode=expense&tab=known";             shot 07-gasto-de-siempre "De siempre";  back
open_url "empre://finance?mode=expense&tab=man";               shot 08-gasto-manual "Agregar al gasto";  back
open_url "empre://finance?mode=expense&tab=chat";              shot 09-gasto-por-chat "Dilo como lo dirías";  back
open_url "empre://finance?voice=save";                         shot 10-voz "Hoy quedaría";  back
open_url "empre://finance?voice=save&say=vend%C3%AD%20dos%20cortes%20a%20veinte%20mil%20en%20efectivo%20y%20compr%C3%A9%20cera%20por%20ocho%20mil"
WAIT=8 shot 11-voz-con-tarjetas "registro";  back
open_url "empre://finance?mode=sheet&sim=nobiz";               shot 12-sin-negocio "Aún no tienes un negocio";         back
open_url "empre://finance?mode=sheet&sim=server";              shot 13-error-servidor "No pudimos cargar";      back
adb shell svc wifi disable; adb shell svc data disable; sleep 2
open_url "empre://finance?mode=sheet";                         shot 14-sin-conexion "Hoy";        back
echo "Listo: 14 capturas."
