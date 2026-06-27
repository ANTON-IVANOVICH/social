import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  // источник правды — code-first схема бэкенда (файл, не запущенный сервер).
  // schema.gql пишется бэкендом при старте (autoSchemaFile) — фронт развязан.
  schema: "../api/src/schema.gql",
  documents: ["src/**/*.{ts,tsx}"],
  ignoreNoDocuments: true,
  generates: {
    "src/gql/": {
      preset: "client", // типизированный graphql() + fragment masking
      config: { useTypeImports: true },
    },
  },
};

export default config;
