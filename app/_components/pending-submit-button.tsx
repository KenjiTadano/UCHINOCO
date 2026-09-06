"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingText,
  className = "app-button-primary w-full",
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
