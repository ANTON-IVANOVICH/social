import type { ChangeEvent } from "react";
import { useMutation } from "@apollo/client/react";
import { graphql } from "../../gql";

// Мутация возвращает обновлённого User — Apollo сам пишет его в нормализованную
// запись User:<id>, и аватар обновляется во всех вьюхах без ручного cache.modify.
const UploadAvatarDoc = graphql(`
  mutation UploadAvatar($file: Upload!) {
    uploadAvatar(file: $file) {
      id
      avatarUrl
    }
  }
`);

export function AvatarUpload() {
  const [upload, { loading, error }] = useMutation(UploadAvatarDoc);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // File уезжает multipart-запросом (createUploadLink), ответ приходит сразу —
    // webp-производные бэкенд досчитывает в фоне
    if (file) void upload({ variables: { file } });
    e.target.value = ""; // чтобы повторный выбор того же файла снова сработал
  };

  return (
    <label className="mx-6 inline-flex cursor-pointer items-center gap-2 text-primary">
      {loading ? "Загрузка…" : "Сменить аватар"}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onChange}
        disabled={loading}
      />
      {error && (
        <span className="text-sm text-danger">
          Не удалось загрузить: {error.message}
        </span>
      )}
    </label>
  );
}
