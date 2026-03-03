import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "./db";
import { users, files, folders, uploadRequests } from "@shared/schema";
import type { User, InsertUser, CloudFile, Folder, InsertFolder, UploadRequest } from "@shared/schema";
import bcrypt from "bcryptjs";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { role?: string }): Promise<User>;
  updateUser(id: string, data: { username?: string; password?: string }): Promise<User | undefined>;

  getFiles(folderId: string | null, includePrivate: boolean): Promise<CloudFile[]>;
  getFile(id: string): Promise<CloudFile | undefined>;
  createFile(data: Omit<CloudFile, "id" | "createdAt">): Promise<CloudFile>;
  renameFile(id: string, name: string): Promise<CloudFile | undefined>;
  moveFile(id: string, folderId: string | null): Promise<CloudFile | undefined>;
  deleteFile(id: string): Promise<void>;

  getFolders(parentId: string | null, includePrivate: boolean): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | undefined>;
  createFolder(data: InsertFolder & { createdBy: string }): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder | undefined>;
  moveFolder(id: string, parentId: string | null): Promise<Folder | undefined>;
  deleteFolder(id: string): Promise<void>;
  getFolderSize(id: string): Promise<{ totalSize: number; fileCount: number; folderCount: number }>;

  getUploadRequests(status?: string): Promise<UploadRequest[]>;
  getUploadRequest(id: string): Promise<UploadRequest | undefined>;
  createUploadRequest(data: Omit<UploadRequest, "id" | "createdAt" | "status">): Promise<UploadRequest>;
  updateUploadRequestStatus(id: string, status: string): Promise<UploadRequest | undefined>;

  getStorageUsage(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser & { role?: string }): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const [user] = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
      role: insertUser.role || "user",
    }).returning();
    return user;
  }

  async updateUser(id: string, data: { username?: string; password?: string }): Promise<User | undefined> {
    const updateData: any = {};
    if (data.username) updateData.username = data.username;
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
    const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return user;
  }

  async getFiles(folderId: string | null, includePrivate: boolean): Promise<CloudFile[]> {
    const conditions = [];
    if (folderId) {
      conditions.push(eq(files.folderId, folderId));
    } else {
      conditions.push(isNull(files.folderId));
    }
    if (!includePrivate) {
      conditions.push(eq(files.isPrivate, false));
    }
    return db.select().from(files).where(and(...conditions)).orderBy(asc(files.name));
  }

  async getFile(id: string): Promise<CloudFile | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async createFile(data: Omit<CloudFile, "id" | "createdAt">): Promise<CloudFile> {
    const [file] = await db.insert(files).values(data).returning();
    return file;
  }

  async renameFile(id: string, name: string): Promise<CloudFile | undefined> {
    const [file] = await db.update(files).set({ name }).where(eq(files.id, id)).returning();
    return file;
  }

  async moveFile(id: string, folderId: string | null): Promise<CloudFile | undefined> {
    const [file] = await db.update(files).set({ folderId }).where(eq(files.id, id)).returning();
    return file;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async getFolders(parentId: string | null, includePrivate: boolean): Promise<Folder[]> {
    const conditions = [];
    if (parentId) {
      conditions.push(eq(folders.parentId, parentId));
    } else {
      conditions.push(isNull(folders.parentId));
    }
    if (!includePrivate) {
      conditions.push(eq(folders.isPrivate, false));
    }
    return db.select().from(folders).where(and(...conditions)).orderBy(asc(folders.name));
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async createFolder(data: InsertFolder & { createdBy: string }): Promise<Folder> {
    const [folder] = await db.insert(folders).values(data).returning();
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<Folder | undefined> {
    const [folder] = await db.update(folders).set({ name }).where(eq(folders.id, id)).returning();
    return folder;
  }

  async moveFolder(id: string, parentId: string | null): Promise<Folder | undefined> {
    const [folder] = await db.update(folders).set({ parentId }).where(eq(folders.id, id)).returning();
    return folder;
  }

  async deleteFolder(id: string): Promise<void> {
    const childFolders = await db.select().from(folders).where(eq(folders.parentId, id));
    for (const child of childFolders) {
      await this.deleteFolder(child.id);
    }
    const childFiles = await db.select().from(files).where(eq(files.folderId, id));
    for (const file of childFiles) {
      await this.deleteFile(file.id);
    }
    await db.delete(folders).where(eq(folders.id, id));
  }

  async getFolderSize(id: string): Promise<{ totalSize: number; fileCount: number; folderCount: number }> {
    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;

    const folderFiles = await db.select().from(files).where(eq(files.folderId, id));
    for (const f of folderFiles) {
      totalSize += f.size;
      fileCount++;
    }

    const childFolders = await db.select().from(folders).where(eq(folders.parentId, id));
    folderCount = childFolders.length;
    for (const child of childFolders) {
      const childStats = await this.getFolderSize(child.id);
      totalSize += childStats.totalSize;
      fileCount += childStats.fileCount;
      folderCount += childStats.folderCount;
    }

    return { totalSize, fileCount, folderCount };
  }

  async getUploadRequests(status?: string): Promise<UploadRequest[]> {
    if (status) {
      return db.select().from(uploadRequests).where(eq(uploadRequests.status, status)).orderBy(asc(uploadRequests.createdAt));
    }
    return db.select().from(uploadRequests).orderBy(asc(uploadRequests.createdAt));
  }

  async getUploadRequest(id: string): Promise<UploadRequest | undefined> {
    const [req] = await db.select().from(uploadRequests).where(eq(uploadRequests.id, id));
    return req;
  }

  async createUploadRequest(data: Omit<UploadRequest, "id" | "createdAt" | "status">): Promise<UploadRequest> {
    const [req] = await db.insert(uploadRequests).values(data).returning();
    return req;
  }

  async updateUploadRequestStatus(id: string, status: string): Promise<UploadRequest | undefined> {
    const [req] = await db.update(uploadRequests).set({ status }).where(eq(uploadRequests.id, id)).returning();
    return req;
  }

  async getStorageUsage(): Promise<number> {
    const allFiles = await db.select().from(files);
    return allFiles.reduce((sum, f) => sum + f.size, 0);
  }
}

export const storage = new DatabaseStorage();
