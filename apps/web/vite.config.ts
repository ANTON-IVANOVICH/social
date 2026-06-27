import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    // React Compiler: на Vite 8 + plugin-react v6 (oxc вместо Babel) компилятор
    // подключается отдельным babel-проходом — presets: [reactCompilerPreset()].
    // Требует peer'ы @rolldown/plugin-babel + @babel/core + babel-plugin-react-compiler.
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(), // Tailwind v4 как Vite-плагин (без отдельного postcss-конфига)
  ],
  build: { sourcemap: true }, // _c()-слоты компилятора читаемы в DevTools
  server: { port: 5173 },
});
