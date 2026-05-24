import type { ConversionRecipe } from "@/domain/conversion/types";
import {
  buildMp4ToWebmFfmpegArgs,
  MP4_INPUT_NAME,
  WEBM_OUTPUT_NAME,
} from "@/domain/conversion/recipes/mp4-to-webm-args";
import { mp4ToWebmSimpleSettings } from "@/domain/conversion/recipes/mp4-to-webm-simple";
import type { Mp4ToWebmOptions } from "@/domain/conversion/recipes/mp4-to-webm-types";

export type { Mp4ToWebmOptions } from "@/domain/conversion/recipes/mp4-to-webm-types";

export const mp4ToWebmRecipe: ConversionRecipe<Mp4ToWebmOptions> = {
  id: "mp4-to-webm",
  label: "MP4 → WebM",
  description: "Turn MP4 into WebM in your browser.",
  accept: ["video/mp4", ".mp4"],
  inputFileName: MP4_INPUT_NAME,
  outputFileName: WEBM_OUTPUT_NAME,
  outputExtension: "webm",
  outputMime: "video/webm",
  defaultOptions: mp4ToWebmSimpleSettings.toExpert(mp4ToWebmSimpleSettings.defaultSimple),
  simpleSettings:
    mp4ToWebmSimpleSettings as unknown as ConversionRecipe<Mp4ToWebmOptions>["simpleSettings"],
  optionFields: [
    {
      kind: "slider",
      key: "crf",
      label: "Quality (lower number = better)",
      min: 4,
      max: 63,
      step: 1,
    },
    {
      kind: "select",
      key: "deadline",
      label: "Encode speed",
      options: [
        { value: "good", label: "good" },
        { value: "best", label: "best (slower)" },
        { value: "realtime", label: "realtime (faster)" },
      ],
    },
    {
      kind: "slider",
      key: "cpuUsed",
      label: "cpu-used (0 = better quality, 5 = faster)",
      min: 0,
      max: 5,
      step: 1,
    },
    {
      kind: "number",
      key: "scaleWidth",
      label: "Width (px, 0 = no resize)",
      min: 0,
      max: 3840,
      step: 2,
      placeholder: "0",
    },
    {
      kind: "number",
      key: "fps",
      label: "FPS (0 = keep original)",
      min: 0,
      max: 120,
      step: 1,
      placeholder: "0",
    },
    {
      kind: "switch",
      key: "includeAudio",
      label: "Audio (Opus)",
    },
    {
      kind: "select",
      key: "audioBitrate",
      label: "Audio bitrate",
      options: [
        { value: "96k", label: "96 kbps" },
        { value: "128k", label: "128 kbps" },
        { value: "192k", label: "192 kbps" },
      ],
    },
  ],
  validate(file) {
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");

    if (!isMp4) {
      return "Please choose an MP4 file.";
    }

    const maxBytes = 500 * 1024 * 1024;
    if (file.size > maxBytes) {
      return "File is over 500 MB. Try a smaller file or lower resolution.";
    }

    return null;
  },
  buildArgs(inputName, outputName, options) {
    return buildMp4ToWebmFfmpegArgs(inputName, outputName, options);
  },
};

export { MP4_INPUT_NAME, WEBM_OUTPUT_NAME };
