import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function imagesDir() {
  return path.join(
    process.env.DATA_DIR || path.join(process.cwd(), "data"),
    "images",
  );
}

export async function saveImage(key: string, bytes: Uint8Array) {
  const dir = imagesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), bytes, { flag: "wx" });
}

export async function readImage(key: string) {
  try {
    return await readFile(path.join(imagesDir(), key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
