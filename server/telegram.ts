import TelegramBot from "node-telegram-bot-api";
import path from "path";
import fs from "fs";
import https from "https";

let bot: TelegramBot | null = null;
let botConfig: { token: string; adminUserId: string; groupId: string } | null = null;

type OnFileReceived = (opts: {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  tempPath: string;
  fromUserId: string;
  fromName: string;
}) => Promise<{ id: string; originalName: string }>;

let fileReceivedCallback: OnFileReceived | null = null;

export function setFileReceivedCallback(cb: OnFileReceived) {
  fileReceivedCallback = cb;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4",
    ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
    ".pdf": "application/pdf", ".zip": "application/zip",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}

async function handleFileMessage(msg: TelegramBot.Message) {
  if (!bot || !botConfig || !fileReceivedCallback) return;

  const fromId = String(msg.from?.id || "");
  const fromName = msg.from?.first_name
    ? `${msg.from.first_name}${msg.from.last_name ? " " + msg.from.last_name : ""}${msg.from.username ? " (@" + msg.from.username + ")" : ""}`
    : "Unknown";

  let fileId: string | undefined;
  let originalName: string;
  let mimeType: string;
  let fileSize: number = 0;

  if (msg.document) {
    fileId = msg.document.file_id;
    originalName = msg.document.file_name || `file_${Date.now()}`;
    mimeType = msg.document.mime_type || getMimeType(originalName);
    fileSize = msg.document.file_size || 0;
  } else if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    fileId = photo.file_id;
    originalName = `photo_${Date.now()}.jpg`;
    mimeType = "image/jpeg";
    fileSize = photo.file_size || 0;
  } else if (msg.video) {
    fileId = msg.video.file_id;
    originalName = msg.video.file_name || `video_${Date.now()}.mp4`;
    mimeType = msg.video.mime_type || "video/mp4";
    fileSize = msg.video.file_size || 0;
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    originalName = msg.audio.file_name || `audio_${Date.now()}.mp3`;
    mimeType = msg.audio.mime_type || "audio/mpeg";
    fileSize = msg.audio.file_size || 0;
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    originalName = `voice_${Date.now()}.ogg`;
    mimeType = "audio/ogg";
    fileSize = msg.voice.file_size || 0;
  } else {
    return;
  }

  try {
    const fileInfo = await bot.getFile(fileId!);
    const fileUrl = `https://api.telegram.org/file/bot${botConfig.token}/${fileInfo.file_path}`;
    const ext = path.extname(fileInfo.file_path || originalName) || path.extname(originalName);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const TEMP_DIR = path.join(process.cwd(), "uploads", "temp");
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const tempPath = path.join(TEMP_DIR, uniqueName);

    await downloadFile(fileUrl, tempPath);

    const actualSize = fileSize || fs.statSync(tempPath).size;

    const request = await fileReceivedCallback({
      fileName: uniqueName,
      originalName,
      mimeType,
      size: actualSize,
      tempPath,
      fromUserId: fromId,
      fromName,
    });

    const caption = msg.caption ? `\n📝 Izoh: ${msg.caption}` : "";
    await bot.sendMessage(
      botConfig.adminUserId,
      `📥 *Yangi fayl so'rovi*\n\n👤 Kim: ${fromName}\n📄 Fayl: ${request.originalName}\n💾 Hajm: ${(actualSize / 1024 / 1024).toFixed(2)} MB${caption}\n\n✅ Tasdiqlash uchun CloudVault ga kiring`,
      { parse_mode: "Markdown" }
    );

    await bot.sendMessage(
      msg.chat.id,
      `✅ Faylingiz qabul qilindi! Admin tasdiqlashini kuting.`
    );
  } catch (err: any) {
    console.error("[Telegram] File handling error:", err.message);
    try {
      await bot?.sendMessage(msg.chat.id, "❌ Fayl yuborishda xato yuz berdi.");
    } catch {}
  }
}

export async function initBot(token: string, adminUserId: string, groupId: string) {
  if (bot) {
    try { bot.stopPolling(); } catch {}
    bot = null;
  }

  if (!token || !adminUserId) return;

  try {
    botConfig = { token, adminUserId, groupId };
    bot = new TelegramBot(token, { polling: true });

    bot.on("message", async (msg) => {
      if (msg.document || msg.photo || msg.video || msg.audio || msg.voice) {
        await handleFileMessage(msg);
      } else if (msg.text === "/start") {
        await bot?.sendMessage(msg.chat.id, "👋 Assalomu alaykum! Fayl yuborishingiz mumkin, admin ko'rib chiqadi.");
      } else if (msg.text) {
        await bot?.sendMessage(msg.chat.id, "📎 Fayl yuboring (rasm, video, hujjat va h.k.)");
      }
    });

    bot.on("polling_error", (err) => {
      console.error("[Telegram] Polling error:", err.message);
    });

    console.log("[Telegram] Bot started successfully");
  } catch (err: any) {
    console.error("[Telegram] Failed to start bot:", err.message);
    bot = null;
    botConfig = null;
  }
}

export async function stopBot() {
  if (bot) {
    try { bot.stopPolling(); } catch {}
    bot = null;
    botConfig = null;
  }
}

export async function sendUploadRequestNotification(opts: {
  originalName: string;
  size: number;
  mimeType: string;
  requestedByUsername: string;
}) {
  if (!bot || !botConfig?.adminUserId) return;
  try {
    await bot.sendMessage(
      botConfig.adminUserId,
      `📥 *Yangi upload so'rovi (veb)*\n\n👤 Kim: ${opts.requestedByUsername}\n📄 Fayl: ${opts.originalName}\n💾 Hajm: ${(opts.size / 1024 / 1024).toFixed(2)} MB\n\n✅ Tasdiqlash uchun CloudVault ga kiring`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[Telegram] Failed to send notification:", err.message);
  }
}

export async function forwardToGroup(filePath: string, originalName: string, mimeType: string) {
  if (!bot || !botConfig?.groupId) return;
  try {
    const stream = fs.createReadStream(filePath);
    if (mimeType.startsWith("image/")) {
      await bot.sendPhoto(botConfig.groupId, stream, { caption: originalName });
    } else if (mimeType.startsWith("video/")) {
      await bot.sendVideo(botConfig.groupId, stream, { caption: originalName });
    } else if (mimeType.startsWith("audio/")) {
      await bot.sendAudio(botConfig.groupId, stream, { caption: originalName });
    } else {
      await bot.sendDocument(botConfig.groupId, stream, { caption: originalName });
    }
  } catch (err: any) {
    console.error("[Telegram] Failed to forward to group:", err.message);
  }
}

export function isBotRunning() {
  return !!bot;
}
