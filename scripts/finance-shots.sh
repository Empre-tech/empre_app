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
#   SIZE=1080x2400 DENSITY=480 scripts/finance-shots.sh # 360 dp (se restaura al terminar)
#   FONT=1.3 scripts/finance-shots.sh           # letra del sistema al 130 % (se restaura al terminar)
# Además de las capturas, deja accesibilidad.txt: lo que se puede tocar y no tiene nombre para TalkBack.
set -euo pipefail
# En Git Bash (Windows), sin esto «/sdcard/…» se convierte en una ruta de Windows antes de llegar a adb.
export MSYS_NO_PATHCONV=1
export PYTHONIOENCODING=utf-8 # la revisión de accesibilidad escribe tildes y símbolos

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
source "$(dirname "$0")/shots-common.sh"

if [ -n "${LOGIN:-}" ]; then login_demo; fi

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
