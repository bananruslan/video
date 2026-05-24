export interface Mp4ToWebmOptions extends Record<string, unknown> {
  crf: number;
  deadline: "good" | "best" | "realtime";
  cpuUsed: number;
  scaleWidth: number;
  fps: number;
  includeAudio: boolean;
  audioBitrate: "96k" | "128k" | "192k";
}

export interface Mp4ToWebmSimpleOptions extends Record<string, unknown> {
  quality: "low" | "medium" | "high";
  speed: "fast" | "balanced" | "compression";
  resolution: "original" | "720p" | "1080p";
  audio: "off" | "96k" | "128k" | "192k";
}
