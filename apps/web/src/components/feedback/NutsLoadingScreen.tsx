"use client";

import { useEffect, useState } from "react";

interface NutsLoadingScreenProps {
  /**
   * Whether to render as full-viewport fixed overlay or inline container.
   * @default false
   */
  fullScreen?: boolean;
  /**
   * Primary label shown under the animated NUTS wordmark.
   */
  label?: string;
  /**
   * Secondary sub-caption shown under the primary label.
   */
  sublabel?: string;
  /**
   * Optional custom className.
   */
  className?: string;
  /**
   * Size preset for the NUTS wordmark letters.
   * @default "lg"
   */
  size?: "sm" | "md" | "lg" | "xl";
}

const DEFAULT_MESSAGES = [
  "Loading marketplace...",
  "Curating fresh arrivals...",
  "Connecting to verified vendors...",
  "Almost ready...",
];

export function NutsLoadingScreen({
  fullScreen = false,
  label,
  sublabel,
  className = "",
  size = "lg",
}: NutsLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle friendly messages every 2.4s if no static label was passed
  useEffect(() => {
    if (label) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % DEFAULT_MESSAGES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [label]);

  const activeMessage = label || DEFAULT_MESSAGES[messageIndex];

  const sizeClasses = {
    sm: "text-2xl sm:text-3xl gap-1.5",
    md: "text-3xl sm:text-4xl gap-2",
    lg: "text-4xl sm:text-5xl md:text-6xl gap-2.5",
    xl: "text-5xl sm:text-6xl md:text-7xl gap-3",
  }[size];

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading NUTS marketplace"
      className={`flex flex-col items-center justify-center select-none text-center ${className}`}
    >
      {/* Minimalist The Animated "NUTS" Signature Wordmark */}
      <div className="relative flex items-center justify-center">
        <div
          className={`relative z-10 flex items-center font-black tracking-wider uppercase font-heading ${sizeClasses}`}
        >
          {/* N */}
          <span
            className="inline-block animate-nuts-letter-1 text-black dark:text-white transform-gpu"
          >
            N
          </span>

          {/* U */}
          <span
            className="inline-block animate-nuts-letter-2 text-black dark:text-white transform-gpu"
          >
            U
          </span>

          {/* T */}
          <span
            className="inline-block animate-nuts-letter-3 text-black dark:text-white transform-gpu"
          >
            T
          </span>

          {/* S */}
          <span
            className="inline-block animate-nuts-letter-4 text-black dark:text-white transform-gpu"
          >
            S
          </span>
        </div>
      </div>

      {/* Dynamic Status Caption */}
      <div className="mt-6 flex flex-col items-center gap-1.5 px-4 max-w-sm">
        <p className="text-sm sm:text-base font-semibold text-black dark:text-white tracking-tight transition-all duration-300">
          {activeMessage}
        </p>

        {sublabel && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{sublabel}</p>
        )}

        {/* Micro Loading Progress Indicator Dots in Crisp Monochrome */}
        <div className="mt-2.5 flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-black/60 dark:bg-white/60 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-black/30 dark:bg-white/30 animate-bounce" />
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-background/85 backdrop-blur-md transition-opacity duration-300">
        {content}
      </div>
    );
  }

  return <div className="py-12 flex items-center justify-center w-full">{content}</div>;
}
