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
      presetConfig: {
        // разворачиватель маски — чистая функция getFragmentData (НЕ хук useFragment Apollo)
        fragmentMasking: { unmaskFunctionName: "getFragmentData" },
      },
      config: {
        useTypeImports: true,
        // Upload-аргументы мутаций типизируются нативным File —
        // apollo-upload-client сам упакует его в multipart-запрос
        scalars: { Upload: "File" },
      },
    },
  },
};

export default config;
