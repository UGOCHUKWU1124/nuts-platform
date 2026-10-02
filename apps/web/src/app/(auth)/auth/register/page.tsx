"use client";

import { api } from "@/api/core/client";
import type {
RegisterResponseDto,
VerifyOtpResponseDto
} from "@/api/dto/auth";
import { referralService } from "@/api/referral";
import { PublicOnlyLayout } from "@/component/auth/PublicOnlyLayout";
import { FormInput } from "@/component/form/FormInput";
import { FormTextarea } from "@/component/form/FormTextarea";
import { Button } from "@/component/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { CheckCircle2,Gift,Loader2,MapPin,RefreshCw,Send,User,UserPlus,XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter,useSearchParams } from "next/navigation";
import { useCallback,useEffect,useRef,useState } from "react";
import { FormProvider,useForm,useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).*$/,
        "Password must contain uppercase, lowercase, number and special character (@$!%*?&#)"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    otpCode: z.string().length(6, "OTP must be exactly 6 digits"),
    referralCode: z.string().optional(),
    shippingAddress: z.object({
      fullName: z.string().min(1, "Recipient full name is required"),
      phone: z.string().min(10, "Valid phone number is required"),
      street: z.string().min(3, "Street address is required"),
      city: z.string().min(2, "City is required"),
      state: z.string().min(2, "State is required"),
      country: z.string().optional(),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [resendTimer, setResendTimer] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Referral live-validation state
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateCode = useCallback(async (code: string, email: string) => {
    if (!code.trim()) {
      setReferralValid(null);
      setReferralError(null);
      return;
    }
    setIsValidatingCode(true);
    setReferralValid(null);
    setReferralError(null);
    try {
      await referralService.validate(code, email || undefined);
      setReferralValid(true);
      setReferralError(null);
    } catch {
      setReferralValid(false);
      setReferralError("Invalid or unrecognized referral code.");
    } finally {
      setIsValidatingCode(false);
    }
  }, []);

  const methods = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      otpCode: "",
      referralCode: searchParams.get("ref") ?? "",
      shippingAddress: {
        fullName: "",
        phone: "",
        street: "",
        city: "",
        state: "",
        country: "Nigeria",
      },
    },
  });

  const {
    handleSubmit,
    setValue,
    trigger,
    formState: { isSubmitting },
  } = methods;

  const currentEmail = useWatch({ control: methods.control, name: "email" });
  const firstName = useWatch({ control: methods.control, name: "firstName" });
  const lastName = useWatch({ control: methods.control, name: "lastName" });
  const watchedReferralCode = useWatch({ control: methods.control, name: "referralCode" });

  // Debounced referral code validation on keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!watchedReferralCode?.trim()) {
      return;
    }
    debounceRef.current = setTimeout(() => {
      validateCode(watchedReferralCode, currentEmail);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchedReferralCode, currentEmail, validateCode]);

  const visibleReferralValid = watchedReferralCode?.trim() ? referralValid : null;
  const visibleReferralError = watchedReferralCode?.trim() ? referralError : null;





  // Auto-populate shipping recipient name if empty
  useEffect(() => {
    if (firstName || lastName) {
      const combined = `${firstName} ${lastName}`.trim();
      const currentFullName = methods.getValues("shippingAddress.fullName");
      if (!currentFullName || currentFullName === `${firstName}` || currentFullName === `${lastName}`) {
        setValue("shippingAddress.fullName", combined);
      }
    }
  }, [firstName, lastName, methods, setValue]);

  // Timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [resendTimer]);

  // Send OTP
  async function handleSendOtp() {
    const isEmailValid = await trigger("email");
    if (!isEmailValid || !currentEmail) {
      toast.error("Please enter a valid email address first.");
      return;
    }

    setIsSendingOtp(true);
    try {
      await api.post<VerifyOtpResponseDto>("/auth/otp/request", { email: currentEmail });
      setOtpSent(true);
      setResendTimer(60);
      toast.success("6-digit verification code sent to your email!");
    } catch (err: unknown) {
      const msg =
        (err as AxiosError<{ message: string }>)?.response?.data?.message ?? "Failed to send verification code. Please try again.";
      toast.error(msg);
    } finally {
      setIsSendingOtp(false);
    }
  }

  // Go to step 2 after validating step 1
  async function handleNextStep() {
    const valid = await trigger([
      "firstName",
      "lastName",
      "email",
      "password",
      "confirmPassword",
      "otpCode",
    ]);

    if (!valid) {
      if (!otpSent) {
        toast.error("Please request and enter the 6-digit OTP code.");
      }
      return;
    }
    setActiveStep(2);
  }

  // Final submit
  async function onSubmit(data: RegisterFormData) {
    try {
      await api.post<RegisterResponseDto>("/auth/register", {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        otpCode: data.otpCode,
        referralCode: data.referralCode?.trim() || undefined,
        phone: data.shippingAddress.phone,
        shippingAddress: {
          fullName: data.shippingAddress.fullName,
          phone: data.shippingAddress.phone,
          street: data.shippingAddress.street,
          city: data.shippingAddress.city,
          state: data.shippingAddress.state,
          country: data.shippingAddress.country ?? "Nigeria",
        },
      });
      toast.success("Account created successfully! Please sign in.");
      router.push("/auth/login");
    } catch (err: unknown) {
      const msg =
        (err as AxiosError<{ message: string }>)?.response?.data?.message ?? "Registration failed. Please verify your OTP and details.";
      toast.error(msg);
    }
  }

  return (
    <PublicOnlyLayout>
      <div className="mx-auto max-w-xl space-y-6 p-6 sm:p-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <UserPlus className="h-6 w-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Create Your Account
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Join NUTS marketplace to shop curated items from verified vendors
          </p>
        </div>

        {/* Multi-step progress indicator */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeStep === 1
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            1. Account &amp; OTP
          </button>
          <div className="h-0.5 w-6 bg-border" />
          <button
            type="button"
            onClick={handleNextStep}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeStep === 2
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            2. Shipping Address
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* ── STEP 1: Personal Info + OTP ── */}
            {activeStep === 1 && (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormInput
                    name="firstName"
                    label="First Name"
                    placeholder="John"
                    autoComplete="given-name"
                  />
                  <FormInput
                    name="lastName"
                    label="Last Name"
                    placeholder="Doe"
                    autoComplete="family-name"
                  />
                </div>

                {/* Email with Send OTP Button */}
                <div className="space-y-1.5">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <FormInput
                        name="email"
                        label="Email Address"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || resendTimer > 0}
                      className="rounded-xl font-semibold shrink-0 text-xs h-10 px-4"
                    >
                      {isSendingOtp ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {resendTimer > 0 ? `Resend (${resendTimer}s)` : otpSent ? "Resend OTP" : "Send OTP"}
                    </Button>
                  </div>
                </div>

                {/* OTP Code Input */}
                <div className="space-y-1.5">
                  <FormInput
                    name="otpCode"
                    label="6-Digit Verification Code"
                    placeholder="Enter code sent to email"
                    className="font-mono tracking-widest text-center"
                  />
                  {otpSent && (
                    <p className="text-xs text-emerald-600 font-medium">
                      ✓ Verification code dispatched to {currentEmail}
                    </p>
                  )}
                </div>

                {/* Passwords */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormInput
                    name="password"
                    label="Password"
                    type="password"
                    placeholder="Min 8 chars"
                    autoComplete="new-password"
                  />
                  <FormInput
                    name="confirmPassword"
                    label="Confirm Password"
                    type="password"
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>

                {/* Referral Code (Optional) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-amber-500" />
                      <span>Referral Invite Code (Optional)</span>
                    </span>
                    {/* Live validation badge */}
                    {isValidatingCode && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                      </span>
                    )}
                    {!isValidatingCode && visibleReferralValid === true && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Valid code ✓
                      </span>
                    )}
                    {!isValidatingCode && visibleReferralValid === false && (
                      <span className="flex items-center gap-1 text-xs text-rose-500 font-medium">
                        <XCircle className="h-3 w-3" /> Invalid code
                      </span>
                    )}
                  </div>
                  <FormInput
                    name="referralCode"
                    label=""
                    placeholder="e.g. NUTS-ABC123"
                    className={`font-mono tracking-widest uppercase text-sm ${
                      visibleReferralValid === true
                        ? "border-emerald-400 focus:ring-emerald-300"
                        : visibleReferralValid === false
                        ? "border-rose-400 focus:ring-rose-300"
                        : ""
                    }`}
                  />
                  {visibleReferralError && (
                    <p className="text-xs text-rose-500">{visibleReferralError}</p>
                  )}
                  {!visibleReferralError && (
                    <p className="text-xs text-muted-foreground">
                      Invited by a friend? Enter their code or follow their referral link for signup bonuses.
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full rounded-xl font-semibold shadow-xs mt-2"
                >
                  Continue to Shipping Address
                </Button>
              </div>
            )}

            {/* ── STEP 2: Shipping Address ── */}
            {activeStep === 2 && (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    Delivery Details
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(1)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Edit Account Info
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormInput
                    name="shippingAddress.fullName"
                    label="Recipient Full Name"
                    placeholder="John Doe"
                  />
                  <FormInput
                    name="shippingAddress.phone"
                    label="Phone Number"
                    type="tel"
                    placeholder="+234 801 234 5678"
                  />
                </div>

                <FormTextarea
                  name="shippingAddress.street"
                  label="Street Address"
                  placeholder="Plot 12, Adeola Odeku Street, Victoria Island"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormInput
                    name="shippingAddress.city"
                    label="City / Town"
                    placeholder="Ikeja"
                  />
                  <FormInput
                    name="shippingAddress.state"
                    label="State"
                    placeholder="Lagos State"
                  />
                </div>

                <FormInput
                  name="shippingAddress.country"
                  label="Country"
                  placeholder="Nigeria"
                  disabled
                />

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveStep(1)}
                    className="w-1/3 rounded-xl font-semibold"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="w-2/3 rounded-xl font-semibold shadow-xs"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Creating Account..." : "Complete Registration"}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </FormProvider>

        {/* Footer */}
        <p className="text-center text-xs sm:text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </PublicOnlyLayout>
  );
}
