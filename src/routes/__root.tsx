import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { getQueueItems, updateQueueItem, removeQueueItem } from "@/lib/indexeddb";
import {
  checkStorageHealth,
  resolveStorageMode,
  shouldUseIndexedDbQueueSync,
  shouldUseOfflineQueue,
  storageLabel,
  syncAllQueueItemsToZoho,
  syncQueueItemToLocalDb,
} from "@/lib/contactStorage";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold tracking-tight text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-medium text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again or head home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CardSync AI — AI Business Card Scanner" },
      { name: "description", content: "AI-powered offline-first business card scanner with intelligent queueing for enterprise networking." },
      { name: "author", content: "CardSync AI" },
      { property: "og:title", content: "CardSync AI" },
      { property: "og:description", content: "AI-powered offline-first lead capture for enterprise networking events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    void resolveStorageMode().catch((err) => {
      console.warn("[Storage] Could not resolve CONTACT_STORAGE from API:", err);
    });

    // 1. Preload all routes to guarantee chunk availability when offline
    const routesToPreload = ["/scan", "/contacts", "/queue", "/settings"];
    routesToPreload.forEach((path) => {
      router.preloadRoute({ to: path }).catch((err) => {
        console.warn(`[Preload] Failed to preload route ${path}:`, err);
      });
    });

    // 2. Avoid stale chunk cache during development (can cause invalid hook call/runtime mismatches).
    if ("serviceWorker" in navigator) {
      if (import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations()
          .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
          .then(() => caches.keys())
          .then((names) => Promise.all(names.map((name) => caches.delete(name))))
          .then(() => console.log("[SW] Dev mode: unregistered service workers and cleared caches"))
          .catch((err) => console.warn("[SW] Dev cleanup warning:", err));
      } else {
        navigator.serviceWorker.register("/sw.js")
          .then((reg) => console.log("[SW] Registered successfully with scope:", reg.scope))
          .catch((err) => console.error("[SW] Registration failed:", err));
      }
    }

    const processOfflineQueue = async () => {
      if (!navigator.onLine) return;

      try {
        const queue = await getQueueItems();
        const unsynced = queue.filter(
          (item) => item.status === "pending" || item.status === "retrying",
        );
        if (unsynced.length === 0) return;

        if (shouldUseIndexedDbQueueSync()) {
          toast.info(`Syncing ${unsynced.length} queued contact(s) to Zoho CRM...`);
          const { synced, total } = await syncAllQueueItemsToZoho();
          if (synced > 0) {
            toast.success(`Synced ${synced} of ${total} contact(s) to Zoho CRM.`);
          }
          window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
          window.dispatchEvent(new CustomEvent("cs-queue-updated"));
          return;
        }

        if (!shouldUseOfflineQueue()) return;

        const storageUp = await checkStorageHealth();
        if (!storageUp) return;

        toast.info(`Syncing ${unsynced.length} queued contact(s) to ${storageLabel()}...`);

        for (const item of unsynced) {
          try {
            const retryingItem = {
              ...item,
              status: "retrying" as const,
              last_attempt: new Date().toISOString(),
            };
            await updateQueueItem(retryingItem);

            await syncQueueItemToLocalDb(item);

            await removeQueueItem(item.id);
            toast.success(`Saved to ${storageLabel()}: ${item.contact_data.name}`);
          } catch (err: unknown) {
            console.error(`Storage sync failed for item ${item.id}:`, err);
            const message =
              err instanceof Error ? err.message : "Storage sync error";
            const nextRetryCount = item.retry_count + 1;
            const failedItem = {
              ...item,
              status: nextRetryCount >= 5 ? ("failed" as const) : ("pending" as const),
              retry_count: nextRetryCount,
              last_attempt: new Date().toISOString(),
              error_message: message,
            };
            await updateQueueItem(failedItem);
            toast.error(
              `Sync failed for ${item.contact_data.name || "Unknown"}: ${message}`,
            );
          }
        }
        window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
        window.dispatchEvent(new CustomEvent("cs-queue-updated"));
      } catch (queueErr) {
        console.error("Failed to read/process IndexedDB queue:", queueErr);
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Run once on load if online
    processOfflineQueue();

    const handleConnectionModeChange = (e: Event) => {
      const mode = (e as CustomEvent<"online" | "offline">).detail;
      if (mode === "online") {
        processOfflineQueue();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("cs-connection-mode-changed", handleConnectionModeChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("cs-connection-mode-changed", handleConnectionModeChange);
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="relative flex min-h-screen flex-1 flex-col bg-transparent overflow-x-hidden">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-surface" />
            <TopBar />
            {!isOnline && (
              <div className="bg-warning/20 border-b border-warning/30 text-warning-foreground text-[11px] font-medium py-1.5 px-3 sm:px-4 text-center backdrop-blur-md flex items-center justify-center gap-2 dark:border-warning/40 dark:bg-warning/20 dark:text-warning-foreground">
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="sm:hidden">Offline — saves to browser queue</span>
                <span className="hidden sm:inline">
                  No internet. New cards save to the browser queue and auto-sync to Zoho CRM when you reconnect.
                </span>
              </div>
            )}
            <main className="flex-1 w-full max-w-full">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <Toaster position="top-right" />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

