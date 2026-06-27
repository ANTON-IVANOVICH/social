import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist", "src/gql"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    // парсер typescript-eslint умеет TS/TSX; правила берём только из пресета
    // recommended-latest react-hooks — это Rules of React (правила React Compiler:
    // условные хуки, мутации пропсов, чтение ref во время рендера и т.д.).
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
];
