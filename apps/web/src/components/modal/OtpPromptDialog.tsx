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
import { KeyRound,ShieldAlert } from "lucide-react";
import { useState } from "react";

interface OtpPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  codeLabel?: string;
  codeSubtitle?: string;
  confirmText?: string;
  isLoading?: boolean;
  onSubmit: (data: { otpCode: string; reason?: string }) => void;
}

export function OtpPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  requireReason = false,
  reasonLabel = "Reason for action",
  reasonPlaceholder = "Please provide an administrative reason...",
  codeLabel = "Security OTP Code",
  codeSubtitle = "Verification Code",
  confirmText = "Authorize Action",
  isLoading = false,
  onSubmit,
}: OtpPromptDialogProps) {
  const [otpCode, setOtpCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    onSubmit({ otpCode: otpCode.trim(), reason: reason.trim() });
  };

  const handleOpenChange = (v: boolean) => {
    if (!isLoading) {
      if (!v) {
        setOtpCode("");
        setReason("");
        setError(null);
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
            {requireReason && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {reasonLabel}
                </label>
                <textarea
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
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                <span>{codeLabel}</span>
                <span className="text-xs text-muted-foreground font-normal">{codeSubtitle}</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  type="text"
                  maxLength={10}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="e.g. 123456"
                  required
                  className="pl-9 font-mono tracking-widest text-sm rounded-xl h-10"
                />
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
