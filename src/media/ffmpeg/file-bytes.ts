import { fetchFile } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Читает File для ffmpeg.wasm (официальный util — FileReader под капотом).
 *
 * Важно: после `ffmpeg.writeFile(path, data)` буфер у data **отсоединяется**
 * (transferable в worker), и `data.byteLength` станет 0. Размер нужно брать до writeFile
 * или из `file.size`.
 */
export async function readFileForFfmpeg(file: File): Promise<Uint8Array> {
  const data = await fetchFile(file);

  if (data.byteLength === 0) {
    throw new Error("File is empty (0 B)");
  }

  if (data.byteLength !== file.size) {
    throw new Error(
      `Could not read the full file: ${data.byteLength} B of ${file.size} B`,
    );
  }

  return data;
}

/** readFile из WASM FS; slice() — отдельная копия для Blob. */
export async function readWasmBinaryFile(ffmpeg: FFmpeg, path: string): Promise<Uint8Array> {
  const data = await ffmpeg.readFile(path);
  if (typeof data === "string") {
    throw new Error(`Expected a binary file in WASM FS: ${path}`);
  }

  const bytes =
    data instanceof Uint8Array ? data.slice() : new Uint8Array(data as ArrayBuffer);

  if (bytes.byteLength === 0) {
    throw new Error(`File ${path} is empty (0 B) in WASM FS`);
  }

  return bytes;
}
