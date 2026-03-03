import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(date: string | Date | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getFileIconType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar") || mimeType.includes("7z")) return "archive";
  if (mimeType.includes("word") || mimeType.includes("document")) return "doc";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "presentation";
  if (mimeType.includes("text") || mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("javascript") || mimeType.includes("html") || mimeType.includes("css")) return "code";
  return "file";
}

const IMAGE_EXTS = new Set(["png","jpg","jpeg","webp","gif","bmp","svg","avif","tiff","tif"]);
const HEIC_EXTS = new Set(["heic","heif"]);
const VIDEO_EXTS = new Set(["mp4","webm","mov","mkv","avi","flv","wmv","3gp","m4v","avchd","m2ts","ts"]);
const AUDIO_EXTS = new Set(["mp3","wav","ogg","flac","aac","m4a","opus","wma"]);
const NO_PREVIEW_EXTS = new Set(["raw","dng","cr2","cr3","arw","nef","orf","rw2","raf","eps","ai","psd"]);

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

export type PreviewType = "image" | "heic" | "video" | "audio" | "pdf" | "none";

export function getPreviewType(mimeType: string, name: string): PreviewType {
  const ext = getExt(name);
  const mime = mimeType.toLowerCase();

  if (NO_PREVIEW_EXTS.has(ext)) return "none";

  if (HEIC_EXTS.has(ext) || mime === "image/heic" || mime === "image/heif") return "heic";

  if (IMAGE_EXTS.has(ext) || mime.startsWith("image/")) return "image";

  if (VIDEO_EXTS.has(ext) || mime.startsWith("video/")) return "video";

  if (AUDIO_EXTS.has(ext) || mime.startsWith("audio/")) return "audio";

  if (ext === "pdf" || mime === "application/pdf") return "pdf";

  return "none";
}

export function isPreviewable(mimeType: string, name = ""): boolean {
  return getPreviewType(mimeType, name) !== "none";
}
