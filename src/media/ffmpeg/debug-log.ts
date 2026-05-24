/**
 * Диагностическое логирование слоя media/ffmpeg.
 *
 * В DEV и при `?debug` в URL пишет в console.info; опционально дублирует
 * строки в UI через onLog (technical log в панели).
 */

export type DebugLogFn = (message: string) => void;

/** В проде логи только по `?debug`, чтобы не шуметь в консоли. */
export function isConverterDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("debug");
}

/**
 * Фабрика логгера с префиксом scope и временем (HH:mm:ss.SSS).
 * onLog получает те же строки, что и console — удобно для передачи в React.
 */
export function createDebugLog(scope: string, onLog?: DebugLogFn): DebugLogFn {
  const enabled = isConverterDebugEnabled();

  return (message: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    const line = `[${scope} ${ts}] ${message}`;
    if (enabled) {
      console.info(line);
    }
    onLog?.(line);
  };
}

/** Оборачивает async-шаг: старт → успех с длительностью или ошибка с rethrow. */
export async function timedStep<T>(
  log: DebugLogFn,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  log(`→ ${label}`);
  const start = performance.now();
  try {
    const result = await fn();
    log(`✓ ${label} (${Math.round(performance.now() - start)} ms)`);
    return result;
  } catch (error) {
    const ms = Math.round(performance.now() - start);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    log(`✗ ${label} (${ms} ms) — ${detail}`);
    throw error;
  }
}
