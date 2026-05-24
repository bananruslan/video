import type { Mp4ToWebmOptions } from "@/domain/conversion/recipes/mp4-to-webm-types";

const INPUT_NAME = "input.mp4";
const OUTPUT_NAME = "output.webm";

/** VP8: явный потолок битрейта — без него libvpx зависает в constrained quality (см. stderr) */
function maxVideoBitrate(scaleWidth: number): string {
  if (scaleWidth >= 1800) return "4M";
  if (scaleWidth >= 1000) return "2M";
  return "1M";
}

/** Всегда VP8 (libvpx) */
export function buildMp4ToWebmFfmpegArgs(
  inputName: string,
  outputName: string,
  options: Mp4ToWebmOptions,
): string[] {
  const args: string[] = [
    "-i",
    inputName,
    "-c:v",
    "libvpx",
    "-crf",
    String(options.crf),
    "-b:v",
    maxVideoBitrate(options.scaleWidth),
    "-deadline",
    options.deadline,
    "-cpu-used",
    String(options.cpuUsed),
    "-threads",
    "1",
  ];

  if (options.scaleWidth > 0) {
    args.push("-vf", `scale=${options.scaleWidth}:-2`);
  }

  if (options.fps > 0) {
    args.push("-r", String(options.fps));
  }

  if (options.includeAudio) {
    // AAC→Opus в WASM: моно + 48 kHz снижают пик памяти при совместном decode с VP8
    args.push(
      "-c:a",
      "libopus",
      "-b:a",
      options.audioBitrate,
      "-ac",
      "1",
      "-ar",
      "48000",
    );
  } else {
    args.push("-an");
  }

  args.push(outputName);

  return args;
}

export { INPUT_NAME as MP4_INPUT_NAME, OUTPUT_NAME as WEBM_OUTPUT_NAME };
