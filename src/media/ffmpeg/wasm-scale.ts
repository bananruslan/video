import type { DebugLogFn } from "@/media/ffmpeg/debug-log";
import type { VideoDimensions } from "@/media/ffmpeg/file-diagnostics";

/** Длинная сторона > этого значения — риск OOM libvpx в ffmpeg.wasm */
export const WASM_MAX_VIDEO_EDGE = 720;

/** Значения scaleWidth из Simple «720p» / «1080p» — это длинная сторона, не ширина кадра */
const PRESET_WIDTH_TO_LONG_EDGE: Record<number, number> = {
  1280: 720,
  1920: 1080,
};

function evenWidth(width: number): number {
  const w = Math.max(2, width);
  return w % 2 === 0 ? w : w + 1;
}

/**
 * Ширина для `scale=W:-2` без апскейла.
 * 1280/1920 из Simple → 720p/1080p по длинной стороне (портрет 464×848 → ~394, не 1280).
 */
function normalizeScaleWidth(scaleWidth: number, dims: VideoDimensions): number {
  const { width, height } = dims;
  const maxEdge = Math.max(width, height);

  let targetLongEdge: number | null = null;
  if (scaleWidth <= 0) {
    if (maxEdge <= WASM_MAX_VIDEO_EDGE) {
      return 0;
    }
    targetLongEdge = WASM_MAX_VIDEO_EDGE;
  } else if (PRESET_WIDTH_TO_LONG_EDGE[scaleWidth]) {
    targetLongEdge = PRESET_WIDTH_TO_LONG_EDGE[scaleWidth];
    if (maxEdge <= targetLongEdge) {
      return 0;
    }
  } else {
    // Expert: явная ширина — только уменьшение, никогда upscale
    if (scaleWidth >= width) {
      return 0;
    }
    return evenWidth(scaleWidth);
  }

  if (!targetLongEdge) {
    return 0;
  }

  if (height > width) {
    return evenWidth(Math.round((targetLongEdge / height) * width));
  }

  return evenWidth(Math.min(targetLongEdge, width));
}

/** Подбирает scaleWidth перед exec: пресеты, лимит WASM, запрет upscale. */
export function applyWasmSafeScale(
  options: Record<string, unknown>,
  dims: VideoDimensions | null,
  log?: DebugLogFn,
): Record<string, unknown> {
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    return options;
  }

  const requested = Number(options.scaleWidth) || 0;
  const normalized = normalizeScaleWidth(requested, dims);

  if (normalized !== requested) {
    log?.(
      `масштаб: scaleWidth ${requested} → ${normalized || "off"} (${dims.width}×${dims.height}, без upscale)`,
    );
  }

  return { ...options, scaleWidth: normalized };
}
