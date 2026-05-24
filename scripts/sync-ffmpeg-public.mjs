import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function syncCore(packageName, distSubdir, publicDir, files) {
  const from = join(root, "node_modules", packageName, "dist", distSubdir);
  const to = join(root, publicDir);

  await mkdir(to, { recursive: true });

  for (const file of files) {
    await cp(join(from, file), join(to, file));
  }

  console.log(`Synced ${packageName} → ${publicDir}/`);
}

await syncCore("@ffmpeg/core", "esm", "public/ffmpeg", ["ffmpeg-core.js", "ffmpeg-core.wasm"]);
// await syncCore("@ffmpeg/core-mt", "esm", "public/ffmpeg-mt", [
//   "ffmpeg-core.js",
//   "ffmpeg-core.wasm",
//   "ffmpeg-core.worker.js",
// ]);
