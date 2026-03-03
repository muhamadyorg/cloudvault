import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  path: text("path").notNull(),
  folderId: varchar("folder_id"),
  uploadedBy: varchar("uploaded_by").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"),
  createdBy: varchar("created_by").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const uploadRequests = pgTable("upload_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  tempPath: text("temp_path").notNull(),
  targetFolderId: varchar("target_folder_id"),
  requestedBy: varchar("requested_by").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const updateUserSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  currentPassword: z.string().min(1),
});

export const insertFolderSchema = createInsertSchema(folders).pick({
  name: true,
  parentId: true,
  isPrivate: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;
export type CloudFile = typeof files.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type UploadRequest = typeof uploadRequests.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
