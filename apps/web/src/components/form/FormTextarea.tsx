"use client";

import { Label } from "@/component/ui/label";
import { cn } from "@/lib/util";
import { useFormContext,type FieldError } from "react-hook-form";

interface FormTextareaProps {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function FormTextarea({
  name,
  label,
  placeholder,
  rows = 4,
  className,
}: FormTextareaProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = errors[name] as FieldError | undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? "true" : "false"}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...register(name)}
      />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </div>
  );
}
