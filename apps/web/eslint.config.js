import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "src/gql"] },
  // recommended-latest включает правила React Compiler (Rules of React):
  // условные хуки, мутации пропсов, чтение ref во время рендера и т.д.
  reactHooks.configs["recommended-latest"],
];
