import { useActionState } from "react";
import { useNavigate } from "react-router";
import { Input, Label, TextField } from "@heroui/react";
import { useAuth } from "./AuthProvider";
import { SubmitButton } from "./SubmitButton";

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // [состояние, action, isPending]; action принимает FormData — без onSubmit/preventDefault
  const [error, formAction] = useActionState<string | null, FormData>(
    async (_prev, formData) => {
      try {
        await login(
          String(formData.get("username")),
          String(formData.get("password")),
        );
        navigate("/");
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Не удалось войти";
      }
    },
    null,
  );

  return (
    <form action={formAction} className="mx-auto mt-12 max-w-sm space-y-3">
      {/* HeroUI v3 поля: TextField (react-aria) + Label + Input; name уходит в input */}
      <TextField name="username" isRequired>
        <Label>Имя пользователя</Label>
        <Input />
      </TextField>
      <TextField name="password" type="password" isRequired>
        <Label>Пароль</Label>
        <Input />
      </TextField>
      {error && <p className="text-danger text-sm">{error}</p>}
      <SubmitButton>Войти</SubmitButton>
    </form>
  );
}
