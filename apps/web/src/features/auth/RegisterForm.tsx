import { useActionState } from "react";
import { useNavigate } from "react-router";
import { Input, Label, TextField } from "@heroui/react";
import { useAuth } from "./AuthProvider";
import { SubmitButton } from "./SubmitButton";

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [error, formAction] = useActionState<string | null, FormData>(
    async (_prev, formData) => {
      try {
        const displayName = String(formData.get("displayName")).trim();
        await register(
          String(formData.get("username")),
          String(formData.get("password")),
          displayName || undefined,
        );
        navigate("/");
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Не удалось зарегистрироваться";
      }
    },
    null,
  );

  return (
    <form action={formAction} className="mx-auto mt-12 max-w-sm space-y-3">
      <TextField name="username" isRequired>
        <Label>Имя пользователя</Label>
        <Input />
      </TextField>
      <TextField name="password" type="password" isRequired>
        <Label>Пароль</Label>
        <Input />
      </TextField>
      <TextField name="displayName">
        <Label>Отображаемое имя (необязательно)</Label>
        <Input />
      </TextField>
      {error && <p className="text-danger text-sm">{error}</p>}
      <SubmitButton>Зарегистрироваться</SubmitButton>
    </form>
  );
}
