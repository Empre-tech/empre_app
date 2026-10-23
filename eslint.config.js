// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Paso 1 de docs/ESTRUCTURA_VISUAL.md: todo color sale de src/theme.ts. Un #hex o un rgba() escrito en un componente es
    // un error: se usa `colors.algo` o `alpha(colors.algo, 0.5)`, y si falta el tono, se agrega al tema con nombre.
    // Excepción: el estilo del mapa de Google (mapStyle.ts) es un dato en formato JSON de Google, no un estilo de la app.
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: ["src/theme.ts", "src/lib/mapStyle.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: "No escribas colores a mano: usa un token de colors (src/theme.ts) o agrega el tono nuevo al tema.",
        },
        {
          selector: "Literal[value=/^rgba?\\(/]",
          message: "No escribas rgba() a mano: usa alpha(colors.token, 0.5) de src/theme.ts.",
        },
      ],
    },
  },
]);
