"use client";

import { Button } from "@/component/ui/button";
import {
Dialog,
DialogContent,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/component/ui/dialog";
import { Input } from "@/component/ui/input";
import { KeyRound,Loader2,Send,ShieldAlert } from "lucide-react";
import { useEffect,useRef,useState } from "react";

interface OtpPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireDuration?: boolean;
  durationLabel?: string;
  durationOptions?: { label: string; value: string }[];
  defaultDuration?: string;
  codeLabel?: string;
  codeSubtitle?: string;
  confirmText?: string;
  isLoading?: boolean;
  onRequestOtp?: () => Promise<void> | void;
  onSubmit: (data: { otpCode: string; reason?: string; duration?: string }) => void;
}

const DEFAULT_DURATIONS = [
  { label: "24 Hours (1 Day)", value: "24h" },
  { label: "3 Days", value: "3d" },
  { label: "7 Days (1 Week)", value: "7d" },
  { label: "14 Days (2 Weeks)", value: "14d" },
  { label: "30 Days (1 Month)", value: "30d" },
  { label: "Indefinite (Manual restore)", value: "indefinite" },
];

export function OtpPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  requireReason = false,
  reasonLabel = "Reason for action",
  reasonPlaceholder = "Please provide an administrative reason...",
  requireDuration = false,
  durationLabel = "Suspension Duration",
  durationOptions = DEFAULT_DURATIONS,
  defaultDuration = "7d",
  codeLabel = "Security OTP Code",
  codeSubtitle = "Verification Code",
  confirmText = "Authorize Action",
  isLoading = false,
  onRequestOtp,
  onSubmit,
}: OtpPromptDialogProps) {
  const [otpCode, setOtpCode] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(defaultDuration);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [hasSentOtp, setHasSentOtp] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => {
        setCooldown((c) => c - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  const handleRequestOtp = async () => {
    if (!onRequestOtp || isSendingOtp || cooldown > 0) return;
    try {
      setIsSendingOtp(true);
      setError(null);
      await onRequestOtp();
      setHasSentOtp(true);
      setCooldown(60);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to send verification code";
      setError(msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError("Security verification code is required");
      return;
    }
    if (requireReason && !reason.trim()) {
      setError("Administrative reason is required");
      return;
    }
    setError(null);
    onSubmit({
      otpCode: otpCode.trim(),
      reason: reason.trim(),
      duration: requireDuration ? duration : undefined,
    });
  };

  const handleOpenChange = (v: boolean) => {
    if (!isLoading) {
      if (!v) {
        setOtpCode("");
        setReason("");
        setDuration(defaultDuration);
        setError(null);
        setCooldown(0);
        setIsSendingOtp(false);
        setHasSentOtp(false);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
              <DialogHeader className="p-0 text-left">
                <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {title}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {requireDuration && (
              <div className="space-y-1.5">
                <label
                  htmlFor="otp-prompt-duration"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  {durationLabel}
                </label>
                <select
                  id="otp-prompt-duration"
                  name="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                >
                  {durationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {requireReason && (
              <div className="space-y-1.5">
                <label
                  htmlFor="otp-prompt-reason"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  {reasonLabel}
                </label>
                <textarea
                  id="otp-prompt-reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={2}
                  required
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="otp-prompt-code"
                className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between"
              >
                <span>{codeLabel}</span>
                <span className="text-xs text-muted-foreground font-normal">{codeSubtitle}</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                  <Input
                    id="otp-prompt-code"
                    name="otpCode"
                    type="text"
                    maxLength={10}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="e.g. 123456"
                    required
                    className="pl-9 font-mono tracking-widest text-sm rounded-xl h-10"
                  />
                </div>
                {onRequestOtp && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSendingOtp || cooldown > 0 || isLoading}
                    onClick={handleRequestOtp}
                    className="h-10 px-3.5 rounded-xl text-xs font-semibold shrink-0 gap-1.5 border-border/80 hover:bg-secondary"
                  >
                    {isSendingOtp ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : cooldown > 0 ? (
                      <span>Resend in {cooldown}s</span>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 text-primary" />
                        <span>{hasSentOtp ? "Resend Code" : "Get OTP"}</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-500">{error}</p>
            )}
          </div>

          <DialogFooter className="mt-6 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => handleOpenChange(false)}
              className="rounded-xl text-sm h-9 px-4 font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="rounded-xl text-sm h-9 px-4 font-medium bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 shadow-xs"
            >
              {isLoading ? "Verifying..." : confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
