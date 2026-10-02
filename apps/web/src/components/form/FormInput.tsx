"use client";

import { Input } from "@/component/ui/input";
import { Label } from "@/component/ui/label";
import { cn } from "@/lib/util";
import { Eye,EyeOff } from "lucide-react";
import { useState } from "react";
import { useFormContext,type FieldError } from "react-hook-form";

interface FormInputProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
  required?: boolean;
}

// Helper to resolve nested errors like 'shippingAddress.street'
function getNestedError(errors: Record<string, unknown>, path: string): FieldError | undefined {
  const parts = path.split(".");
  let current: unknown = errors;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current as FieldError | undefined;
}

export function FormInput({
  name,
  label,
  type = "text",
  placeholder,
  className,
  disabled,
  autoComplete,
  required,
}: FormInputProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = type === "password";
  const inputType = isPasswordField ? (showPassword ? "text" : "password") : type;

  const error = getNestedError(errors, name);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={name}
          type={inputType}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={error ? "true" : "false"}
          className={cn(
            "rounded-xl transition-all duration-200 focus-visible:ring-primary/20",
            isPasswordField && "pr-10",
            error && "border-destructive/80 focus-visible:ring-destructive/20"
          )}
          {...register(name)}
        />
        {isPasswordField && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors p-1"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-1 font-medium">{error.message}</p>}
    </div>
  );
}
