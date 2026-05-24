import type { Config } from "@react-router/dev/config";

/** Клиентский конвертер (FFmpeg.wasm) — без SSR */
export default {
  ssr: false,
} satisfies Config;
