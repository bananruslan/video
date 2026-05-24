import { useCallback, useEffect, useRef, useState } from "react";

import "@/domain/conversion/recipes";
import { convertWithRecipe, loadFfmpeg, terminateFfmpeg } from "@/media/ffmpeg/engine";
import { getRecipe, listRecipes } from "@/domain/conversion/registry";
import { createDebugLog } from "@/media/ffmpeg/debug-log";
import {
  readSettingsModePreference,
  writeSettingsModePreference,
} from "@/domain/conversion/settings-mode";
import type {
  AnyConversionRecipe,
  ConversionProgress,
  LoadVariant,
  SettingsMode,
} from "@/domain/conversion/types";

export type ConversionStatus =
  | "idle"
  | "loading-ffmpeg"
  | "ready"
  | "converting"
  | "done"
  | "error";

export interface UseConversionState {
  status: ConversionStatus;
  recipes: AnyConversionRecipe[];
  recipeId: string;
  recipe: AnyConversionRecipe | undefined;
  options: Record<string, unknown>;
  file: File | null;
  progress: ConversionProgress | null;
  logs: string[];
  loadVariant: LoadVariant | null;
  warning: string | null;
  error: string | null;
  resultUrl: string | null;
  resultFileName: string | null;
  settingsMode: SettingsMode;
}

const MAX_LOG_LINES = 150;

export function useConvertJob(initialRecipeId?: string) {
  const recipes = listRecipes();
  const defaultRecipeId = initialRecipeId ?? recipes[0]?.id ?? "";

  const [recipeId, setRecipeId] = useState(defaultRecipeId);
  const [options, setOptions] = useState<Record<string, unknown>>(() => {
    const recipe = getRecipe(defaultRecipeId);
    return recipe ? { ...recipe.defaultOptions } : {};
  });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loadVariant, setLoadVariant] = useState<LoadVariant | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string | null>(null);
  const [settingsMode, setSettingsModeState] = useState<SettingsMode>(readSettingsModePreference);

  const abortRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const recipe = getRecipe(recipeId);

  const appendLog = useCallback((message: string) => {
    const line = message.trim();
    if (!line) return;
    setLogs((prev) => [...prev, line].slice(-MAX_LOG_LINES));
  }, []);

  const trace = useCallback(
    (message: string) => {
      createDebugLog("hook", appendLog)(message);
    },
    [appendLog],
  );

  const revokeResultUrl = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);
    setResultFileName(null);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    revokeResultUrl();
    setFile(null);
    setProgress(null);
    setLogs([]);
    setError(null);
    setWarning(null);
    setStatus(loadVariant ? "ready" : "idle");
  }, [loadVariant, revokeResultUrl]);

  /** Отдаёт результат в output queue, blob URL не revoke */
  const detachResult = useCallback((): {
    objectUrl: string;
    fileName: string;
  } | null => {
    const objectUrl = resultUrlRef.current;
    const fileName = resultFileName;
    if (!objectUrl || !fileName) {
      return null;
    }
    resultUrlRef.current = null;
    setResultUrl(null);
    setResultFileName(null);
    setStatus(loadVariant ? "ready" : "idle");
    return { objectUrl, fileName };
  }, [loadVariant, resultFileName]);

  const selectRecipe = useCallback(
    (id: string) => {
      const next = getRecipe(id);
      if (!next) {
        return;
      }

      setRecipeId(id);
      setOptions({ ...next.defaultOptions });
      setError(null);
      revokeResultUrl();
      setStatus(loadVariant ? "ready" : "idle");
    },
    [loadVariant, revokeResultUrl],
  );

  const setOption = useCallback((key: string, value: unknown) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setSettingsMode = useCallback(
    (mode: SettingsMode) => {
      setSettingsModeState(mode);
      writeSettingsModePreference(mode);

      setOptions((prev) => {
        const current = getRecipe(recipeId);
        if (mode !== "simple" || !current?.simpleSettings) {
          return prev;
        }
        const simple = current.simpleSettings.fromExpert(prev);
        return current.simpleSettings.toExpert(simple);
      });
    },
    [recipeId],
  );

  const selectFile = useCallback(
    (nextFile: File | null) => {
      abortRef.current?.abort();
      abortRef.current = null;
      revokeResultUrl();
      setFile(nextFile);
      setError(null);
      setProgress(null);

      if (!nextFile) {
        setStatus(loadVariant ? "ready" : "idle");
        return;
      }

      const currentRecipe = getRecipe(recipeId);
      const validationError = currentRecipe?.validate?.(nextFile, options);
      if (validationError) {
        setError(validationError);
      }

      setStatus(loadVariant ? "ready" : "idle");
    },
    [loadVariant, options, recipeId, revokeResultUrl],
  );

  const ensureFfmpeg = useCallback(async () => {
    trace("status → loading-ffmpeg");
    setStatus("loading-ffmpeg");
    setError(null);

    try {
      const result = await loadFfmpeg(appendLog);
      setLoadVariant(result.variant);
      if (result.warning) {
        setWarning(result.warning);
      }
      trace("status → ready");
      setStatus("ready");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start the converter";
      trace(`load error: ${message}`);
      setError(message);
      setStatus("error");
      throw err;
    }
  }, [appendLog, trace]);

  const convert = useCallback(async () => {
    if (!recipe || !file) {
      return;
    }

    const validationError = recipe.validate?.(file, options);
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    revokeResultUrl();
    setError(null);
    setProgress(null);
    setLogs([]);

    try {
      trace("convert: click");

      if (!loadVariant) {
        await ensureFfmpeg();
      } else {
        trace("ffmpeg already loaded");
      }

      if (controller.signal.aborted) {
        trace("convert: aborted after load");
        return;
      }

      trace(`status → converting (${file.name}, ${file.size} B)`);
      setStatus("converting");

      const result = await convertWithRecipe(recipe, file, options, {
        signal: controller.signal,
        onProgress: setProgress,
        onLog: appendLog,
      });

      if (controller.signal.aborted) {
        URL.revokeObjectURL(result.objectUrl);
        return;
      }

      resultUrlRef.current = result.objectUrl;
      setResultUrl(result.objectUrl);
      setResultFileName(result.outputFileName);
      trace("status → done");
      setStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        trace("convert: aborted");
        setStatus(loadVariant ? "ready" : "idle");
        return;
      }

      const message = err instanceof Error ? err.message : "Conversion failed";
      trace(`convert error: ${message}`);
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [appendLog, ensureFfmpeg, file, loadVariant, options, recipe, revokeResultUrl, trace]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus(loadVariant ? "ready" : "idle");
    setProgress(null);
  }, [loadVariant]);

  useEffect(() => {
    const onPageHide = () => {
      void terminateFfmpeg();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      abortRef.current?.abort();
      revokeResultUrl();
    };
  }, [revokeResultUrl]);

  const isBusy = status === "loading-ffmpeg" || status === "converting";
  const canConvert = Boolean(file && recipe && !isBusy);

  return {
    status,
    recipes,
    recipeId,
    recipe,
    options,
    file,
    progress,
    logs,
    loadVariant,
    warning,
    error,
    resultUrl,
    resultFileName,
    settingsMode,
    isBusy,
    canConvert,
    selectRecipe,
    setOption,
    setSettingsMode,
    selectFile,
    convert,
    cancel,
    reset,
    detachResult,
    ensureFfmpeg,
  };
}
