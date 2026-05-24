/**
 * Загрузка артефактов @ffmpeg/core (ST) и @ffmpeg/core-mt (MT).
 *
 * Порядок: кэш blob URL → `public/ffmpeg/` (sync-скрипт) → jsDelivr CDN.
 * Файлы скачиваются через toBlobURL: ffmpeg.wasm ожидает blob: URL, а не
 * прямой путь к /public — иначе worker/WASM не поднимаются стабильно.
 *
 * MT требует workerURL и crossOriginIsolated (COOP/COEP в vite.config).
 * Выбор ST/MT делает engine.ts; здесь только resolve URL.
 */

import { toBlobURL } from "@ffmpeg/util";

import { createDebugLog, timedStep, type DebugLogFn } from "@/media/ffmpeg/debug-log";
import type { LoadVariant } from "@/domain/conversion/types";

export type { LoadVariant };

export interface ResolvedCoreUrls {
  variant: LoadVariant;
  coreURL: string;
  wasmURL: string;
  /** Только для core-mt (doc-ffmpeg.md §3.2) */
  workerURL?: string;
}

const CORE_VERSION = "0.12.6";

/** Синхронизируются скриптом `pnpm` / `scripts/sync-ffmpeg-public.mjs` */
const PUBLIC_ST = {
  js: "/ffmpeg/ffmpeg-core.js",
  wasm: "/ffmpeg/ffmpeg-core.wasm",
} as const;

const PUBLIC_MT = {
  js: "/ffmpeg-mt/ffmpeg-core.js",
  wasm: "/ffmpeg-mt/ffmpeg-core.wasm",
  worker: "/ffmpeg-mt/ffmpeg-core.worker.js",
} as const;

const CDN_ST = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const CDN_MT = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;

/** Повторный loadFfmpeg не качает ~25 MB WASM заново в рамках сессии вкладки */
const blobCache: Partial<Record<LoadVariant, ResolvedCoreUrls>> = {};

/** Компиляция WASM + первый load могут занимать минуты на слабых устройствах */
export const LOAD_TIMEOUT_MS = 300_000;

/** doc §3.2: SharedArrayBuffer + COOP/COEP → crossOriginIsolated */
export function isMultithreadCapable(): boolean {
  return typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;
}

function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/**
 * Скачивает ресурс и возвращает blob: URL для ffmpeg.load().
 * Прогресс логируем только для WASM — самый тяжёлый файл.
 */
async function blobFromUrl(
  url: string,
  mimeType: string,
  log: DebugLogFn,
  label: string,
): Promise<string> {
  const withProgress = mimeType === "application/wasm";
  return timedStep(log, `${label} → blob URL`, () =>
    toBlobURL(url, mimeType, withProgress, (progress) => {
      if (progress.total > 0) {
        log(
          `${label}: ${(progress.received / 1048576).toFixed(1)} / ${(progress.total / 1048576).toFixed(1)} MB`,
        );
      }
    }),
  );
}

/** HEAD быстрее полной загрузки: проверяем, что sync-скрипт положил файлы в public */
async function localCoreAvailable(wasmPath: string, workerPath?: string): Promise<boolean> {
  try {
    const wasmHead = await fetch(absoluteUrl(wasmPath), { method: "HEAD" });
    if (!wasmHead.ok) {
      return false;
    }
    if (workerPath) {
      const workerHead = await fetch(absoluteUrl(workerPath), { method: "HEAD" });
      if (!workerHead.ok) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveFromLocal(variant: LoadVariant, log: DebugLogFn): Promise<ResolvedCoreUrls> {
  const paths = variant === "mt" ? PUBLIC_MT : PUBLIC_ST;
  const workerPath = variant === "mt" ? PUBLIC_MT.worker : undefined;

  const [coreURL, wasmURL, workerURL] = await Promise.all([
    blobFromUrl(absoluteUrl(paths.js), "text/javascript", log, "core JS"),
    blobFromUrl(absoluteUrl(paths.wasm), "application/wasm", log, "core WASM"),
    workerPath
      ? blobFromUrl(absoluteUrl(workerPath), "text/javascript", log, "core worker")
      : Promise.resolve(undefined),
  ]);

  return {
    variant,
    coreURL,
    wasmURL,
    ...(workerURL ? { workerURL } : {}),
  };
}

async function resolveFromCdn(variant: LoadVariant, log: DebugLogFn): Promise<ResolvedCoreUrls> {
  const base = variant === "mt" ? CDN_MT : CDN_ST;

  const [coreURL, wasmURL, workerURL] = await Promise.all([
    blobFromUrl(`${base}/ffmpeg-core.js`, "text/javascript", log, "CDN core JS"),
    blobFromUrl(`${base}/ffmpeg-core.wasm`, "application/wasm", log, "CDN core WASM"),
    variant === "mt"
      ? blobFromUrl(`${base}/ffmpeg-core.worker.js`, "text/javascript", log, "CDN core worker")
      : Promise.resolve(undefined),
  ]);

  return {
    variant,
    coreURL,
    wasmURL,
    ...(workerURL ? { workerURL } : {}),
  };
}

/**
 * §3.1 ST: coreURL + wasmURL
 * §3.2 MT: coreURL + wasmURL + workerURL
 */
export async function resolveCoreUrls(
  variant: LoadVariant,
  onLog?: DebugLogFn,
): Promise<ResolvedCoreUrls> {
  const log = createDebugLog("load-config", onLog);

  const cached = blobCache[variant];
  if (cached) {
    log(`reuse cached ${variant} blob URLs`);
    return cached;
  }

  const paths = variant === "mt" ? PUBLIC_MT : PUBLIC_ST;
  const workerPath = variant === "mt" ? PUBLIC_MT.worker : undefined;

  log(`resolve ${variant} core`);

  if (await localCoreAvailable(paths.wasm, workerPath)) {
    try {
      const resolved = await resolveFromLocal(variant, log);
      blobCache[variant] = resolved;
      log(`core source: local ${variant === "mt" ? "/ffmpeg-mt/" : "/ffmpeg/"}`);
      return resolved;
    } catch (localError) {
      log(
        `local ${variant} failed (${localError instanceof Error ? localError.message : String(localError)}), CDN fallback`,
      );
    }
  } else {
    log(`local ${variant} not found, CDN fallback`);
  }

  const resolved = await resolveFromCdn(variant, log);
  blobCache[variant] = resolved;
  log(`core source: jsDelivr CDN (${variant})`);
  return resolved;
}

/** Сброс при terminate / смене variant, чтобы не держать устаревшие blob: ссылки */
export function clearCoreUrlCache(): void {
  delete blobCache.st;
  delete blobCache.mt;
}
