import type { DebugLogFn } from "@/media/ffmpeg/debug-log";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} с`;
}

function indexOfAscii(haystack: Uint8Array, needle: string, from = 0): number {
  const n = needle.length;
  for (let i = from; i <= haystack.length - n; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...data.slice(offset, offset + length));
}

async function readFileSlice(file: File, start: number, length: number): Promise<Uint8Array> {
  const end = Math.min(file.size, start + length);
  if (end <= start) return new Uint8Array(0);
  const buffer = await file.slice(start, end).arrayBuffer();
  return new Uint8Array(buffer);
}

const MP4_SCAN_LIMIT = 512 * 1024;

export interface Mp4MoovPlacement {
  moovInHead: boolean;
  moovInTail: boolean;
  /** moov только в хвосте — нет «fast start» (частый экспорт с телефона) */
  moovAtEndOnly: boolean;
}

function isLikelyMp4Container(file: File): boolean {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  return (
    file.type === "video/mp4" ||
    ext === ".mp4" ||
    ext === ".m4v" ||
    ext === ".mov"
  );
}

/** Сканирует начало/конец файла на атом moov (без полного парсинга MP4). */
export async function scanMp4MoovPlacement(file: File): Promise<Mp4MoovPlacement | null> {
  if (!isLikelyMp4Container(file) || file.size < 12) {
    return null;
  }

  const scanHead = Math.min(file.size, MP4_SCAN_LIMIT);
  const scanTail = Math.min(file.size, MP4_SCAN_LIMIT);
  const [headScan, tailScan] = await Promise.all([
    readFileSlice(file, 0, scanHead),
    file.size > scanTail
      ? readFileSlice(file, file.size - scanTail, scanTail)
      : Promise.resolve(new Uint8Array(0)),
  ]);

  const moovInHead = hasMoovBoxInHead(headScan);
  const moovInTail = tailScan.length > 0 && hasMoovBox(tailScan);

  return {
    moovInHead,
    moovInTail,
    moovAtEndOnly: !moovInHead && moovInTail && file.size > scanHead,
  };
}

/** Тип box на offset+4 — меньше ложных «moov» внутри mdat */
function hasMoovBox(data: Uint8Array): boolean {
  for (let i = 0; i + 8 <= data.length; i++) {
    if (readAscii(data, i + 4, 4) === "moov") {
      return true;
    }
  }
  return false;
}

/** moov в первых ~1 MB файла (типичный fast start) */
function hasMoovBoxInHead(headScan: Uint8Array): boolean {
  const headLimit = Math.min(headScan.length, 1024 * 1024);
  for (let i = 0; i + 8 <= headLimit; i++) {
    if (readAscii(headScan, i + 4, 4) === "moov") {
      return true;
    }
  }
  return false;
}

export async function probeVideoDimensions(file: File): Promise<VideoDimensions | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;

  try {
    const dims = await new Promise<VideoDimensions | null>((resolve) => {
      const timeoutMs = 12_000;
      const timer = window.setTimeout(() => resolve(null), timeoutMs);

      const finish = (value: VideoDimensions | null) => {
        window.clearTimeout(timer);
        resolve(value);
      };

      video.onloadedmetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finish({ width: video.videoWidth, height: video.videoHeight });
        } else {
          finish(null);
        }
      };

      video.onerror = () => finish(null);
      video.src = url;
    });

    return dims;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/** Первые байты + поиск ftyp/moov/mdat в начале и в «хвосте» файла */
async function describeMp4Layout(file: File, log: DebugLogFn): Promise<void> {
  const head = await readFileSlice(file, 0, Math.min(file.size, 64));
  if (head.length >= 8) {
    const boxType = readAscii(head, 4, 4);
    const hex = Array.from(head.slice(0, Math.min(32, head.length)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    log(`заголовок (32 B hex): ${hex}`);

    if (boxType === "ftyp" && head.length >= 12) {
      const major = readAscii(head, 8, 4);
      const minor =
        head.length >= 16
          ? readAscii(head, 12, 4)
          : "";
      log(`контейнер: ftyp, major brand=${major}${minor ? `, minor=${minor}` : ""}`);
    } else {
      log(`первый box type (offset 4): ${boxType || "(пусто)"}`);
    }
  }

  const scanHead = Math.min(file.size, MP4_SCAN_LIMIT);
  const scanTail = Math.min(file.size, MP4_SCAN_LIMIT);
  const [headScan, tailScan] = await Promise.all([
    readFileSlice(file, 0, scanHead),
    file.size > scanTail ? readFileSlice(file, file.size - scanTail, scanTail) : Promise.resolve(new Uint8Array(0)),
  ]);

  const moovInHead = hasMoovBoxInHead(headScan);
  const moovInTail = tailScan.length > 0 && hasMoovBox(tailScan);
  const moovAtEndOnly = !moovInHead && moovInTail && file.size > scanHead;

  const atomNames = ["ftyp", "moov", "mdat", "free", "wide", "uuid"] as const;
  const describeScan = (label: string, data: Uint8Array, baseOffset: number) => {
    for (const atom of atomNames) {
      const positions: number[] = [];
      let from = 0;
      while (positions.length < 5) {
        const at = indexOfAscii(data, atom, from);
        if (at < 0) break;
        positions.push(baseOffset + at);
        from = at + 4;
      }
      if (positions.length > 0) {
        log(`${label}: «${atom}» на смещении ${positions.map((p) => `${p}`).join(", ")}`);
      }
    }
  };

  describeScan(`скан начала (0…${scanHead} B)`, headScan, 0);
  if (tailScan.length > 0) {
    describeScan(`скан конца (…${file.size} B)`, tailScan, file.size - tailScan.length);
  }

  if (moovAtEndOnly) {
    log(
      "⚠ moov только в конце файла — «fast start» нет; перед конвертацией будет remux (+faststart)",
    );
  }
  if (!moovInHead && !moovInTail && file.size > 0) {
    log("⚠ атом moov не найден в первых/последних 512 KB — файл может быть повреждён или не MP4");
  }
}

/** Метаданные через <video>: то, что браузер реально умеет декодировать */
async function probeWithVideoElement(file: File, log: DebugLogFn): Promise<void> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;

  const result = await new Promise<{
    ok: boolean;
    duration?: number;
    width?: number;
    height?: number;
    error?: string;
  }>((resolve) => {
    const timeoutMs = 12_000;
    const timer = window.setTimeout(() => {
      resolve({ ok: false, error: `таймаут metadata (${timeoutMs / 1000} с)` });
    }, timeoutMs);

    const finish = (value: { ok: boolean; duration?: number; width?: number; height?: number; error?: string }) => {
      window.clearTimeout(timer);
      resolve(value);
    };

    video.onloadedmetadata = () => {
      finish({
        ok: true,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.onerror = () => {
      const mediaError = video.error;
      const code = mediaError?.code ?? "?";
      const message = mediaError?.message ?? "unknown";
      finish({ ok: false, error: `MediaError code=${code} ${message}` });
    };

    video.src = url;
  });

  URL.revokeObjectURL(url);
  video.removeAttribute("src");
  video.load();

  const mp4Types = [
    'video/mp4; codecs="avc1.42E01E"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
    'video/mp4; codecs="hvc1.1.6.L93.B0"',
  ];
  const canPlay = mp4Types
    .map((t) => {
      const label = t.match(/codecs="([^"]+)"/)?.[1] ?? t;
      return `${label}=${video.canPlayType(t) || "no"}`;
    })
    .join(", ");
  log(`canPlayType: ${canPlay}`);

  if (result.ok) {
    log(
      `браузер (video): ${result.width ?? 0}×${result.height ?? 0}, длительность ${formatDuration(result.duration ?? 0)} (${(result.duration ?? 0).toFixed(2)} с)`,
    );
    if ((result.width ?? 0) === 0 || (result.height ?? 0) === 0) {
      log("⚠ браузер не сообщил размер кадра — возможны проблемы с треком или кодеком");
    }
  } else {
    log(`браузер (video): не удалось прочитать metadata — ${result.error ?? "ошибка"}`);
    log("⚠ если metadata не читается, FFmpeg.wasm тоже может упасть на этом файле");
  }
}

function logEnvironment(log: DebugLogFn): void {
  const parts: string[] = [];
  if (typeof navigator !== "undefined") {
    parts.push(`UA: ${navigator.userAgent.slice(0, 120)}…`);
    if ("deviceMemory" in navigator) {
      parts.push(`deviceMemory≈${(navigator as Navigator & { deviceMemory?: number }).deviceMemory} GB`);
    }
    parts.push(`hardwareConcurrency=${navigator.hardwareConcurrency}`);
  }
  if (typeof performance !== "undefined" && "memory" in performance) {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } })
      .memory;
    if (mem) {
      parts.push(
        `JS heap: ${formatBytes(mem.usedJSHeapSize)} / ${formatBytes(mem.jsHeapSizeLimit)}`,
      );
    }
  }
  log(parts.join(" | "));
}

export function summarizeConversionOptions(options: Record<string, unknown>): string {
  try {
    return JSON.stringify(options);
  } catch {
    return String(options);
  }
}

/**
 * Подробный снимок входного File перед writeFile/exec.
 * Помогает сравнить «рабочий» и «битый» MP4 в логах UI (?debug).
 */
export async function logInputFileDiagnostics(
  log: DebugLogFn,
  file: File,
  context?: { recipeId?: string; options?: Record<string, unknown> },
): Promise<void> {
  log("── входной файл ──");
  log(`имя: ${file.name}`);
  log(`размер: ${file.size} B (${formatBytes(file.size)})`);
  log(`MIME (File.type): ${file.type || "(пусто)"}`);
  log(`lastModified: ${new Date(file.lastModified).toISOString()}`);

  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  const looksMp4 = file.type === "video/mp4" || ext === ".mp4";
  log(`расширение: ${ext || "(нет)"}, принят как MP4: ${looksMp4 ? "да" : "нет"}`);

  if (context?.recipeId) {
    log(`recipe: ${context.recipeId}`);
  }
  if (context?.options) {
    log(`параметры: ${summarizeConversionOptions(context.options)}`);
  }

  logEnvironment(log);

  if (isLikelyMp4Container(file)) {
    await describeMp4Layout(file, log);
  }

  await probeWithVideoElement(file, log);
  log("── конец снимка файла ──");
}
