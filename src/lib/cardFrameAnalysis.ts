/** Laplacian variance sharpness score for a video frame region (higher = sharper). */
export function measureFrameSharpness(
  video: HTMLVideoElement,
  region: { x: number; y: number; w: number; h: number },
): number {
  if (video.videoWidth === 0 || video.videoHeight === 0) return 0;

  const sampleW = 120;
  const sampleH = 75;
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;

  const sx = region.x * video.videoWidth;
  const sy = region.y * video.videoHeight;
  const sw = region.w * video.videoWidth;
  const sh = region.h * video.videoHeight;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const gray = new Float32Array(sampleW * sampleH);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = y * sampleW + x;
      const lap =
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - sampleW] +
        gray[idx + sampleW];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** Apply OCR preprocessing: grayscale → contrast enhancement → deskew hint. */
export function preprocessForOCR(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d");
  if (!ctx) return ctx!.createImageData(canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Grayscale + contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Stretch contrast: increase diff from 128 (midpoint)
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.3 + 128));
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }

  ctx.putImageData(imageData, 0, 0);
  return imageData;
}

/** Business card frame region (normalized 0–1 coordinates). */
export const CARD_FRAME = { x: 0.08, y: 0.28, w: 0.84, h: 0.38 };

export const ALIGN_MIN_SHARPNESS = 25;
export const AUTO_CAPTURE_SHARPNESS = 70;
export const AUTO_CAPTURE_STABLE_READINGS = 5;
export const AUTO_CAPTURE_COUNTDOWN_SEC = 2;

export type AlignmentStatus = "searching" | "aligning" | "hold-steady" | "ready";

export function getAlignmentStatus(
  sharpness: number,
  stableCount: number,
  countdown: number | null,
): AlignmentStatus {
  if (countdown !== null && countdown > 0) return "ready";
  if (stableCount >= AUTO_CAPTURE_STABLE_READINGS) return "hold-steady";
  if (sharpness >= ALIGN_MIN_SHARPNESS) return "aligning";
  return "searching";
}

export function getAlignmentProgress(sharpness: number, stableCount: number): number {
  const sharpPct = Math.min(100, (sharpness / AUTO_CAPTURE_SHARPNESS) * 70);
  const stablePct = Math.min(30, (stableCount / AUTO_CAPTURE_STABLE_READINGS) * 30);
  return Math.round(sharpPct + stablePct);
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
}

export function pickDefaultFacingMode(): "environment" | "user" {
  // Laptops/desktops only have a front webcam — "environment" fails on Windows
  return isMobileDevice() ? "environment" : "user";
}

async function enumerateVideoInputs(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch {
    return [];
  }
}

export async function requestCameraStream(
  preferredFacing?: "environment" | "user",
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not supported in this browser.");
  }

  if (!window.isSecureContext) {
    throw new Error("Camera requires HTTPS or localhost. Open the app at http://localhost:5173");
  }

  const facing = preferredFacing ?? pickDefaultFacingMode();
  const attempts: MediaStreamConstraints[] = [];

  // 1. Simplest first — works on most Windows laptops
  attempts.push({ video: true, audio: false });

  // 2. Try each physical camera by deviceId (after permission, labels may be available)
  const videoInputs = await enumerateVideoInputs();
  for (const device of videoInputs) {
    attempts.push({ video: { deviceId: { exact: device.deviceId } }, audio: false });
    attempts.push({ video: { deviceId: { ideal: device.deviceId } }, audio: false });
  }

  // 3. Facing mode (mobile)
  attempts.push({ video: { facingMode: { ideal: facing } }, audio: false });
  attempts.push({ video: { facingMode: facing }, audio: false });

  let lastError: unknown;
  const seen = new Set<string>();

  for (const constraints of attempts) {
    const key = JSON.stringify(constraints);
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✓ Camera stream acquired with constraints:", constraints);
      return stream;
    } catch (err) {
      lastError = err;
      console.warn("✗ Camera attempt failed:", constraints, err);
    }
  }

  const name = lastError instanceof DOMException ? lastError.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    throw new Error(
      "Camera blocked. Click the camera icon in your browser address bar → Allow, then tap Try again.",
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    throw new Error("No camera found. Use Choose from folder to upload a card photo.");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    throw new Error("Camera is busy (Zoom/Teams may be using it). Close other apps and try again.");
  }
  if (name === "OverconstrainedError") {
    throw new Error("Camera settings not supported. Tap Try again — we will use a simpler mode.");
  }
  throw new Error("Could not open camera. Use Choose from folder or tap Try again.");
}
