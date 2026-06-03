import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AUTO_CAPTURE_COUNTDOWN_SEC,
  AUTO_CAPTURE_SHARPNESS,
  AUTO_CAPTURE_STABLE_READINGS,
  ALIGN_MIN_SHARPNESS,
  CARD_FRAME,
  getAlignmentProgress,
  getAlignmentStatus,
  measureFrameSharpness,
  pickDefaultFacingMode,
  requestCameraStream,
  type AlignmentStatus,
} from "@/lib/cardFrameAnalysis";
import { cn } from "@/lib/utils";

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

type Phase = "live" | "preview";

const STATUS_COPY: Record<AlignmentStatus, { title: string; hint: string }> = {
  searching: {
    title: "Position your card",
    hint: "Fill the frame with the business card",
  },
  aligning: {
    title: "Almost there…",
    hint: "Move closer and keep the card flat",
  },
  "hold-steady": {
    title: "Hold steady",
    hint: "Keep the card still in the frame",
  },
  ready: {
    title: "Capturing…",
    hint: "Don't move",
  },
};

export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>("live");
  const facingModeRef = useRef<"environment" | "user">(pickDefaultFacingMode());
  const stableCountRef = useRef(0);
  const analysisTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const startCameraRef = useRef<(mode?: "environment" | "user") => Promise<void>>(async () => {});

  const [phase, setPhase] = useState<Phase>("live");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(pickDefaultFacingMode());
  const [sharpness, setSharpness] = useState(0);
  const [stableCount, setStableCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [alignmentStatus, setAlignmentStatus] = useState<AlignmentStatus>("searching");
  const [streamReady, setStreamReady] = useState(false);

  phaseRef.current = phase;
  facingModeRef.current = facingMode;

  const stopAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopAnalysis();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    stableCountRef.current = 0;
    setStreamReady(false);
    setStableCount(0);
    setCountdown(null);
    setSharpness(0);
    setAlignmentStatus("searching");
  }, [stopAnalysis]);

  const snapFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    // Apply OCR preprocessing for better text extraction
    try {
      const { preprocessForOCR } = await import("@/lib/cardFrameAnalysis");
      preprocessForOCR(canvas);
    } catch (err) {
      console.warn("OCR preprocessing skipped:", err);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new File([ab], `card-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
  }, []);

  const enterPreview = useCallback(
    (file: File) => {
      stopStream();
      setCapturedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      phaseRef.current = "preview";
      setPhase("preview");
    },
    [stopStream],
  );

  const triggerCapture = useCallback(async () => {
    if (phaseRef.current !== "live") return;
    const file = await snapFrame();
    if (file) enterPreview(file);
  }, [snapFrame, enterPreview]);

  const startAnalysisLoopRef = useRef<() => void>(() => {});

  const startAnalysisLoop = useCallback(() => {
    stopAnalysis();
    analysisTimerRef.current = window.setInterval(() => {
      if (phaseRef.current !== "live" || countdownTimerRef.current) return;

      const video = videoRef.current;
      if (!video) return;

      const score = measureFrameSharpness(video, CARD_FRAME);
      setSharpness(Math.round(score));

      if (score >= AUTO_CAPTURE_SHARPNESS) {
        stableCountRef.current += 1;
        setStableCount(stableCountRef.current);
      } else if (score >= ALIGN_MIN_SHARPNESS) {
        stableCountRef.current = Math.max(0, stableCountRef.current - 1);
        setStableCount(stableCountRef.current);
      } else {
        stableCountRef.current = 0;
        setStableCount(0);
      }

      setAlignmentStatus(getAlignmentStatus(score, stableCountRef.current, null));

      if (stableCountRef.current >= AUTO_CAPTURE_STABLE_READINGS && !countdownTimerRef.current) {
        startCountdownRef.current();
      }
    }, 400);
  }, [stopAnalysis]);

  startAnalysisLoopRef.current = startAnalysisLoop;

  const startCountdownRef = useRef<() => void>(() => {});

  const startCountdown = useCallback(() => {
    if (countdownTimerRef.current) return;
    let remaining = AUTO_CAPTURE_COUNTDOWN_SEC;
    setCountdown(remaining);
    setAlignmentStatus("ready");

    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        triggerCapture();
        return;
      }
      setCountdown(remaining);

      const video = videoRef.current;
      if (video) {
        const score = measureFrameSharpness(video, CARD_FRAME);
        if (score < AUTO_CAPTURE_SHARPNESS * 0.75) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdown(null);
          stableCountRef.current = 0;
          setStableCount(0);
          setAlignmentStatus("aligning");
          startAnalysisLoopRef.current();
        }
      }
    }, 1000);
  }, [triggerCapture]);

  startCountdownRef.current = startCountdown;

  const requestPermissionIfNeeded = useCallback(async () => {
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (permission.state === "prompt") {
          console.log("Camera permission not set yet - will prompt on getUserMedia");
        }
      }
    } catch (err) {
      console.log("Permission query not supported");
    }
  }, []);

  const startCamera = useCallback(async (mode?: "environment" | "user") => {
    const facing = mode ?? facingModeRef.current;
    setIsStarting(true);
    setError(null);
    setStreamReady(false);
    stopStream();

    try {
      // Request permission first if needed
      await requestPermissionIfNeeded();
      
      const stream = await requestCameraStream(facing);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
        };
        await video.play().catch(async () => {
          await new Promise((r) => setTimeout(r, 100));
          await video.play();
        });
      }
      setPhase("live");
      phaseRef.current = "live";
      setStreamReady(true);
      startAnalysisLoop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access the camera.");
    } finally {
      setIsStarting(false);
    }
  }, [stopStream, startAnalysisLoop, requestPermissionIfNeeded]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("live");
      phaseRef.current = "live";
      setPreviewUrl(null);
      setCapturedFile(null);
      setError(null);
      return;
    }

    const frame = requestAnimationFrame(() => {
      startCameraRef.current();
    });
    return () => {
      cancelAnimationFrame(frame);
      stopStream();
    };
  }, [open, stopStream]);

  const handleFlipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    facingModeRef.current = next;
    if (open && phaseRef.current === "live") {
      startCameraRef.current(next);
    }
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedFile(null);
    setPhase("live");
    phaseRef.current = "live";
    startCameraRef.current();
  };

  const handleContinue = () => {
    if (!capturedFile) return;
    onCapture(capturedFile);
    onClose();
  };

  const handleClose = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopStream();
    onClose();
  };

  if (!open) return null;

  const statusCopy = STATUS_COPY[alignmentStatus];
  const alignmentProgress = getAlignmentProgress(sharpness, stableCount);
  const frameReady = sharpness >= ALIGN_MIN_SHARPNESS;
  const canManualCapture = streamReady && !isStarting && !error;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-modal="true">
      <div className="relative flex-1 overflow-hidden">
        {phase === "live" ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn("h-full w-full object-cover", (isStarting || error) && "opacity-0")}
            />

            {isStarting && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="text-sm font-medium">Opening camera…</span>
                <span className="text-xs text-white/60">Please allow camera access if prompted</span>
              </div>
            )}

            {error && !isStarting && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center text-white">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20">
                  <AlertCircle className="h-7 w-7 text-destructive" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-semibold">Camera unavailable</p>
                  <p className="text-sm text-white/70">{error}</p>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <Button className="w-full rounded-xl" onClick={() => startCameraRef.current()}>
                    Try again
                  </Button>
                  <Button variant="outline" className="w-full rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={handleClose}>
                    Use folder upload instead
                  </Button>
                </div>
              </div>
            )}

            {!error && !isStarting && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={cn(
                      "relative rounded-xl border-2 transition-colors duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]",
                      alignmentStatus === "ready"
                        ? "border-success"
                        : alignmentStatus === "hold-steady"
                          ? "border-primary"
                          : frameReady
                            ? "border-amber-400"
                            : "border-white/70",
                    )}
                    style={{
                      width: `${CARD_FRAME.w * 100}%`,
                      height: `${CARD_FRAME.h * 100}%`,
                      marginTop: `${(CARD_FRAME.y - 0.5 + CARD_FRAME.h / 2) * 100}%`,
                    }}
                  >
                    {["top-0 left-0 border-l-[3px] border-t-[3px]", "top-0 right-0 border-r-[3px] border-t-[3px]", "bottom-0 left-0 border-l-[2px] border-b-[3px]", "bottom-0 right-0 border-r-[3px] border-b-[3px]"].map((c) => (
                      <div key={c} className={`absolute h-7 w-7 border-inherit ${c}`} style={{ borderColor: "inherit" }} />
                    ))}

                    {countdown !== null && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-4xl font-bold text-white backdrop-blur-sm">
                          {countdown}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-4">
                  <Button variant="ghost" size="icon" className="shrink-0 text-white hover:bg-white/20" onClick={handleClose} aria-label="Close camera">
                    <X className="h-5 w-5" />
                  </Button>

                  <div className="mx-3 flex-1 text-center">
                    <p className="text-sm font-semibold text-white">{statusCopy.title}</p>
                    <p className="mt-0.5 text-xs text-white/65">{statusCopy.hint}</p>
                    <div className="mx-auto mt-3 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-white/20">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          alignmentStatus === "ready" || alignmentStatus === "hold-steady"
                            ? "bg-success"
                            : frameReady
                              ? "bg-amber-400"
                              : "bg-white/40",
                        )}
                        style={{ width: `${alignmentProgress}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-white hover:bg-white/20"
                    onClick={handleFlipCamera}
                    aria-label="Switch camera"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </div>

                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-8 pt-16">
                  <p className="mb-4 text-center text-[11px] text-white/50">
                    Auto-captures when aligned · or tap the button anytime
                  </p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={triggerCapture}
                      disabled={!canManualCapture}
                      className={cn(
                        "flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 transition-all",
                        canManualCapture
                          ? "border-white bg-white/25 hover:scale-105 active:scale-95"
                          : "border-white/30 bg-white/10 opacity-50 cursor-not-allowed",
                      )}
                      aria-label="Capture manually"
                    >
                      <Camera className="h-8 w-8 text-white" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {previewUrl && (
              <img src={previewUrl} alt="Captured card preview" className="h-full w-full object-contain bg-black" />
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-6 pt-4">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleClose}>
                <X className="h-5 w-5" />
              </Button>
              <p className="text-sm font-medium text-white">Review capture</p>
              <div className="w-10" />
            </div>
            <div className="absolute inset-x-0 bottom-0 flex gap-3 bg-gradient-to-t from-black/90 to-transparent px-4 pb-8 pt-12">
              <Button variant="outline" className="flex-1 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={handleRetake}>
                Retake
              </Button>
              <Button className="flex-1 rounded-xl bg-gradient-primary shadow-glow" onClick={handleContinue}>
                <Check className="mr-2 h-4 w-4" /> Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
