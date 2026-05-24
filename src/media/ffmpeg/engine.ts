/**
 * Обёртка над ffmpeg.wasm: один экземпляр FFmpeg на вкладку, загрузка ядра,
 * запуск Recipe (writeFile → exec → readFile).
 *
 * Domain передаёт Recipe (buildArgs, validate); engine не знает про VP8/CRF.
 * Слой media не импортирует React.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";

import type { AnyConversionRecipe, ConversionProgress, LoadVariant } from "@/domain/conversion/types";
import {
  clearCoreUrlCache,
  isMultithreadCapable,
  LOAD_TIMEOUT_MS,
  resolveCoreUrls,
  type ResolvedCoreUrls,
} from "@/media/ffmpeg/load-config";
import { createDebugLog, timedStep, type DebugLogFn } from "@/media/ffmpeg/debug-log";
import { readFileForFfmpeg, readWasmBinaryFile } from "@/media/ffmpeg/file-bytes";
import {
  logInputFileDiagnostics,
  probeVideoDimensions,
  scanMp4MoovPlacement,
  summarizeConversionOptions,
} from "@/media/ffmpeg/file-diagnostics";
import { applyWasmSafeScale } from "@/media/ffmpeg/wasm-scale";

export type ProgressCallback = (progress: ConversionProgress) => void;
export type LogCallback = (message: string) => void;

export interface ConvertResult {
  blob: Blob;
  objectUrl: string;
  outputFileName: string;
}

/** Сообщения для UI; сырой RuntimeError из WASM не показываем */
function formatConvertError(err: unknown): Error {
  const raw =
    err instanceof Error
      ? err.message || err.name
      : typeof err === "string"
        ? err
        : String(err);

  const isWasmMemory =
    /memory access out of bounds/i.test(raw) ||
    (err instanceof Error && err.name === "RuntimeError");

  if (isWasmMemory) {
    return new Error(
      "Not enough memory. Try a smaller file, lower resolution, or turn audio off.",
    );
  }

  return err instanceof Error ? err : new Error(raw || "Conversion failed.");
}

export interface LoadResult {
  variant: LoadVariant;
  warning?: string;
}

/** Singleton: повторный convert не вызывает ffmpeg.load() */
let ffmpegInstance: FFmpeg | null = null;
let loadedVariant: LoadVariant | null = null;
/** Параллельные loadFfmpeg() из UI ждут один и тот же промис */
let loadPromise: Promise<LoadResult> | null = null;

/** core-mt + libvpx в WASM часто зависает; MT только по явному флагу */
function preferMultithreadCore(): boolean {
  return import.meta.env.VITE_FFMPEG_MT === "true";
}

/** libvpx может долго не слать progress — heartbeat в лог, что процесс жив */
const EXEC_HEARTBEAT_MS = 15_000;

const FASTSTART_TEMP_SUFFIX = ".__faststart__.mp4";

/**
 * moov в конце → remux в отдельный файл. Без AbortSignal: иначе exec пишет «Aborted()»
 * и readFile возвращает 0 B (ломает последующий encode).
 * @returns путь к входу для ffmpeg.exec (оригинал или faststart-копия)
 */
async function resolveMp4InputPath(
  ffmpeg: FFmpeg,
  inputFileName: string,
  sourceFile: File,
  log: DebugLogFn,
): Promise<string> {
  const placement = await scanMp4MoovPlacement(sourceFile);
  if (!placement?.moovAtEndOnly) {
    return inputFileName;
  }

  const tempName = `${inputFileName}${FASTSTART_TEMP_SUFFIX}`;
  log("moov в конце → remux (-c copy -movflags +faststart)");

  try {
    await withTimeout(
      timedStep(log, "remux +faststart", () =>
        ffmpeg.exec(["-i", inputFileName, "-c", "copy", "-movflags", "+faststart", tempName]),
      ),
      LOAD_TIMEOUT_MS,
      "Timed out preparing MP4 (fast start)",
      log,
    );
  } catch (err) {
    throw new Error(
      `Could not prepare MP4 (fast start): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Не readFile в JS — 5 MB в куче + дубликат в WASM FS → OOM на libvpx
  log(`remux готов, вход для кодирования: ${tempName}`);

  try {
    await ffmpeg.deleteFile(inputFileName);
    log(`удалён ${inputFileName} из WASM FS (освобождение памяти)`);
  } catch {
    // ignore
  }

  return tempName;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  log?: DebugLogFn,
): Promise<T> {
  log?.(`таймаут ${ms / 1000} с: ${message}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      log?.(`✗ таймаут: ${message}`);
      reject(new Error(message));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function attachLogHandler(ffmpeg: FFmpeg, log: DebugLogFn) {
  ffmpeg.on("log", ({ type, message }) => {
    log(`ffmpeg [${type}]: ${message}`);
  });
}

async function execFfmpegLoad(
  ffmpeg: FFmpeg,
  urls: ResolvedCoreUrls,
  log: DebugLogFn,
): Promise<void> {
  log(
    urls.variant === "mt"
      ? "ffmpeg.load() — core-mt (многопоточный, doc §3.2)"
      : "ffmpeg.load() — core ST (однопоточный, doc §3.1)",
  );
  log(`coreURL=blob:…${urls.coreURL.slice(-12)}`);
  log(`wasmURL=blob:…${urls.wasmURL.slice(-12)}`);
  if (urls.workerURL) {
    log(`workerURL=blob:…${urls.workerURL.slice(-12)}`);
  }
  log("компиляция WASM: 30–90 с, смотрите лог ffmpeg ниже");

  await withTimeout(
    timedStep(log, "ffmpeg.load()", () =>
      ffmpeg.load({
        coreURL: urls.coreURL,
        wasmURL: urls.wasmURL,
        ...(urls.workerURL ? { workerURL: urls.workerURL } : {}),
      }),
    ),
    LOAD_TIMEOUT_MS,
    "Timed out loading the converter",
    log,
  );

  log(`ffmpeg.load() done, variant=${urls.variant}, loaded=${String(ffmpeg.loaded)}`);
}

function resetInstance(log?: DebugLogFn): void {
  if (ffmpegInstance) {
    log?.("terminate()");
    try {
      ffmpegInstance.terminate();
    } catch (error) {
      log?.(`terminate error: ${error instanceof Error ? error.message : String(error)}`);
    }
    ffmpegInstance = null;
  }
  loadedVariant = null;
}

function getOrCreateInstance(log: DebugLogFn): FFmpeg {
  if (!ffmpegInstance) {
    log("new FFmpeg()");
    ffmpegInstance = new FFmpeg();
  }
  return ffmpegInstance;
}

/** Полная перезагрузка: terminate + resolveCoreUrls + ffmpeg.load */
async function loadVariant(variant: LoadVariant, log: DebugLogFn): Promise<LoadVariant> {
  resetInstance(log);
  const ffmpeg = getOrCreateInstance(log);
  attachLogHandler(ffmpeg, log);

  const urls = await resolveCoreUrls(variant, log);
  await execFfmpegLoad(ffmpeg, urls, log);
  loadedVariant = variant;
  return variant;
}

export function isFfmpegLoaded(): boolean {
  return loadedVariant !== null;
}

/**
 * Загружает ядро один раз за сессию (ST по умолчанию).
 * MT — только VITE_FFMPEG_MT=true и crossOriginIsolated; при ошибке MT → ST.
 */
export async function loadFfmpeg(onLog?: LogCallback): Promise<LoadResult> {
  const log = createDebugLog("engine", onLog);

  if (loadedVariant) {
    // Флаг выключили после эксперимента с MT — откатываемся на ST без перезагрузки страницы
    if (!preferMultithreadCore() && loadedVariant === "mt") {
      log("перезагрузка ядра: MT → ST (стабильный режим)");
      resetInstance(log);
      clearCoreUrlCache();
    } else {
      return { variant: loadedVariant };
    }
  }

  if (loadPromise) {
    log("await existing loadPromise");
    return loadPromise;
  }

  loadPromise = (async (): Promise<LoadResult> => {
    const useMt = preferMultithreadCore() && isMultithreadCapable();

    if (useMt) {
      log("VITE_FFMPEG_MT=true — пробуем core-mt");
      try {
        const variant = await loadVariant("mt", log);
        return { variant };
      } catch (error) {
        console.error("[ffmpeg] core-mt load failed", error);
        clearCoreUrlCache();
        log(`core-mt: ${error instanceof Error ? error.message : String(error)} → ST`);
      }
    } else {
      log(
        isMultithreadCapable()
          ? "core ST (по умолчанию; для MT: VITE_FFMPEG_MT=true)"
          : "core ST (crossOriginIsolated=false, MT недоступен)",
      );
    }

    try {
      const variant = await loadVariant("st", log);
      return { variant };
    } catch (error) {
      console.error("[ffmpeg] load failed", error);
      resetInstance(log);
      throw new Error(error instanceof Error ? error.message : "Could not load the converter");
    }
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * Конвертация по Recipe: виртуальная ФС WASM (имена файлов из recipe).
 * progress: ratio 0–100; time — секунды (ffmpeg отдаёт микросекунды).
 */
export async function convertWithRecipe(
  recipe: AnyConversionRecipe,
  file: File,
  options: Record<string, unknown>,
  callbacks?: {
    onProgress?: ProgressCallback;
    onLog?: LogCallback;
    signal?: AbortSignal;
  },
): Promise<ConvertResult> {
  const log = createDebugLog("convert", callbacks?.onLog);

  if (!loadedVariant) {
    await loadFfmpeg(callbacks?.onLog);
  }

  const ffmpeg = getOrCreateInstance(log);
  const { inputFileName, outputFileName } = recipe;

  const validationError = recipe.validate?.(file, options);
  if (validationError) {
    log(`валидация recipe: ${validationError}`);
    throw new Error(validationError);
  }

  await logInputFileDiagnostics(log, file, {
    recipeId: recipe.id,
    options,
  });

  const throwIfAborted = () => {
    if (callbacks?.signal?.aborted) {
      throw new DOMException("Conversion cancelled", "AbortError");
    }
  };

  const progressHandler = ({ progress, time }: { progress: number; time: number }) => {
    callbacks?.onProgress?.({
      ratio: Math.min(100, Math.max(0, progress * 100)),
      time: time / 1_000_000,
    });
  };

  ffmpeg.on("progress", progressHandler);

  try {
    throwIfAborted();

    const inputBytes = await timedStep(log, `writeFile(${inputFileName})`, async () => {
      const data = await readFileForFfmpeg(file);
      const bytes = data.byteLength;
      await ffmpeg.writeFile(inputFileName, data);
      // writeFile передаёт buffer в worker — data.byteLength после этого уже 0
      return bytes;
    });
    log(`записано в WASM FS: ${inputBytes} B (исходник ${file.size} B)`);

    throwIfAborted();

    const encodeInputName = await resolveMp4InputPath(ffmpeg, inputFileName, file, log);

    throwIfAborted();

    const dims = await probeVideoDimensions(file);
    const encodeOptions = applyWasmSafeScale(options, dims, log);

    const args = recipe.buildArgs(encodeInputName, outputFileName, encodeOptions);
    const vfIndex = args.indexOf("-vf");
    if (vfIndex >= 0 && args[vfIndex + 1]) {
      log(`видео filter: ${args[vfIndex + 1]}`);
    }
    log(`exec: ffmpeg ${args.join(" ")} [core=${loadedVariant ?? "?"}]`);
    log(`параметры recipe: ${summarizeConversionOptions(encodeOptions)}`);

    const heartbeat = setInterval(() => {
      log("конвертация продолжается…");
    }, EXEC_HEARTBEAT_MS);

    try {
      await withTimeout(
        timedStep(log, "ffmpeg.exec()", () => ffmpeg.exec(args, -1, { signal: callbacks?.signal })),
        LOAD_TIMEOUT_MS,
        "Conversion timed out",
        log,
      );
    } catch (execError) {
      log(
        `exec failed: ${execError instanceof Error ? execError.message : String(execError)} (файл: ${file.name}, ${file.size} B)`,
      );
      throw formatConvertError(execError);
    } finally {
      clearInterval(heartbeat);
    }

    throwIfAborted();

    const outputBytes = await timedStep(log, `readFile(${outputFileName})`, () =>
      readWasmBinaryFile(ffmpeg, outputFileName),
    );

    const blob = new Blob([outputBytes as unknown as BlobPart], {
      type: recipe.outputMime,
    });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const downloadFileName = `${baseName}.${recipe.outputExtension}`;
    const objectUrl = URL.createObjectURL(blob);

    log(
      `готово: ${downloadFileName}, выход ${blob.size} B (${((blob.size / file.size) * 100).toFixed(1)}% от входа)`,
    );

    return { blob, objectUrl, outputFileName: downloadFileName };
  } finally {
    ffmpeg.off("progress", progressHandler);

    // Освобождаем память в виртуальной ФС WASM между конвертациями
    for (const path of [
      inputFileName,
      `${inputFileName}${FASTSTART_TEMP_SUFFIX}`,
    ]) {
      try {
        await ffmpeg.deleteFile(path);
      } catch {
        // ignore
      }
    }
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch {
      // ignore
    }
  }
}

export async function terminateFfmpeg(): Promise<void> {
  resetInstance(createDebugLog("engine"));
  loadPromise = null;
}
