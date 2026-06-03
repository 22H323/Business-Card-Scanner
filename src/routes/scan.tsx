import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, DragEvent, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Upload, ScanLine, WifiOff, Sparkles, FileImage, X, Loader2, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { getBackendLabel, getContactsListUrl, getLocalContactsUrl } from "@/lib/backendTargets";
import { checkStorageHealth, listContacts, storageLabel } from "@/lib/contactStorage";
import { getConnectionMode } from "@/lib/connectionMode";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getQueueItems, getCachedContacts, cacheContacts } from "@/lib/indexeddb";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { scanFileAndStore } from "@/lib/scanPipeline";
import { isValidCardImage, readFileAsDataUrl } from "@/lib/scanSession";
import { toast } from "sonner";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan Card · CardSync AI" },
      { name: "description", content: "Capture business cards with AI-powered OCR. Works offline with automatic queue sync." },
      { property: "og:title", content: "Scan a card · CardSync AI" },
      { property: "og:description", content: "AI extracts contact details from any business card in seconds." },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = Route.useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [recentContacts, setRecentContacts] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
  const [connectionMode, setConnectionMode] = useState<"online" | "offline">("online");
  const { firstName } = useUserSettings();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = localStorage.getItem("cs-connection-mode");
    if (storedMode === "offline" || storedMode === "online") {
      setConnectionMode(storedMode);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleConnectionModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<"online" | "offline">;
      if (customEvent.detail === "online" || customEvent.detail === "offline") {
        setConnectionMode(customEvent.detail);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("cs-connection-mode-changed", handleConnectionModeChanged as EventListener);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("cs-connection-mode-changed", handleConnectionModeChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const fetchRecent = async () => {
      let contactsData: any[] = [];
      const mode = getConnectionMode();
      const contactsUrl = getContactsListUrl(mode);

      const loadFromUrl = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      };

      try {
        contactsData = (await loadFromUrl(contactsUrl)) ?? [];
        if (contactsData.length > 0) {
          await cacheContacts(contactsData);
        } else {
          const storageUp = await checkStorageHealth();
          if (storageUp) {
            const localData = await listContacts();
            if (localData.length > 0) {
              contactsData = localData;
              await cacheContacts(contactsData);
            }
          } else {
            const localApiData = await loadFromUrl(getLocalContactsUrl());
            if (localApiData && localApiData.length > 0) {
              contactsData = localApiData;
              await cacheContacts(contactsData);
            }
          }
        }
      } catch {
        // Last resort: local IndexedDB cache
        contactsData = await getCachedContacts();
      }

      if (contactsData.length === 0) {
        try {
          contactsData = await getCachedContacts();
        } catch {
          contactsData = [];
        }
      }

      try {
        const queueItems = await getQueueItems();
        const queuedContacts = queueItems.map(item => ({
          ...item.contact_data,
          id: item.id,
          accent: "from-amber-500 to-orange-500", // indicator for enqueued offline scans
          lastSync: item.status === "failed" ? "Sync failed" : "Pending sync",
        }));
        
        const merged = [...queuedContacts, ...contactsData];
        const visibleRecentContacts = merged.filter((c: any) => {
          const name = typeof c.name === "string" ? c.name.trim() : "";
          return name !== "Vikram Merita";
        });
        
        const accents = [
          "from-indigo-500 to-violet-500",
          "from-sky-500 to-indigo-500",
          "from-emerald-500 to-teal-500",
          "from-amber-500 to-orange-500",
          "from-fuchsia-500 to-pink-500",
          "from-cyan-500 to-blue-500",
        ];
        const formatted = visibleRecentContacts.map((c: any, i: number) => ({
          ...c,
          accent: c.accent || accents[i % accents.length],
          lastSync: c.lastSync || "Just now",
        }));
        setRecentContacts(formatted);
      } catch (e) {
        console.error("Failed to fetch recent scans from IndexedDB:", e);
      }
    };
    fetchRecent();
  }, [connectionMode]);

  const tips = [
    "Place cards on a flat, high-contrast background for best results.",
    "Crop out extra background elements to speed up AI processing.",
    "Captured contacts are queued locally and automatically synced when online.",
    "Skewed card? The engine automatically detects and straightens card text!"
  ];

  const rotateTip = () => {
    setTipIndex((prev) => (prev + 1) % tips.length);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: "🌅" };
    if (hour < 17) return { text: "Good afternoon", icon: "☀️" };
    if (hour < 22) return { text: "Good evening", icon: "✨" };
    return { text: "Good night", icon: "🌙" };
  };

  const { text: greetingText, icon: greetingIcon } = getGreeting();

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const processFile = (selectedFile: File) => {
    setError(null);
    setIsComplete(false);
    setProgress(0);

    if (!isValidCardImage(selectedFile)) {
      setError("Please upload a valid JPG or PNG image.");
      return false;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB.");
      return false;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
    return true;
  };

  /** Upload icon flow: pick from local folder → OCR as-is → review */
  const handleUploadFromFolder = async (selectedFile: File) => {
    if (!processFile(selectedFile)) return;
    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      await runScanPipeline(selectedFile, dataUrl, true);
    } catch (err) {
      console.error(err);
      setError("Failed to read the selected image.");
    }
  };

  /** Camera icon flow: capture → OCR as-is → review (camera stays open until Continue) */
  const handleCameraCapture = async (capturedFile: File) => {
    setCameraOpen(false);
    if (!processFile(capturedFile)) return;
    try {
      const dataUrl = await readFileAsDataUrl(capturedFile);
      await runScanPipeline(capturedFile, dataUrl, true);
    } catch (err) {
      console.error(err);
      setError("Failed to process camera capture.");
    }
  };

  const runScanPipeline = async (
    activeFile: File,
    activePreview: string,
    autoNavigate: boolean,
  ) => {
    setIsProcessing(true);
    setProgress(10);
    setError(null);

    const progressTimer = window.setInterval(() => {
      setProgress((prev) => (prev >= 90 ? prev : prev + Math.floor(Math.random() * 6 + 3)));
    }, 350);

    try {
      toast.info("Extracting contact details from card…");
      await scanFileAndStore(activeFile, activePreview, ({ progress, message }) => {
        setProgress(Math.max(10, progress));
        if (progress >= 100) toast.success(message);
      });
      finishProcessing(autoNavigate);
    } catch (err) {
      console.error("Scan pipeline failed:", err);
      toast.error("Scan failed. You can edit details on the review screen.");
      finishProcessing(autoNavigate);
      setError("Could not extract text automatically.");
    } finally {
      window.clearInterval(progressTimer);
      setProgress(100);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleUploadFromFolder(dropped);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setProgress(0);
    setError(null);
    setIsComplete(false);
    sessionStorage.removeItem("latestScanImage");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const finishProcessing = (autoNavigate?: boolean) => {
    setIsProcessing(false);
    setIsComplete(true);
    if (autoNavigate) {
      sessionStorage.setItem("cs-scan-ts", String(Date.now()));
      window.dispatchEvent(new CustomEvent("cs-scan-updated"));
      navigate({ to: "/review" });
    }
  };

  const handleProcess = async () => {
    if (!file || !preview) return;
    await runScanPipeline(file, preview, false);
  };

  return (
    <PageShell
      title="Scan card"
      description="Drop an image, snap a photo, or queue a batch. AI extracts contact details automatically."
      actions={
        connectionMode !== "offline" ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-[11px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Online · browser queue syncs to Zoho
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] font-medium text-warning-foreground dark:border-warning/40 dark:bg-warning/20 dark:text-warning-foreground">
            <WifiOff className="h-3 w-3" /> Offline · local scan + IndexedDB queue → Zoho
          </span>
        )
      }
    >
      {/* Interactive greeting banner */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl shadow-soft"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">{greetingIcon}</span>
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {greetingText}, <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">{firstName}</span>
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">{dateStr}</p>
          </div>
          
          <div 
            className="flex flex-1 max-w-xl items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors cursor-pointer select-none"
            onClick={rotateTip}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
              <span className="font-medium text-foreground/90 transition-all duration-300">{tips[tipIndex]}</span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-primary hover:underline shrink-0 ml-2">Next Tip</span>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Dropzone */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 p-6 shadow-soft lg:col-span-3 flex flex-col">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) handleUploadFromFolder(picked);
              e.target.value = "";
            }}
            accept="image/jpeg,image/png,image/jpg,.jpg,.jpeg,.png"
            className="hidden"
          />
          
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 rounded-2xl border-2 border-dashed p-8 text-center transition-all md:p-12 flex flex-col items-center justify-center ${
              isDragging ? 'border-primary bg-primary/5' : 
              preview ? 'border-border bg-card' : 
              'border-border bg-muted/30 hover:border-primary/40 hover:bg-accent/40'
            }`}
          >
            {preview ? (
              <div className="w-full h-full flex flex-col items-center justify-center fade-in">
                <div className="relative w-full max-w-[240px] rounded-xl overflow-hidden shadow-soft mb-4 border border-border/60">
                  <img src={preview} alt="Card preview" className="w-full h-auto max-h-[160px] object-cover" />
                  {!isProcessing && !isComplete && (
                    <div className="absolute top-2 right-2">
                      <Button variant="secondary" size="icon" className="h-7 w-7 rounded-full bg-background/80 hover:bg-background backdrop-blur shadow-soft text-foreground" onClick={clearFile}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-sm font-medium">{file?.name}</div>
                <div className="text-xs text-muted-foreground">{(file?.size! / (1024*1024)).toFixed(2)} MB</div>
                
                {error && <div className="mt-3 text-sm text-destructive font-medium bg-destructive/10 px-3 py-1.5 rounded-lg">{error}</div>}
                
                {isComplete ? (
                  <div className="w-full max-w-xs mt-6 space-y-3 text-center fade-in">
                    <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-medium text-success">Successfully processed</div>
                    <div className="flex flex-col gap-2 mt-4">
                      <Button asChild className="w-full rounded-xl bg-gradient-primary shadow-glow">
                        <Link to="/review">Review & Save Contact</Link>
                      </Button>
                      <Button variant="outline" className="w-full rounded-xl" onClick={clearFile}>
                        Scan another card
                      </Button>
                    </div>
                  </div>
                ) : isProcessing ? (
                  <div className="w-full max-w-xs mt-6 space-y-2 fade-in">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Processing...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                      <div className="h-full bg-gradient-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-wrap justify-center gap-2 w-full fade-in">
                    <Button onClick={() => handleProcess()} className="w-full sm:w-auto rounded-xl bg-gradient-primary shadow-glow">
                      <ScanLine className="mr-2 h-4 w-4" /> Process card
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="fade-in flex flex-col items-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow pointer-events-none">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight pointer-events-none">Drop a business card here</h3>
                <p className="mt-1 text-sm text-muted-foreground pointer-events-none">PNG, JPG or JPEG up to 10MB.</p>
                
                {error && <div className="mt-4 text-sm text-destructive font-medium bg-destructive/10 px-3 py-1.5 rounded-lg">{error}</div>}
                
                <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 w-full">
                    <Button onClick={() => fileInputRef.current?.click()} className="w-full sm:w-auto rounded-xl bg-gradient-primary shadow-glow">
                    <FileImage className="mr-2 h-4 w-4" /> Choose from folder
                  </Button>
                  <Button variant="outline" onClick={() => setCameraOpen(true)} className="w-full sm:w-auto rounded-xl">
                    <Camera className="mr-2 h-4 w-4" /> Use camera
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI extracts contact details automatically · powered by on-device OCR
          </div>
        </Card>

        {/* Animated scan frame */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 p-6 shadow-soft lg:col-span-2 flex flex-col">
          <div className="text-sm font-medium">Live preview</div>
          <div className="text-xs text-muted-foreground">
            {isComplete ? "Extraction complete" : isProcessing ? "Scanning..." : preview ? "Ready to scan" : "Awaiting image..."}
          </div>

          <div className="relative mt-4 aspect-[1.6/1] overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-slate-900 to-slate-800 shadow-elevated">
            {preview ? (
              <img src={preview} alt="Scanning preview" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isProcessing ? 'opacity-50' : 'opacity-80'}`} />
            ) : (
              <div className="absolute inset-6 flex flex-col justify-between text-white opacity-40">
                <div>
                  <div className="font-display text-base font-semibold">Amelia Chen</div>
                  <div className="text-[11px] opacity-70">VP Product · Northwind Labs</div>
                </div>
                <div className="space-y-0.5 text-[10px] opacity-80">
                  <div>amelia@northwind.io</div>
                  <div>+1 415 555 0142</div>
                  <div>northwind.io</div>
                </div>
              </div>
            )}

            {/* corner brackets */}
            {["top-2 left-2 border-l-2 border-t-2", "top-2 right-2 border-r-2 border-t-2", "bottom-2 left-2 border-l-2 border-b-2", "bottom-2 right-2 border-r-2 border-b-2"].map((p) => (
              <div key={p} className={`absolute h-5 w-5 rounded-sm border-primary transition-colors ${isComplete ? 'border-success' : ''} ${p}`} />
            ))}

            {/* scan line */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
              <div className={`absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-primary/40 to-transparent shadow-glow ${isProcessing || (!preview && !isComplete) ? 'animate-scan-line' : 'hidden'}`} />
            </div>
            
            {isComplete && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium text-white">Extracted</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-muted/40 p-2 transition-colors duration-300" style={{ backgroundColor: isComplete ? 'hsl(var(--success)/0.1)' : '' }}>
              <div className="font-semibold">{isComplete ? '99%' : isProcessing ? '...' : '98%'}</div>
              <div className="text-muted-foreground">Name</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 transition-colors duration-300" style={{ backgroundColor: isComplete ? 'hsl(var(--success)/0.1)' : '' }}>
              <div className="font-semibold">{isComplete ? '98%' : isProcessing ? '...' : '94%'}</div>
              <div className="text-muted-foreground">Email</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 transition-colors duration-300" style={{ backgroundColor: isComplete ? 'hsl(var(--success)/0.1)' : '' }}>
              <div className="font-semibold">{isComplete ? '97%' : isProcessing ? '...' : '96%'}</div>
              <div className="text-muted-foreground">Phone</div>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <Button asChild className="w-full rounded-xl bg-gradient-primary shadow-glow" disabled={!isComplete}>
              <Link to="/review"><ScanLine className="mr-2 h-4 w-4" /> Review extracted details</Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Recent */}
      <Card className="rounded-2xl border-border/60 p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Recent scans</div>
          <Button asChild variant="ghost" size="sm" className="rounded-lg text-xs">
            <Link to="/contacts">View all</Link>
          </Button>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
          {recentContacts.slice(0, 8).map((c) => (
            <motion.div
              key={c.id}
              whileHover={{ y: -2 }}
              className="min-w-[240px] sm:min-w-[200px] shrink-0 snap-center rounded-2xl border border-border/60 bg-card p-3 shadow-soft"
            >
              <div className={`flex aspect-[1.6/1] items-end overflow-hidden rounded-xl bg-gradient-to-br ${c.accent} p-3`}>
                <div className="text-white">
                  <div className="text-xs font-semibold">{c.name}</div>
                  <div className="text-[10px] opacity-80">{c.company}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{c.lastSync}</div>
            </motion.div>
          ))}
          {recentContacts.length === 0 && (
            <div className="text-xs text-muted-foreground italic py-4 pl-1">No recent scans found.</div>
          )}
        </div>
      </Card>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />
    </PageShell>
  );
}
