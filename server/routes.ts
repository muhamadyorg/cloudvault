import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin } from "./auth";
import passport from "passport";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import {
  initBot, stopBot, sendUploadRequestNotification,
  setFileReceivedCallback, isBotRunning
} from "./telegram";

const sseClients = new Set<Response>();

export function broadcastUpdate(type: "files" | "folders" | "requests") {
  const data = JSON.stringify({ type, ts: Date.now() });
  for (const client of sseClients) {
    try { client.write(`data: ${data}\n\n`); } catch { sseClients.delete(client); }
  }
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const TEMP_DIR = path.join(process.cwd(), "uploads", "temp");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: uploadStorage });
const tempUpload = multer({ storage: tempStorage });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  setFileReceivedCallback(async (opts) => {
    const adminTelegramId = await storage.getSetting("telegram_admin_user_id");

    if (opts.fromUserId === adminTelegramId) {
      // Admin yubordi — to'g'ridan-to'g'ri "Telegram" papkasiga saqlash
      const allFolders = await storage.getFolders(null, true);
      let telegramFolder = allFolders.find(f => f.name === "Telegram");

      if (!telegramFolder) {
        const adminUser = await storage.getAdminUser();
        const adminId = adminUser?.id || "system";
        telegramFolder = await storage.createFolder({
          name: "Telegram",
          parentId: null,
          isPrivate: false,
          createdBy: adminId,
        });
      }

      const newPath = path.join(UPLOAD_DIR, opts.fileName);
      if (fs.existsSync(opts.tempPath)) {
        fs.renameSync(opts.tempPath, newPath);
      }

      const savedFile = await storage.createFile({
        name: opts.originalName,
        originalName: opts.originalName,
        mimeType: opts.mimeType,
        size: opts.size,
        path: newPath,
        folderId: telegramFolder.id,
        uploadedBy: telegramFolder.createdBy,
        isPrivate: false,
      });

      broadcastUpdate("files");
      return { id: savedFile.id, originalName: savedFile.originalName };
    } else {
      // Boshqa user — upload request sifatida qo'shish
      const request = await storage.createUploadRequest({
        fileName: opts.fileName,
        originalName: opts.originalName,
        mimeType: opts.mimeType,
        size: opts.size,
        tempPath: opts.tempPath,
        targetFolderId: null,
        requestedBy: `telegram:${opts.fromUserId}:${opts.fromName}`,
      });
      broadcastUpdate("requests");
      return { id: request.id, originalName: request.originalName };
    }
  });

  (async () => {
    try {
      const token = await storage.getSetting("telegram_bot_token");
      const adminUserId = await storage.getSetting("telegram_admin_user_id");
      if (token && adminUserId) {
        await initBot(token, adminUserId);
      }
    } catch (e) {
      console.log("[Telegram] No settings found, bot not started");
    }
  })();

  app.get("/api/events", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "connected", ts: Date.now() })}\n\n`);
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); sseClients.delete(res); }
    }, 25000);
    req.on("close", () => { clearInterval(heartbeat); sseClients.delete(res); });
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ id: user.id, username: user.username, role: user.role });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ id: req.user!.id, username: req.user!.username, role: req.user!.role });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { username, password, currentPassword } = req.body;
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) return res.status(400).json({ message: "Current password is incorrect" });

      const updateData: any = {};
      if (username && username !== user.username) updateData.username = username;
      if (password) updateData.password = password;

      if (Object.keys(updateData).length === 0) {
        return res.json({ id: user.id, username: user.username, role: user.role });
      }

      const updated = await storage.updateUser(user.id, updateData);
      if (!updated) return res.status(500).json({ message: "Update failed" });
      
      req.login({ id: updated.id, username: updated.username, role: updated.role }, (err) => {
        if (err) return res.status(500).json({ message: "Session update failed" });
        res.json({ id: updated.id, username: updated.username, role: updated.role });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/folders", requireAuth, async (req, res) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const isAdmin = req.user!.role === "admin";
      const folderList = await storage.getFolders(parentId || null, isAdmin);
      res.json(folderList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/folders/:id", requireAuth, async (req, res) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      if (folder.isPrivate && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(folder);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/folders/:id/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getFolderSize(req.params.id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/folders", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.createFolder({
        name: req.body.name,
        parentId: req.body.parentId || null,
        isPrivate: req.body.isPrivate || false,
        createdBy: req.user!.id,
      });
      broadcastUpdate("folders");
      res.json(folder);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/folders/:id/rename", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.renameFolder(req.params.id, req.body.name);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      broadcastUpdate("folders");
      res.json(folder);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/folders/:id/move", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.moveFolder(req.params.id, req.body.parentId || null);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      broadcastUpdate("folders");
      res.json(folder);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/folders/:id/privacy", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      const { db } = await import("./db");
      const { folders: foldersTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(foldersTable).set({ isPrivate: req.body.isPrivate }).where(eq(foldersTable.id, req.params.id)).returning();
      broadcastUpdate("folders");
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/folders/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFolder(req.params.id);
      broadcastUpdate("folders");
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/files", requireAuth, async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const isAdmin = req.user!.role === "admin";
      const fileList = await storage.getFiles(folderId || null, isAdmin);
      res.json(fileList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/files/upload", requireAdmin, upload.array("files", 100), async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      const folderId = req.body.folderId || null;
      const isPrivate = req.body.isPrivate === "true";
      const results = [];
      for (const f of uploadedFiles) {
        const file = await storage.createFile({
          name: f.originalname,
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          path: f.path,
          folderId,
          uploadedBy: req.user!.id,
          isPrivate,
        });
        results.push(file);
      }
      broadcastUpdate("files");
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/files/request-upload", requireAuth, tempUpload.array("files", 100), async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      const folderId = req.body.folderId || null;
      const results = [];
      for (const f of uploadedFiles) {
        const request = await storage.createUploadRequest({
          fileName: f.filename,
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          tempPath: f.path,
          targetFolderId: folderId,
          requestedBy: req.user!.id,
        });
        results.push(request);
        sendUploadRequestNotification({
          originalName: f.originalname,
          size: f.size,
          mimeType: f.mimetype,
          requestedByUsername: (req.user as any)?.username || "User",
        }).catch(() => {});
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/upload-requests", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getUploadRequests(status || "pending");
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/upload-requests/:id/approve", requireAdmin, async (req, res) => {
    try {
      const request = await storage.getUploadRequest(req.params.id);
      if (!request) return res.status(404).json({ message: "Request not found" });
      
      const targetFolderId = req.body.targetFolderId !== undefined ? req.body.targetFolderId : request.targetFolderId;
      const newPath = path.join(UPLOAD_DIR, request.fileName);
      
      if (fs.existsSync(request.tempPath)) {
        fs.renameSync(request.tempPath, newPath);
      }
      
      await storage.createFile({
        name: request.originalName,
        originalName: request.originalName,
        mimeType: request.mimeType,
        size: request.size,
        path: newPath,
        folderId: targetFolderId || null,
        uploadedBy: request.requestedBy,
        isPrivate: false,
      });
      
      await storage.updateUploadRequestStatus(req.params.id, "approved");
      broadcastUpdate("files");
      broadcastUpdate("requests");

      forwardToGroup(newPath, request.originalName, request.mimeType).catch(() => {});

      res.json({ message: "Approved" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/upload-requests/:id/reject", requireAdmin, async (req, res) => {
    try {
      const request = await storage.getUploadRequest(req.params.id);
      if (!request) return res.status(404).json({ message: "Request not found" });
      
      if (fs.existsSync(request.tempPath)) {
        fs.unlinkSync(request.tempPath);
      }
      
      await storage.updateUploadRequestStatus(req.params.id, "rejected");
      broadcastUpdate("requests");
      res.json({ message: "Rejected" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/files/:id/download", requireAuth, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      if (file.isPrivate && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.setHeader("Content-Type", file.mimeType);
      const stream = fs.createReadStream(file.path);
      stream.pipe(res);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/files/:id/preview", requireAuth, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      if (file.isPrivate && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
      const stream = fs.createReadStream(file.path);
      stream.pipe(res);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/files/:id/rename", requireAdmin, async (req, res) => {
    try {
      const file = await storage.renameFile(req.params.id, req.body.name);
      if (!file) return res.status(404).json({ message: "File not found" });
      broadcastUpdate("files");
      res.json(file);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/files/:id/move", requireAdmin, async (req, res) => {
    try {
      const file = await storage.moveFile(req.params.id, req.body.folderId || null);
      if (!file) return res.status(404).json({ message: "File not found" });
      broadcastUpdate("files");
      res.json(file);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/files/:id/privacy", requireAdmin, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      const { db } = await import("./db");
      const { files: filesTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(filesTable).set({ isPrivate: req.body.isPrivate }).where(eq(filesTable.id, req.params.id)).returning();
      broadcastUpdate("files");
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/files/:id", requireAdmin, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      await storage.deleteFile(req.params.id);
      broadcastUpdate("files");
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/files/:id/copy", requireAdmin, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      const targetFolderId = req.body.folderId !== undefined ? req.body.folderId : null;
      const ext = path.extname(file.path);
      const newFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const newPath = path.join(UPLOAD_DIR, newFileName);
      if (fs.existsSync(file.path)) {
        fs.copyFileSync(file.path, newPath);
      }
      const copy = await storage.createFile({
        name: file.name,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        path: newPath,
        folderId: targetFolderId,
        uploadedBy: req.user!.id,
        isPrivate: file.isPrivate,
      });
      broadcastUpdate("files");
      res.json(copy);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/storage/usage", requireAuth, async (req, res) => {
    try {
      const usage = await storage.getStorageUsage();
      res.json({ used: usage });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/settings/storage-limit", requireAuth, async (req, res) => {
    try {
      const val = await storage.getSetting("storage_limit_gb");
      const gb = val ? parseFloat(val) : 50;
      res.json({ limitGb: gb });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/settings/storage-limit", requireAdmin, async (req, res) => {
    try {
      const { limitGb } = req.body;
      const parsed = parseFloat(limitGb);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ message: "Invalid storage limit" });
      }
      await storage.setSetting("storage_limit_gb", String(parsed));
      res.json({ limitGb: parsed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/settings/telegram", requireAdmin, async (req, res) => {
    try {
      const token = await storage.getSetting("telegram_bot_token") || "";
      const adminUserId = await storage.getSetting("telegram_admin_user_id") || "";
      res.json({ token: token ? "***" : "", adminUserId, isRunning: isBotRunning() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/settings/telegram", requireAdmin, async (req, res) => {
    try {
      const { token, adminUserId } = req.body;
      if (token && token !== "***") await storage.setSetting("telegram_bot_token", token);
      await storage.setSetting("telegram_admin_user_id", adminUserId || "");

      const finalToken = token && token !== "***" ? token : (await storage.getSetting("telegram_bot_token") || "");
      if (finalToken && adminUserId) {
        await initBot(finalToken, adminUserId);
        res.json({ message: "Telegram bot started", isRunning: true });
      } else {
        await stopBot();
        res.json({ message: "Telegram bot stopped", isRunning: false });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/settings/telegram", requireAdmin, async (req, res) => {
    try {
      await stopBot();
      await storage.setSetting("telegram_bot_token", "");
      await storage.setSetting("telegram_admin_user_id", "");
      res.json({ message: "Telegram bot disconnected" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/folders/:id/breadcrumb", requireAuth, async (req, res) => {
    try {
      const breadcrumbs = [];
      let currentId: string | null = req.params.id;
      while (currentId) {
        const folder = await storage.getFolder(currentId);
        if (!folder) break;
        breadcrumbs.unshift({ id: folder.id, name: folder.name });
        currentId = folder.parentId;
      }
      res.json(breadcrumbs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
