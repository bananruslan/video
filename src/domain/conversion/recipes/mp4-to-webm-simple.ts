import type {
  Mp4ToWebmOptions,
  Mp4ToWebmSimpleOptions,
} from "@/domain/conversion/recipes/mp4-to-webm-types";
import type { RecipeSimpleSettings } from "@/domain/conversion/types";

const QUALITY_CRF: Record<Mp4ToWebmSimpleOptions["quality"], number> = {
  low: 40,
  medium: 30,
  high: 22,
};

const SPEED_MAP: Record<
  Mp4ToWebmSimpleOptions["speed"],
  Pick<Mp4ToWebmOptions, "deadline" | "cpuUsed">
> = {
  fast: { deadline: "realtime", cpuUsed: 4 },
  balanced: { deadline: "good", cpuUsed: 2 },
  compression: { deadline: "best", cpuUsed: 0 },
};

const RESOLUTION_WIDTH: Record<Mp4ToWebmSimpleOptions["resolution"], number> = {
  original: 0,
  "720p": 1280,
  "1080p": 1920,
};

export const mp4ToWebmSimpleSettings: RecipeSimpleSettings<
  Mp4ToWebmSimpleOptions,
  Mp4ToWebmOptions
> = {
  defaultSimple: {
    quality: "medium",
    speed: "fast",
    resolution: "original",
    audio: "128k",
  },
  optionFields: [
    {
      kind: "select",
      key: "quality",
      label: "Quality",
      options: [
        { value: "low", label: "Low (smaller file)" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    {
      kind: "select",
      key: "speed",
      label: "Speed",
      options: [
        { value: "fast", label: "Fast" },
        { value: "balanced", label: "Balanced" },
        { value: "compression", label: "Smaller file (slower)" },
      ],
    },
    {
      kind: "select",
      key: "resolution",
      label: "Size",
      options: [
        { value: "original", label: "Same as source" },
        { value: "720p", label: "720p" },
        { value: "1080p", label: "1080p" },
      ],
    },
    {
      kind: "select",
      key: "audio",
      label: "Audio",
      options: [
        { value: "off", label: "Off" },
        { value: "96k", label: "96 kbps" },
        { value: "128k", label: "128 kbps" },
        { value: "192k", label: "192 kbps" },
      ],
    },
  ],
  toExpert(simple) {
    const speed = SPEED_MAP[simple.speed];
    const audioOff = simple.audio === "off";

    return {
      crf: QUALITY_CRF[simple.quality],
      deadline: speed.deadline,
      cpuUsed: speed.cpuUsed,
      scaleWidth: RESOLUTION_WIDTH[simple.resolution],
      fps: 0,
      includeAudio: !audioOff,
      audioBitrate: audioOff ? "128k" : (simple.audio as Mp4ToWebmOptions["audioBitrate"]),
    };
  },
  fromExpert(expert) {
    let quality: Mp4ToWebmSimpleOptions["quality"] = "medium";
    if (expert.crf <= 25) quality = "high";
    else if (expert.crf >= 38) quality = "low";

    let speed: Mp4ToWebmSimpleOptions["speed"] = "balanced";
    if (expert.cpuUsed >= 3 || expert.deadline === "realtime") {
      speed = "fast";
    } else if (expert.cpuUsed <= 1 && expert.deadline === "best") {
      speed = "compression";
    }

    let resolution: Mp4ToWebmSimpleOptions["resolution"] = "original";
    if (expert.scaleWidth >= 1800) resolution = "1080p";
    else if (expert.scaleWidth >= 1000 && expert.scaleWidth < 1800) {
      resolution = "720p";
    }

    const audio: Mp4ToWebmSimpleOptions["audio"] = expert.includeAudio
      ? expert.audioBitrate
      : "off";

    return { quality, speed, resolution, audio };
  },
};
