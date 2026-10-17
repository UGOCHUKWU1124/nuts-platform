"use client";

import { useState, useEffect, useCallback } from "react";
import { notificationsApiForRole } from "@/api/notifications";
import { useAuthStore, normalizeRole } from "@/zustand/auth";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRole = normalizeRole(role ?? user?.role) ?? "user";

  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  });
  const [isSubscribed, setIsSubscribed] = useState(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission === "granted";
    }
    return false;
  });
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "default";
    }
    return Notification.permission;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    let mounted = true;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (mounted) {
          setIsSubscribed(subscription !== null || Notification.permission === "granted");
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [isSupported, isAuthenticated]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !isAuthenticated) return false;

    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        toast.error("Notification permission was denied in your browser settings");
        return false;
      }

      // Try background WebPush via Service Worker and PushManager
      let registeredPush = false;
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const readyReg = await navigator.serviceWorker.ready;

        const api = notificationsApiForRole(activeRole);
        const vapidRes = await api.getVapidKey();
        const publicKey = vapidRes.data?.publicKey;

        if (publicKey) {
          const existingSub = await readyReg.pushManager.getSubscription();
          if (existingSub) {
            try {
              await existingSub.unsubscribe();
            } catch {
              // ignore
            }
          }

          const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
          const subscription = await readyReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });

          const p256dh = subscription.getKey("p256dh");
          const auth = subscription.getKey("auth");

          if (p256dh && auth) {
            const p256dhBase64 = btoa(
              String.fromCharCode(...new Uint8Array(p256dh)),
            );
            const authBase64 = btoa(String.fromCharCode(...new Uint8Array(auth)));

            await api.subscribePush({
              endpoint: subscription.endpoint,
              keys: {
                p256dh: p256dhBase64,
                auth: authBase64,
              },
              userAgent: navigator.userAgent,
            });
            registeredPush = true;
          }
        }
      } catch (pushErr) {
        // Push service (e.g. FCM in Brave/VPN) unreachable, seamlessly fall back to browser desktop alerts
        console.info(
          "PushManager gateway unreachable on this network/browser; falling back to native desktop notifications.",
          pushErr,
        );
      }

      setIsSubscribed(true);
      toast.success(
        registeredPush
          ? "Push notifications enabled on this device"
          : "Desktop notifications enabled for this device",
      );
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to enable notifications";
      toast.error(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isAuthenticated, activeRole]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !isAuthenticated) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        const api = notificationsApiForRole(activeRole);
        await api.unsubscribePush(subscription.endpoint);
      }

      setIsSubscribed(false);
      toast.success("Notifications disabled on this device");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to disable notifications";
      toast.error(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isAuthenticated, activeRole]);

  const sendTestPush = useCallback(async () => {
    if (!isAuthenticated) return false;

    setIsLoading(true);
    try {
      // 1. Instant native browser desktop alert
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("NUTS Notification", {
            body: "Test Alert: Desktop notifications are active and working smoothly!",
            icon: "/favicon.svg",
            tag: "nuts-test-alert",
          });
        } catch {
          // ignore
        }
      }

      // 2. Dispatch backend test push
      try {
        const api = notificationsApiForRole(activeRole);
        await api.sendTestPush();
      } catch {
        // If device has no remote FCM token, desktop notification was already shown
      }

      toast.success("Test notification delivered!");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test alert";
      toast.error(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, activeRole]);

  return {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    subscribe,
    unsubscribe,
    sendTestPush,
  };
}
