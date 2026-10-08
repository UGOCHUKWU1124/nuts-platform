"use client";

import { PublicOnlyLayout } from "@/component/auth/PublicOnlyLayout";
import { FormInput } from "@/component/form/FormInput";
import { Button } from "@/component/ui/button";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { useAuthStore } from "@/zustand/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useRouter,useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { FormProvider,useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = safeInternalPath(searchParams.get("redirect"), "/");
  const { login, isAuthenticated, isInitialized, role, user } = useAuthStore();

  useEffect(() => {
    if (
      isInitialized &&
      isAuthenticated &&
      (role === "user" || user?.role === "user")
    ) {
      router.replace(redirectUrl);
    }
  }, [isInitialized, isAuthenticated, role, user, redirectUrl, router]);

  const methods = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  async function onSubmit(data: LoginFormData) {
    try {
      await login({ email: data.email, password: data.password, role: "user" });
      toast.success("Welcome back!");
      router.push(redirectUrl);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Invalid email or password. Please try again.";
      toast.error(msg);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
          <LogIn className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome Back</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Sign in to your customer account</p>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormInput
            name="email"
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
          <FormInput
            name="password"
            label="Password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
          />

          <Button
            type="submit"
            className="w-full rounded-xl font-semibold shadow-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </FormProvider>

      <div className="flex items-center justify-between text-xs sm:text-sm pt-2">
        <Link href="/auth/forgot-password" className="font-semibold text-primary hover:underline">
          Forgot password?
        </Link>
        <Link href="/auth/register" className="font-semibold text-primary hover:underline">
          Create account
        </Link>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Deactivated your account?{" "}
        <Link href="/auth/reactivate" className="font-semibold text-primary hover:underline">
          Reactivate it
        </Link>
      </p>

      {/* Switch to Vendor Login */}
      <div className="border-t border-border/50 pt-4 text-center">
        <p className="text-xs text-muted-foreground">
          Are you a merchant?{" "}
          <Link href="/auth/vendor/login" className="font-semibold text-primary hover:underline">
            Vendor Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PublicOnlyLayout>
      <Suspense
        fallback={
          <div className="mx-auto max-w-md p-8 text-center">
            <div className="h-10 w-32 mx-auto animate-pulse rounded bg-muted/60" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </PublicOnlyLayout>
  );
}
