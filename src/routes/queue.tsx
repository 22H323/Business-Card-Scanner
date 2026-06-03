import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ScanLine,
  Inbox,
  Send,
  ArrowRight,
  Loader2,
  Trash2,
  Database,
} from "lucide-react";
import {
  ResponsiveContainer,
  Tooltip,
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageShell } from "@/components/page-shell";
import {
  getQueueItems,
  updateQueueItem,
  removeQueueItem,
  type QueueItem,
} from "@/lib/indexeddb";
import {
  checkStorageHealth,
  isIndexedDbStorage,
  listContacts,
  shouldUseOfflineQueue,
  storageLabel,
  syncAllPendingToZohoStorage,
  syncAllQueueItemsToZoho,
  syncContactToZohoStorage,
  syncQueueItemToLocalDb,
  syncQueueItemToZoho,
  type StoredContact,
} from "@/lib/contactStorage";
import { toast } from "sonner";

export const Route = createFileRoute("/queue")({
  head: () => ({
    meta: [
      { title: "Queue Center · CardSync AI" },
      {
        name: "description",
        content: "Browser queue → local PostgreSQL → Zoho CRM sync pipeline.",
      },
    ],
  }),
  component: QueuePage,
});

const tooltipStyle = {
  backgroundColor: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "var(--shadow-soft)",
};

function queueItemName(item: QueueItem): string {
  const d = item.contact_data;
  return String(d?.fullName || d?.name || "Unnamed Contact");
}

function QueuePage() {
  const [localDbContacts, setLocalDbContacts] = useState<StoredContact[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [isSyncingZoho, setIsSyncingZoho] = useState(false);
  const [syncingQueueId, setSyncingQueueId] = useState<string | null>(null);
  const [syncingLocalId, setSyncingLocalId] = useState<string | null>(null);
  const [localDbOnline, setLocalDbOnline] = useState<boolean | null>(null);

  const loadData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setIsLoading(true);

      const storageUp = await checkStorageHealth();
      setLocalDbOnline(storageUp);

      if (storageUp) {
        try {
          setLocalDbContacts(await listContacts());
        } catch (e) {
          console.error("Failed to load local DB contacts:", e);
          setLocalDbContacts([]);
        }
      } else {
        setLocalDbContacts([]);
      }

      setQueueItems(await getQueueItems());
    } catch (e) {
      console.error("Failed to load queue data:", e);
      if (!silent) toast.error("Failed to refresh queue.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const refresh = () => void loadData({ silent: true });

    window.addEventListener("cs-queue-updated", refresh);
    window.addEventListener("cs-contacts-updated", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);

    const intervalId = window.setInterval(refresh, 15000);

    return () => {
      window.removeEventListener("cs-queue-updated", refresh);
      window.removeEventListener("cs-contacts-updated", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  const notifyUpdated = () => {
    window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
    window.dispatchEvent(new CustomEvent("cs-queue-updated"));
  };

  const indexedDbMode = isIndexedDbStorage();

  const syncOneQueueItem = async (item: QueueItem): Promise<boolean> => {
    await updateQueueItem({
      ...item,
      status: "retrying",
      last_attempt: new Date().toISOString(),
    });

    try {
      if (indexedDbMode) {
        if (!navigator.onLine) {
          throw new Error("No internet. Connect to sync to Zoho CRM.");
        }
        await syncQueueItemToZoho(item);
      } else {
        const storageUp = await checkStorageHealth();
        if (!storageUp) {
          throw new Error(`Cannot save to ${storageLabel()}. Run npm run server and check .env`);
        }
        await syncQueueItemToLocalDb(item);
        await removeQueueItem(item.id);
      }
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync error";
      const nextRetryCount = item.retry_count + 1;
      await updateQueueItem({
        ...item,
        status: nextRetryCount >= 5 ? "failed" : "pending",
        retry_count: nextRetryCount,
        last_attempt: new Date().toISOString(),
        error_message: message,
      });
      throw err;
    }
  };

  const syncQueueToLocalDb = async () => {
    if (isSyncingLocal) return;

    if (indexedDbMode) {
      if (!navigator.onLine) {
        toast.error("No internet. Connect to sync to Zoho CRM.");
        return;
      }
      const items = await getQueueItems();
      const unsynced = items.filter(
        (i) => i.status === "pending" || i.status === "retrying",
      );
      if (unsynced.length === 0) {
        toast.info("Browser queue is empty — nothing waiting for Zoho.");
        return;
      }
      setIsSyncingLocal(true);
      toast.info(`Syncing ${unsynced.length} contact(s) to Zoho CRM...`);
      try {
        const { synced, total } = await syncAllQueueItemsToZoho();
        if (synced > 0) {
          toast.success(`Synced ${synced} of ${total} to Zoho CRM.`);
        } else {
          toast.error("Could not sync any contacts. Check Failed section.");
        }
      } finally {
        await loadData({ silent: true });
        notifyUpdated();
        setIsSyncingLocal(false);
      }
      return;
    }

    const storageUp = await checkStorageHealth();
    if (!storageUp) {
      toast.error(`Cannot reach ${storageLabel()}. Run npm run server and check .env`);
      return;
    }

    const items = await getQueueItems();
    const unsynced = items.filter((i) => i.status !== "synced");

    if (unsynced.length === 0) {
      toast.info("Browser queue is empty — nothing to sync to local DB.");
      return;
    }

    setIsSyncingLocal(true);
    toast.info(`Syncing ${unsynced.length} contact(s) to ${storageLabel()}...`);

    let synced = 0;
    for (const item of unsynced) {
      try {
        await syncOneQueueItem(item);
        synced += 1;
      } catch (err) {
        console.error(`Local DB sync failed for ${item.id}:`, err);
      }
    }

    if (synced > 0) {
      toast.success(`Synced ${synced} of ${unsynced.length} to ${storageLabel()}.`);
    } else {
      toast.error("Could not sync any contacts. Check errors in Failed section.");
    }

    await loadData({ silent: true });
    notifyUpdated();
    setIsSyncingLocal(false);
  };

  const syncPendingToZoho = async () => {
    if (isSyncingZoho) return;
    if (!navigator.onLine) {
      toast.error("No internet. Connect to sync to Zoho CRM.");
      return;
    }

    const pendingLocal = localDbContacts.filter(
      (c) => c.syncStatus !== "synced_zoho" && !c.zohoLeadId,
    );

    if (pendingLocal.length === 0) {
      toast.info("No local DB contacts waiting for Zoho sync.");
      return;
    }

    setIsSyncingZoho(true);
    toast.info(`Syncing ${pendingLocal.length} contact(s) to Zoho CRM...`);

    try {
      const localResult = await syncAllPendingToZohoStorage();
      toast.success(
        `Synced ${localResult.synced} of ${localResult.total} contact(s) to Zoho CRM.`,
      );
      await loadData({ silent: true });
      notifyUpdated();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Zoho sync failed";
      toast.error(message);
    } finally {
      setIsSyncingZoho(false);
    }
  };

  const handleSyncQueueItem = async (item: QueueItem) => {
    setSyncingQueueId(item.id);
    try {
      await syncOneQueueItem(item);
      toast.success(
        indexedDbMode
          ? `Synced to Zoho: ${queueItemName(item)}`
          : `Saved to local DB: ${queueItemName(item)}`,
      );
      await loadData({ silent: true });
      notifyUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast.error(message);
      await loadData({ silent: true });
    } finally {
      setSyncingQueueId(null);
    }
  };

  const handleSyncLocalToZoho = async (contactId: string, name: string) => {
    if (!navigator.onLine) {
      toast.error("No internet. Connect to sync to Zoho CRM.");
      return;
    }

    setSyncingLocalId(contactId);
    try {
      await syncContactToZohoStorage(contactId);
      toast.success(`Synced to Zoho: ${name}`);
      await loadData({ silent: true });
      notifyUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Zoho sync failed";
      toast.error(message);
    } finally {
      setSyncingLocalId(null);
    }
  };

  const handleRemoveQueueItem = async (item: QueueItem) => {
    if (!confirm(`Remove "${queueItemName(item)}" from the browser queue?`)) return;
    try {
      await removeQueueItem(item.id);
      toast.success("Removed from queue.");
      await loadData({ silent: true });
      notifyUpdated();
    } catch {
      toast.error("Failed to remove queue item.");
    }
  };

  const stats = useMemo(() => {
    const queuePending = queueItems.filter(
      (i) => i.status === "pending" || i.status === "retrying",
    ).length;
    const queueFailed = queueItems.filter((i) => i.status === "failed").length;
    const inLocalDb = localDbContacts.length;
    const pendingZoho = localDbContacts.filter(
      (c) => c.syncStatus !== "synced_zoho" && !c.zohoLeadId,
    ).length;
    const syncedZoho = localDbContacts.filter(
      (c) => c.syncStatus === "synced_zoho" || Boolean(c.zohoLeadId),
    ).length;
    const total = queuePending + queueFailed + inLocalDb;
    const done = syncedZoho;
    const health = total > 0 ? Math.round((done / Math.max(total, 1)) * 100) : 100;

    return {
      queuePending,
      queueFailed,
      inLocalDb,
      pendingZoho,
      syncedZoho,
      total,
      health: Math.min(100, health),
    };
  }, [queueItems, localDbContacts]);

  const stages = indexedDbMode
    ? [
        {
          label: "Waiting in queue",
          count: stats.queuePending + stats.queueFailed,
          icon: Inbox,
          tone: "warning" as const,
        },
        {
          label: "Synced to Zoho",
          count: stats.syncedZoho,
          icon: CheckCircle2,
          tone: "success" as const,
        },
      ]
    : [
        {
          label: "Browser queue",
          count: stats.queuePending + stats.queueFailed,
          icon: Inbox,
          tone: "warning" as const,
        },
        { label: "Local DB", count: stats.inLocalDb, icon: Database, tone: "primary" as const },
        { label: "Pending Zoho", count: stats.pendingZoho, icon: Send, tone: "warning" as const },
        {
          label: "Synced Zoho",
          count: stats.syncedZoho,
          icon: CheckCircle2,
          tone: "success" as const,
        },
      ];

  const growthData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const counts = Array(12).fill(0);
    localDbContacts.forEach((c) => {
      const date = c.created_at ? new Date(c.created_at) : new Date();
      counts[date.getMonth()] += 1;
    });
    let cumulative = 0;
    return months.map((month, idx) => {
      cumulative += counts[idx];
      return { month, total: cumulative };
    });
  }, [localDbContacts]);

  const pendingList = useMemo(
    () => queueItems.filter((i) => i.status === "pending" || i.status === "retrying"),
    [queueItems],
  );

  const failedList = useMemo(
    () => queueItems.filter((i) => i.status === "failed"),
    [queueItems],
  );

  const localPendingZoho = useMemo(
    () => localDbContacts.filter((c) => c.syncStatus !== "synced_zoho" && !c.zohoLeadId),
    [localDbContacts],
  );

  const isBusy = isSyncingLocal || isSyncingZoho;

  return (
    <div className="page-bottom-safe lg:pb-0">
      <PageShell
        title="Queue Center"
        description={
          indexedDbMode
            ? "Offline saves → browser queue → Zoho CRM when online"
            : "Browser queue → local PostgreSQL → Zoho CRM"
        }
        actions={
          <>
            <Button
              onClick={() => void syncQueueToLocalDb()}
              disabled={isBusy || isLoading || stats.queuePending + stats.queueFailed === 0}
              className="h-10 shrink-0 rounded-xl bg-gradient-primary shadow-glow disabled:opacity-50"
            >
              {isSyncingLocal ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : indexedDbMode ? (
                <Send className="mr-2 h-4 w-4" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              {indexedDbMode ? "Sync queue to Zoho" : "Sync to Local DB"}
              {stats.queuePending + stats.queueFailed > 0 && (
                <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                  {stats.queuePending + stats.queueFailed}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => void syncPendingToZoho()}
              disabled={
                isBusy || isLoading || stats.pendingZoho === 0 || !navigator.onLine
              }
              className="h-10 shrink-0 rounded-xl"
            >
              {isSyncingZoho ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Sync to Zoho
              {stats.pendingZoho > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">
                  {stats.pendingZoho}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="h-10 shrink-0 rounded-xl"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      >
        {indexedDbMode && !navigator.onLine && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            You are offline. Cards in the queue will upload to Zoho CRM automatically when
            internet returns.
          </div>
        )}
        {!indexedDbMode && localDbOnline === false && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Local PostgreSQL is offline. Run{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">npm run server</code>{" "}
            to sync the browser queue into your database.
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              <Card className="relative overflow-hidden rounded-2xl border-border/60 p-4 shadow-soft sm:p-5">
                <div className="absolute inset-0 bg-gradient-primary opacity-[0.06]" />
                <div className="relative">
                  <div className="text-xs text-muted-foreground">Pipeline health</div>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                      {stats.health}%
                    </span>
                    <span className="mb-1 text-[11px] font-medium text-success">Live</span>
                  </div>
                  <Progress value={stats.health} className="mt-3 h-1.5 bg-muted/60" />
                </div>
              </Card>

              {[
                { label: "In browser queue", value: stats.queuePending + stats.queueFailed, icon: Inbox, tone: "text-warning" },
                { label: "In local DB", value: stats.inLocalDb, icon: Database, tone: "text-primary" },
                { label: "Pending Zoho", value: stats.pendingZoho, icon: Send, tone: "text-warning" },
                { label: "Synced Zoho", value: stats.syncedZoho, icon: CheckCircle2, tone: "text-success" },
              ].map((s) => (
                <Card key={s.label} className="rounded-2xl border-border/60 p-4 shadow-soft sm:p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <s.icon className={`h-4 w-4 ${s.tone}`} />
                  </div>
                  <div className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {s.value}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="overflow-hidden rounded-2xl border-border/60 p-4 shadow-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Sync pipeline</div>
                  <div className="text-xs text-muted-foreground">
                    {indexedDbMode
                      ? "Queue → Zoho CRM (auto when online)"
                      : "Queue → PostgreSQL → Zoho CRM"}
                  </div>
                </div>
                <Activity className="h-4 w-4 text-primary" />
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
                {stages.map((s, i) => (
                  <div key={s.label} className="flex flex-1 items-center gap-2">
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="relative flex flex-1 items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-soft sm:p-4"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${
                          s.tone === "success"
                            ? "bg-success/10 text-success"
                            : s.tone === "warning"
                              ? "bg-warning/15 text-warning-foreground"
                              : "bg-primary/10 text-primary"
                        }`}
                      >
                        <s.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                          {s.label}
                        </div>
                        <div className="font-display text-lg font-semibold tracking-tight sm:text-xl">
                          {s.count}
                        </div>
                      </div>
                    </motion.div>
                    {i < stages.length - 1 && (
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-2xl border-border/60 p-4 shadow-soft sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Browser queue — pending</div>
                    <div className="text-xs text-muted-foreground">
                      {indexedDbMode
                        ? "Saved offline or when Online mode is off — waiting for Zoho"
                        : "Saved on this device when local DB was unavailable"}
                    </div>
                  </div>
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    {pendingList.length}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {pendingList.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/60 bg-card/40 p-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-sm">{queueItemName(item)}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {item.contact_data.company || "No company"} ·{" "}
                            {item.contact_data.email || item.contact_data.phone || "No contact info"}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                item.status === "retrying"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-warning/10 text-warning"
                              }`}
                            >
                              {item.status}
                            </span>
                            <span>Retries: {item.retry_count}/5</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleSyncQueueItem(item)}
                            disabled={syncingQueueId === item.id || isBusy}
                            className="h-9 flex-1 rounded-lg text-xs sm:flex-none"
                          >
                            {syncingQueueId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : indexedDbMode ? (
                              <>
                                <Send className="mr-1.5 h-3 w-3" />
                                Zoho
                              </>
                            ) : (
                              <>
                                <Database className="mr-1.5 h-3 w-3" />
                                Local DB
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleRemoveQueueItem(item)}
                            className="h-9 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {pendingList.length === 0 && (
                    <p className="py-2 text-xs italic text-muted-foreground">
                      No pending items — queue is clear.
                    </p>
                  )}
                </div>
              </Card>

              <Card className="rounded-2xl border-destructive/20 bg-destructive/5 p-4 shadow-soft sm:p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Failed syncs
                  <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-[11px]">
                    {failedList.length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {failedList.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{queueItemName(item)}</div>
                        <div className="mt-0.5 text-[11px] text-destructive">
                          {item.error_message || "Unknown error"}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Retries: {item.retry_count}/5
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSyncQueueItem(item)}
                          disabled={syncingQueueId === item.id || isBusy}
                          className="h-9 rounded-lg text-xs"
                        >
                          {syncingQueueId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="mr-1.5 h-3 w-3" />
                              Retry
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleRemoveQueueItem(item)}
                          className="h-9 rounded-lg text-xs"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {failedList.length === 0 && (
                    <p className="py-2 text-xs italic text-muted-foreground">No failed items.</p>
                  )}
                </div>
              </Card>

              <Card className="rounded-2xl border-border/60 p-4 shadow-soft sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {indexedDbMode ? "Saved contacts (browser)" : "Local PostgreSQL contacts"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ready to sync to Zoho when online
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {localDbContacts.length}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {localDbContacts.length === 0 && (
                    <p className="py-2 text-xs italic text-muted-foreground">
                      {localDbOnline
                        ? "No contacts in local DB yet. Sync from browser queue above."
                        : "Start local DB API to see contacts here."}
                    </p>
                  )}
                  {localPendingZoho.slice(0, 20).map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.fullName || c.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {c.company || "No company"} · {c.email || c.phone || "—"}
                        </div>
                        <span className="mt-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          Pending Zoho
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void handleSyncLocalToZoho(c.id, c.fullName || c.name)
                        }
                        disabled={syncingLocalId === c.id || isSyncingZoho}
                        className="h-9 shrink-0 rounded-lg text-xs"
                      >
                        {syncingLocalId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Send className="mr-1.5 h-3 w-3" />
                            Sync to Zoho
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                  {localDbContacts.filter((c) => c.syncStatus === "synced_zoho" || c.zohoLeadId).length >
                    0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {stats.syncedZoho} contact(s) already synced to Zoho. View all in Contacts.
                    </p>
                  )}
                </div>
              </Card>

              {!indexedDbMode && localDbContacts.length > 0 && (
                <Card className="rounded-2xl border-border/60 p-4 shadow-soft sm:p-5">
                  <div className="text-sm font-medium">Contact growth (local DB)</div>
                  <div className="text-xs text-muted-foreground">Cumulative saves this year</div>
                  <div className="mt-4 h-48 w-full sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={growthData}
                        margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis
                          dataKey="month"
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="total"
                          stroke="oklch(0.54 0.22 277)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </PageShell>
    </div>
  );
}
