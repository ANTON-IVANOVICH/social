import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@heroui/react";

export function SubmitButton({
  children,
  className = "w-full",
}: {
  children: ReactNode;
  className?: string;
}) {
  // useFormStatus читает pending РОДИТЕЛЬСКОЙ формы — без прокидывания пропов.
  // Работает только в дочернем компоненте <form>, поэтому вынесен отдельно.
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className={className}
      isDisabled={pending}
      isPending={pending}
    >
      {children}
    </Button>
  );
}
