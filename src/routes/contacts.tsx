import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, RefreshCw, Mail, MessageCircle, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/page-shell";
import { StatusPill } from "@/components/status-pill";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getDeleteContactUrl, getZohoLeadsUrl } from "@/lib/backendTargets";
import {
  checkStorageHealth,
  deleteContact,
  isIndexedDbStorage,
  listContacts,
  resolveStorageMode,
  shouldUseOfflineQueue,
  storageLabel,
  syncAllPendingToZohoStorage,
  syncAllQueueItemsToZoho,
  syncContactToZohoStorage,
  syncQueueItemToLocalDb,
  syncQueueItemToZoho,
} from "@/lib/contactStorage";
import { getConnectionMode } from "@/lib/connectionMode";
import { buildZohoLeadLookup, isDuplicateOfZohoLead } from "@/lib/contactListMerge";
import { getQueueItems, removeQueueItem, updateQueueItem, type QueueItem } from "@/lib/indexeddb";
import type { ContactStatus } from "@/lib/contactStatus";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts · CardSync AI" },
      { name: "description", content: "Search, filter and manage every contact captured across events and devices." },
      { property: "og:title", content: "Contacts · CardSync AI" },
      { property: "og:description", content: "Your full lead database, filtered by sync state and channel." },
    ],
  }),
  component: ContactsPage,
});

export type { ContactStatus } from "@/lib/contactStatus";

function isLocalStorageSource(source: Contact["source"]): boolean {
  return source === "localdb" || source === "indexeddb";
}

export type Contact = {
  id: string;
  name: string;
  initials: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  status: ContactStatus;
  source: "zoho" | "queue" | "localdb" | "indexeddb";
  zohoLeadId?: string | null;
  channels: { whatsapp: boolean; email: boolean };
  lastSync: string;
  accent: string;
};

const tabs: { key: "all" | ContactStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "synced", label: "Synced" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
];

function ContactsPage() {
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | ContactStatus>("all");
  const [q, setQ] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isSyncingZoho, setIsSyncingZoho] = useState(false);
  const [localDbOnline, setLocalDbOnline] = useState<boolean | null>(null);
  const [browserStorage, setBrowserStorage] = useState(isIndexedDbStorage());

  const isAppOnline = () =>
    getConnectionMode() === "online" && typeof navigator !== "undefined" && navigator.onLine;

  const fetchContactsList = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }

      const accents = [
        "from-indigo-500 to-violet-500",
        "from-sky-500 to-indigo-500",
        "from-emerald-500 to-teal-500",
        "from-amber-500 to-orange-500",
        "from-fuchsia-500 to-pink-500",
        "from-cyan-500 to-blue-500",
      ];

      let zohoData: any[] = [];
      let fetchFailed = false;

      let localDbData: any[] = [];
      const storageMode = await resolveStorageMode();
      const useBrowserStorage = storageMode === "indexeddb";
      setBrowserStorage(useBrowserStorage);
      const storageUp = await checkStorageHealth();
      setLocalDbOnline(storageUp);
      const onlineView = isAppOnline();
      if (storageUp) {
        try {
          localDbData = await listContacts();
        } catch (localErr) {
          console.warn("Local PostgreSQL list failed:", localErr);
        }
      }

      const zohoResult = await Promise.allSettled([
        fetch(getZohoLeadsUrl()).then(async (response) => {
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        }),
      ]);

      if (zohoResult[0].status === "fulfilled") {
        zohoData = zohoResult[0].value;
      } else {
        console.error("Zoho fetch failed:", zohoResult[0].reason);
        fetchFailed = true;
      }

      const zohoLookup = buildZohoLeadLookup(zohoData);

      const formattedZoho: Contact[] = zohoData.map((c: any, i: number) => {
        const initials = c.name
          ? c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
          : "";
        return {
          ...c,
          id: c.id || `zoho-${i}`,
          source: "zoho" as const,
          title: c.title || c.designation || "",
          initials,
          accent: c.accent || accents[i % accents.length],
          status: "synced" as ContactStatus,
          channels: c.channels || {
            whatsapp: !!c.phone,
            email: !!c.email,
          },
          lastSync: c.lastSync || "Synced to Zoho",
        };
      });

      // Offline queue: PostgreSQL path, or browser storage on Render (indexeddb)
      let formattedQueue: Contact[] = [];
      if (shouldUseOfflineQueue() || useBrowserStorage) {
        try {
          const queueItems = await getQueueItems();
          formattedQueue = queueItems.map((item) => {
          const c = item.contact_data;
          const initials = c.name
            ? c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
            : "?";

          return {
            id: item.id,
            source: "queue" as const,
            name: c.name || "Unnamed Contact",
            initials,
            company: c.company || "No Company",
            title: c.title || c.designation || "No Title",
            email: c.email || "",
            phone: c.phone || "",
            status: (item.status === "retrying" ? "pending" : item.status) as ContactStatus,
            channels: c.channels || {
              whatsapp: !!c.phone,
              email: !!c.email,
            },
            lastSync:
              item.status === "failed"
                ? "Sync failed"
                : useBrowserStorage
                  ? "Queued · sync to Zoho"
                  : "Pending upload",
            accent: "from-amber-500 to-orange-500",
          };
        });
        } catch (dbErr) {
          console.error("Failed to read IndexedDB queue in contacts list:", dbErr);
        }
      }

      const storageSource = useBrowserStorage ? ("indexeddb" as const) : ("localdb" as const);
      const formattedLocalDb: Contact[] = localDbData
        .filter((c: any) => {
          return !isDuplicateOfZohoLead(c, zohoLookup, {
            hideSyncedWhenOnline: onlineView,
          });
        })
        .map((c: any, i: number) => {
        const initials = c.name
          ? c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
          : "";
        const status =
          c.syncStatus === "synced_zoho"
            ? ("synced" as ContactStatus)
            : c.syncStatus === "failed"
              ? ("failed" as ContactStatus)
              : ("pending" as ContactStatus);
        return {
          ...c,
          id: c.id || `local-${i}`,
          source: storageSource,
          zohoLeadId: c.zohoLeadId || null,
          title: c.title || c.designation || "",
          initials,
          accent: useBrowserStorage
            ? "from-violet-600 to-indigo-700"
            : "from-slate-600 to-slate-800",
          status,
          channels: c.channels || { whatsapp: !!c.phone, email: !!c.email },
          lastSync:
            c.syncStatus === "synced_zoho"
              ? "Synced to Zoho"
              : status === "pending"
                ? onlineView
                  ? "Awaiting Zoho sync"
                  : `${storageLabel(storageMode)} · pending Zoho`
                : c.lastSync || storageLabel(storageMode, { online: onlineView }),
        };
      });

      const merged = [...formattedQueue, ...formattedLocalDb, ...formattedZoho];
      setContactsList(merged);
      setError(null);

      if (fetchFailed && !silent) {
        toast.info("Some contact sources could not be loaded. Showing available data.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load contacts.");
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const handleSyncQueueItem = async (queueId: string) => {
    const storageUp = await checkStorageHealth();
    if (!storageUp) {
      toast.error(`Cannot reach ${storageLabel()}. Run npm run server and check .env`);
      return;
    }

    setSyncingId(queueId);
    try {
      const items = await getQueueItems();
      const item = items.find((q) => q.id === queueId);
      if (!item) {
        toast.error("Queued contact not found.");
        return;
      }

      if (browserStorage || isIndexedDbStorage()) {
        await syncQueueItemToZoho(item);
        toast.success(`Synced to Zoho CRM: ${item.contact_data.name || "contact"}`);
      } else {
        await syncQueueItemToLocalDb(item);
        await removeQueueItem(item.id);
        toast.success(`Saved to ${storageLabel()}: ${item.contact_data.name || "contact"}`);
      }
      await fetchContactsList({ silent: true });
      window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
      window.dispatchEvent(new CustomEvent("cs-queue-updated"));
    } catch (err: any) {
      toast.error(err.message || `Failed to sync to ${storageLabel()}.`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllQueue = async () => {
    const storageUp = await checkStorageHealth();
    if (!storageUp) {
      toast.error(`Cannot reach ${storageLabel()}. Run npm run server and check .env`);
      return;
    }

    const queuePending = contactsList.filter((c) => c.source === "queue");
    if (queuePending.length === 0) {
      toast.info(
        browserStorage
          ? "No queued contacts waiting for Zoho sync."
          : "No queued contacts waiting for local DB sync.",
      );
      return;
    }

    setIsSyncingAll(true);
    try {
      if (browserStorage || isIndexedDbStorage()) {
        const result = await syncAllQueueItemsToZoho();
        if (result.synced > 0) {
          toast.success(`Synced ${result.synced} of ${result.total} contact(s) to Zoho CRM.`);
        } else {
          toast.error("Could not sync any queued contacts to Zoho.");
        }
      } else {
        const items = await getQueueItems();
        const pendingItems = items.filter((i) => i.status !== "synced");
        let synced = 0;

        for (const item of pendingItems) {
          try {
            await syncQueueItemToLocalDb(item);
            await removeQueueItem(item.id);
            synced += 1;
          } catch (err) {
            console.error(`Local DB sync failed for ${item.id}:`, err);
          }
        }

        if (synced > 0) {
          toast.success(`Synced ${synced} contact(s) to ${storageLabel()}.`);
        } else {
          toast.error(`Could not sync any contacts to ${storageLabel()}.`);
        }
      }
      await fetchContactsList({ silent: true });
      window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
      window.dispatchEvent(new CustomEvent("cs-queue-updated"));
    } catch (err: any) {
      toast.error(err.message || `Failed to sync queue.`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncToZoho = async (contactId: string, source: Contact["source"]) => {
    if (!navigator.onLine) {
      toast.error("Connect to the internet to sync to Zoho CRM.");
      return;
    }
    if (!isLocalStorageSource(source)) {
      toast.info(`Only ${storageLabel()} contacts can be synced to Zoho from here.`);
      return;
    }

    setSyncingId(contactId);
    try {
      const result = await syncContactToZohoStorage(contactId);
      if (result.alreadySynced) {
        toast.info("Contact is already synced to Zoho CRM.");
      } else {
        toast.success("Contact synced to Zoho CRM.");
      }
      await fetchContactsList({ silent: true });
      window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
    } catch (err: any) {
      toast.error(err.message || "Failed to sync contact to Zoho.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllPendingToZoho = async () => {
    if (!navigator.onLine) {
      toast.error("Connect to the internet to sync to Zoho CRM.");
      return;
    }

    const pendingLocalDb = contactsList.filter(
      (c) => isLocalStorageSource(c.source) && c.status === "pending",
    );

    if (pendingLocalDb.length === 0) {
      toast.info("No contacts waiting for Zoho sync.");
      return;
    }

    setIsSyncingZoho(true);
    try {
      const result = await syncAllPendingToZohoStorage();
      toast.success(`Synced ${result.synced} of ${result.total} contact(s) to Zoho CRM.`);
      await fetchContactsList({ silent: true });
      window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
    } catch (err: any) {
      toast.error(err.message || "Failed to sync pending contacts to Zoho.");
    } finally {
      setIsSyncingZoho(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    if (!confirm("Are you sure you want to delete this contact?")) {
      return;
    }

    if (contact.source === "queue") {
      try {
        await removeQueueItem(contact.id);
        toast.success("Queued contact removed successfully.");
        fetchContactsList();
      } catch (dbErr) {
        console.error("Error removing queue item:", dbErr);
        toast.error("Failed to remove queued contact.");
      }
      return;
    }

    if (contact.source === "localdb" || contact.source === "indexeddb") {
      const deleteZoho = Boolean(contact.zohoLeadId);
      if (deleteZoho && !navigator.onLine) {
        toast.error("Connect to the internet to delete a synced Zoho contact.");
        return;
      }
      try {
        await deleteContact(contact.id, deleteZoho);
        toast.success(
          deleteZoho
            ? `Contact deleted from ${storageLabel()} and Zoho CRM.`
            : `Contact deleted from ${storageLabel()}.`,
        );
        fetchContactsList();
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Failed to delete local contact.");
      }
      return;
    }

    if (!navigator.onLine) {
      toast.error("Cannot delete contacts while offline.");
      return;
    }

    try {
      const deleteUrl = getDeleteContactUrl(
        contact.id,
        contact.source === "zoho" ? "zoho" : "localdb",
      );
      const response = await fetch(deleteUrl, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Failed to delete contact: ${response.statusText}`);
      }
      toast.success("Contact deleted successfully.");
      fetchContactsList();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete contact.");
    }
  };

  useEffect(() => {
    fetchContactsList();

    const refreshSilently = () => {
      fetchContactsList({ silent: true });
    };

    const handleModeChange = () => {
      refreshSilently();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };

    window.addEventListener("cs-queue-updated", refreshSilently as EventListener);
    window.addEventListener("cs-contacts-updated", refreshSilently as EventListener);
    window.addEventListener(
      "cs-connection-mode-changed",
      handleModeChange as EventListener,
    );
    window.addEventListener("focus", refreshSilently);
    window.addEventListener("online", refreshSilently);
    document.addEventListener("visibilitychange", handleVisibility);

    // Keep the list warm so new Zoho contacts appear quickly.
    const intervalId = window.setInterval(refreshSilently, 10000);

    return () => {
      window.removeEventListener("cs-queue-updated", refreshSilently as EventListener);
      window.removeEventListener("cs-contacts-updated", refreshSilently as EventListener);
      window.removeEventListener(
        "cs-connection-mode-changed",
        handleModeChange as EventListener,
      );
      window.removeEventListener("focus", refreshSilently);
      window.removeEventListener("online", refreshSilently);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, []);

  const filtered = useMemo(() => {
    return contactsList.filter((c) => {
      if (tab !== "all" && c.status !== tab) return false;
      const searchStr = `${c.name || ''} ${c.company || ''} ${c.email || ''}`.toLowerCase();
      if (q && !searchStr.includes(q.toLowerCase())) return false;
      return true;
    });
  }, [contactsList, tab, q]);

  const pendingQueueCount = useMemo(
    () => contactsList.filter((c) => c.source === "queue").length,
    [contactsList],
  );

  const pendingZohoCount = useMemo(
    () =>
      contactsList.filter(
        (c) => isLocalStorageSource(c.source) && c.status === "pending",
      ).length,
    [contactsList],
  );

  const sourceLabel = (source: Contact["source"], status?: ContactStatus) => {
    if (source === "zoho") return "Zoho CRM";
    if (source === "queue") return isAppOnline() ? "Offline queue" : "Queued";
    if (source === "indexeddb") {
      if (isAppOnline() && status === "pending") return "Pending · Zoho";
      return storageLabel("indexeddb", { online: isAppOnline() });
    }
    if (source === "localdb") return storageLabel("postgresql", { online: isAppOnline() });
    return "Local";
  };

  const counts = useMemo(() => {
    return {
      all: contactsList.length,
      synced: contactsList.filter((c) => c.status === "synced").length,
      pending: contactsList.filter((c) => c.status === "pending").length,
      failed: contactsList.filter((c) => c.status === "failed").length,
    };
  }, [contactsList]);

  return (
    <div className="page-bottom-safe lg:pb-0">
    <PageShell
      title="Contacts"
      description={`${contactsList.length} contacts`}
      actions={
        <>
          {pendingZohoCount > 0 && (
            <Button
              variant="outline"
              onClick={handleSyncAllPendingToZoho}
              disabled={isSyncingZoho || isLoading}
              className="rounded-xl"
            >
              {isSyncingZoho ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Sync to Zoho
            </Button>
          )}
          <Button variant="outline" className="rounded-xl">
            <Filter className="mr-2 h-4 w-4" /> Filters
          </Button>
          <Button className="rounded-xl bg-gradient-primary shadow-glow">
            <Plus className="mr-2 h-4 w-4" /> New contact
          </Button>
        </>
      }
    >
      {localDbOnline === false && !isIndexedDbStorage() && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {storageLabel()} or the Python API is unavailable. Run{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5">npm run dev:all</code>
          , ensure your storage backend is configured in{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5">.env</code>, then refresh.
        </div>
      )}
      <Card className="rounded-2xl border-border/60 p-3 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company or email"
              className="h-10 w-full rounded-xl border-border/60 bg-background pl-9"
            />
          </div>

          {/* Mobile: full-width tab grid (primary UX) */}
          <div className="w-full lg:hidden">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] leading-tight data-[state=active]:bg-card data-[state=active]:shadow-soft sm:flex-row sm:text-xs"
                  >
                    <span>{t.label}</span>
                    <span className="text-[10px] font-semibold text-muted-foreground">{counts[t.key]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Desktop / tablet landscape: pill tabs */}
          <div className="hidden w-full overflow-x-auto hide-scrollbar pb-1 lg:block">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full min-w-max">
              <TabsList className="rounded-xl bg-muted/60">
                {tabs.map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-soft">
                    {t.label} <span className="ml-1.5 text-[10px] text-muted-foreground">{counts[t.key]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <RefreshCw className="h-6 w-6 text-primary animate-spin" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">Loading contacts</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Connecting to database...</p>
          </div>
        ) : error ? (
          <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <span className="text-xl text-destructive">⚠️</span>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-destructive">Failed to load contacts</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            {/* Desktop table — lg+ only; tablets use mobile cards */}
            <div className="mt-5 hidden overflow-x-auto rounded-xl border border-border/60 lg:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Channels</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last sync</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((c) => (
                    <tr key={`${c.source}-${c.id}`} className="transition hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-xs font-semibold text-white`}>
                            {c.initials}
                          </div>
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground">{c.company} · {sourceLabel(c.source, c.status)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.title}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {c.channels?.whatsapp && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success">
                              <MessageCircle className="h-3 w-3" />
                            </span>
                          )}
                          {c.channels?.email && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <Mail className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastSync}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.source === "queue" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSyncQueueItem(c.id)}
                              disabled={syncingId === c.id || isSyncingAll}
                              className="h-8 rounded-lg text-xs"
                            >
                              {syncingId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Send className="mr-1.5 h-3 w-3" />
                                  {browserStorage ? "Sync to Zoho" : "Local DB"}
                                </>
                              )}
                            </Button>
                          )}
                          {isLocalStorageSource(c.source) &&
                            c.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSyncToZoho(c.id, c.source)}
                              disabled={syncingId === c.id || isSyncingZoho}
                              className="h-8 rounded-lg text-xs"
                            >
                              {syncingId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Send className="mr-1.5 h-3 w-3" />
                                  Sync to Zoho
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(c)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & tablet cards */}
            <div className="mt-5 space-y-3 lg:hidden">
              {filtered.map((c) => (
                <div
                  key={`${c.source}-${c.id}`}
                  className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-sm font-semibold text-white`}
                    >
                      {c.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.title || "—"} · {c.company || "No company"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {sourceLabel(c.source, c.status)} · {c.lastSync}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                    <StatusPill status={c.status} />
                    {c.channels?.whatsapp && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-[10px] text-success">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </span>
                    )}
                    {c.channels?.email && c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      >
                        <Mail className="h-3 w-3" /> Email
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {c.phone}
                      </a>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.source === "queue" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncQueueItem(c.id)}
                        disabled={syncingId === c.id || isSyncingAll}
                        className="h-9 flex-1 min-w-[120px] rounded-lg text-xs sm:flex-none"
                      >
                        {syncingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          browserStorage ? "Sync to Zoho" : "Sync to Local DB"
                        )}
                      </Button>
                    )}
                    {isLocalStorageSource(c.source) &&
                      c.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncToZoho(c.id, c.source)}
                        disabled={syncingId === c.id || isSyncingZoho}
                        className="h-9 flex-1 min-w-[120px] rounded-lg text-xs sm:flex-none"
                      >
                        {syncingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Sync to Zoho"
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(c)}
                      className="h-9 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                  <Search className="h-6 w-6 text-accent-foreground" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">No contacts match</h3>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">Try a different search or change the active filter.</p>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>Showing {filtered.length} of {contactsList.length}</div>
              <div className="hidden items-center gap-1 sm:flex">
                <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs">Previous</Button>
                <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs">Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Floating sync buttons — mobile-friendly with safe area */}
      <div className="fab-bottom fixed right-3 z-40 flex flex-col items-end gap-2 sm:right-6">
        {pendingZohoCount > 0 && (
          <button
            onClick={handleSyncAllPendingToZoho}
            disabled={isSyncingZoho || isLoading}
            title="Sync local contacts to Zoho CRM (requires internet)"
            className="flex h-12 min-w-12 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card px-3 text-foreground shadow-soft transition active:scale-95 disabled:opacity-50 sm:h-14 sm:px-4"
          >
            {isSyncingZoho ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span className="text-sm font-medium">Sync to Zoho</span>
              </>
            )}
          </button>
        )}
        {(shouldUseOfflineQueue() || browserStorage) && pendingQueueCount > 0 ? (
          <button
            onClick={handleSyncAllQueue}
            disabled={isSyncingAll || isLoading}
            title={
              browserStorage
                ? "Sync queued contacts to Zoho CRM"
                : `Sync queued contacts to ${storageLabel()}`
            }
            className="flex h-12 min-w-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-3 text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-50 sm:h-14 sm:px-4"
          >
            {isSyncingAll ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {browserStorage ? "Sync queue to Zoho" : "Sync to Local DB"}
                </span>
              </>
            )}
          </button>
        ) : pendingZohoCount === 0 ? (
          <button
            onClick={() => fetchContactsList()}
            disabled={isLoading}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow transition hover:scale-105 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        ) : null}
      </div>
    </PageShell>
    </div>
  );
}
