import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRealtimeUpdates } from "@/hooks/use-realtime";
import { formatFileSize, formatDate, isPreviewable } from "@/lib/utils";
import { FileIcon } from "./file-icon";
import { UploadZone } from "./upload-zone";
import { useToast } from "@/hooks/use-toast";
import type { CloudFile, Folder } from "@shared/schema";
import {
  FolderIcon, FolderLock, ChevronRight, ChevronLeft, Home, Upload,
  MoreVertical, Download, Pencil, Trash2, Move, Copy, Eye,
  Lock, Unlock, LayoutGrid, LayoutList, Grid3X3, Loader2,
  ArrowLeft, FolderPlus, ClipboardPaste, X, Maximize, Minimize
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

type ViewMode = "list" | "grid" | "large-grid";

interface ClipboardItem {
  type: "file" | "folder";
  id: string;
  name: string;
  action: "copy" | "cut";
}

export function FileBrowser() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  useRealtimeUpdates();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPrivate, setNewFolderPrivate] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveDialog, setMoveDialog] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("root");
  const [previewFileIndex, setPreviewFileIndex] = useState<number>(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const foldersQuery = useQuery<Folder[]>({
    queryKey: ["/api/folders", currentFolderId ? `?parentId=${currentFolderId}` : ""],
  });

  const filesQuery = useQuery<CloudFile[]>({
    queryKey: ["/api/files", currentFolderId ? `?folderId=${currentFolderId}` : ""],
  });

  const breadcrumbQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/folders", currentFolderId, "breadcrumb"],
    enabled: !!currentFolderId,
  });

  const allFoldersQuery = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
    enabled: !!moveDialog,
  });

  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string; parentId: string | null; isPrivate: boolean }) =>
      apiRequest("POST", "/api/folders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setShowNewFolder(false);
      setNewFolderName("");
      setNewFolderPrivate(false);
      toast({ title: "Folder created" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ type, id, name }: { type: string; id: string; name: string }) =>
      apiRequest("PUT", `/api/${type}s/${id}/rename`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setRenameDialog(null);
      toast({ title: "Renamed successfully" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ type, id, targetId }: { type: string; id: string; targetId: string | null }) => {
      const body = type === "file" ? { folderId: targetId } : { parentId: targetId };
      return apiRequest("PUT", `/api/${type}s/${id}/move`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setMoveDialog(null);
      setClipboard(null);
      toast({ title: "Moved successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      apiRequest("DELETE", `/api/${type}s/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      setDeleteDialog(null);
      toast({ title: "Deleted successfully" });
    },
  });

  const privacyMutation = useMutation({
    mutationFn: ({ type, id, isPrivate }: { type: string; id: string; isPrivate: boolean }) =>
      apiRequest("PUT", `/api/${type}s/${id}/privacy`, { isPrivate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({ title: "Privacy updated" });
    },
  });

  const copyFileMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      apiRequest("POST", `/api/files/${id}/copy`, { folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      setClipboard(null);
      toast({ title: "Copied successfully" });
    },
  });

  const foldersList = useMemo(() => foldersQuery.data || [], [foldersQuery.data]);
  const filesList = useMemo(() => filesQuery.data || [], [filesQuery.data]);
  const breadcrumbs = useMemo(() => breadcrumbQuery.data || [], [breadcrumbQuery.data]);
  const isLoading = foldersQuery.isLoading || filesQuery.isLoading;

  const previewFile = previewFileIndex >= 0 && previewFileIndex < filesList.length ? filesList[previewFileIndex] : null;
  const canGoPrev = previewFileIndex > 0;
  const canGoNext = previewFileIndex < filesList.length - 1;

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  const openPreview = useCallback((file: CloudFile) => {
    const idx = filesList.findIndex(f => f.id === file.id);
    setPreviewFileIndex(idx);
    setIsFullscreen(false);
  }, [filesList]);

  const toggleFullscreen = useCallback(() => {
    if (!previewRef.current) return;
    if (!document.fullscreenElement) {
      previewRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handlePaste = () => {
    if (!clipboard) return;
    if (clipboard.action === "copy" && clipboard.type === "file") {
      copyFileMutation.mutate({ id: clipboard.id, folderId: currentFolderId });
    } else {
      moveMutation.mutate({ type: clipboard.type, id: clipboard.id, targetId: currentFolderId });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewFileIndex < 0) return;
      if (e.key === "ArrowLeft" && canGoPrev) setPreviewFileIndex(p => p - 1);
      if (e.key === "ArrowRight" && canGoNext) setPreviewFileIndex(p => p + 1);
      if (e.key === "Escape" && !document.fullscreenElement) { setPreviewFileIndex(-1); setIsFullscreen(false); }
      if ((e.key === "f" || e.key === "F") && !(e.target instanceof HTMLInputElement)) toggleFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewFileIndex, canGoPrev, canGoNext, toggleFullscreen]);

  const contextActions = useMemo(() => ({
    onRename: (item: { type: "file" | "folder"; id: string; name: string }) => { setRenameDialog(item); setRenameValue(item.name); },
    onMove: (item: { type: "file" | "folder"; id: string; name: string }) => setMoveDialog(item),
    onDelete: (item: { type: "file" | "folder"; id: string; name: string }) => setDeleteDialog(item),
    onPrivacy: (type: string, id: string, isPrivate: boolean) => privacyMutation.mutate({ type, id, isPrivate }),
    onCopy: (item: ClipboardItem) => setClipboard(item),
    onCut: (item: ClipboardItem) => setClipboard(item),
  }), [privacyMutation]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-3 border-b flex-wrap">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => navigateToFolder(null)} data-testid="button-nav-home" className="shrink-0">
            <Home className="w-4 h-4" />
          </Button>
          {currentFolderId && (
            <Button
              size="sm" variant="ghost" className="shrink-0" data-testid="button-nav-back"
              onClick={() => {
                if (breadcrumbs.length > 1) navigateToFolder(breadcrumbs[breadcrumbs.length - 2].id);
                else navigateToFolder(null);
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate" data-testid="text-current-path">
            {breadcrumbs.length > 0
              ? breadcrumbs.map((b, i) => (
                  <span key={b.id}>
                    <button className="text-primary/80 hover:underline" onClick={() => navigateToFolder(b.id)} data-testid={`button-breadcrumb-${b.id}`}>
                      {b.name}
                    </button>
                    {i < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 inline mx-1 text-muted-foreground" />}
                  </span>
                ))
              : "Root"
            }
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {clipboard && (
            <>
              <Button size="sm" variant="secondary" onClick={handlePaste} data-testid="button-paste">
                <ClipboardPaste className="w-4 h-4 mr-1" /> Paste
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setClipboard(null)}><X className="w-4 h-4" /></Button>
            </>
          )}
          <Button size="sm" variant={showUpload ? "default" : "secondary"} onClick={() => setShowUpload(!showUpload)} data-testid="button-toggle-upload">
            <Upload className="w-4 h-4 mr-1" /> Upload
          </Button>
          {isAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setShowNewFolder(true)} data-testid="button-new-folder">
              <FolderPlus className="w-4 h-4 mr-1" /> New Folder
            </Button>
          )}
          <div className="flex items-center border rounded-md">
            <Button size="icon" variant={viewMode === "list" ? "default" : "ghost"} className="rounded-r-none h-8 w-8" onClick={() => setViewMode("list")} data-testid="button-view-list">
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button size="icon" variant={viewMode === "grid" ? "default" : "ghost"} className="rounded-none h-8 w-8" onClick={() => setViewMode("grid")} data-testid="button-view-grid">
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button size="icon" variant={viewMode === "large-grid" ? "default" : "ghost"} className="rounded-l-none h-8 w-8" onClick={() => setViewMode("large-grid")} data-testid="button-view-large">
              <Grid3X3 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {showUpload && (
        <div className="p-3 border-b bg-card/50">
          <UploadZone folderId={currentFolderId} onComplete={() => setShowUpload(false)} />
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : foldersList.length === 0 && filesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center" data-testid="text-empty-folder">
            <FolderIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">This folder is empty</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">Upload files or create folders to get started</p>
          </div>
        ) : viewMode === "list" ? (
          <ListView folders={foldersList} files={filesList} isAdmin={isAdmin} onFolderClick={navigateToFolder} onFilePreview={openPreview} {...contextActions} />
        ) : (
          <GridView folders={foldersList} files={filesList} isAdmin={isAdmin} isLarge={viewMode === "large-grid"} onFolderClick={navigateToFolder} onFilePreview={openPreview} {...contextActions} />
        )}
      </div>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Create a new folder in the current directory</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Folder Name</Label>
              <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="My Folder" data-testid="input-new-folder-name" />
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Switch checked={newFolderPrivate} onCheckedChange={setNewFolderPrivate} data-testid="switch-folder-private" />
                <Label>Private (admin only)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            <Button onClick={() => createFolderMutation.mutate({ name: newFolderName, parentId: currentFolderId, isPrivate: newFolderPrivate })} disabled={!newFolderName || createFolderMutation.isPending} data-testid="button-create-folder">
              {createFolderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename</DialogTitle><DialogDescription>Enter a new name</DialogDescription></DialogHeader>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} data-testid="input-rename" />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={() => renameDialog && renameMutation.mutate({ type: renameDialog.type, id: renameDialog.id, name: renameValue })} disabled={!renameValue || renameMutation.isPending} data-testid="button-rename-confirm">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveDialog} onOpenChange={() => setMoveDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move "{moveDialog?.name}"</DialogTitle><DialogDescription>Select destination folder</DialogDescription></DialogHeader>
          <Select value={moveTargetId} onValueChange={setMoveTargetId}>
            <SelectTrigger data-testid="select-move-target"><SelectValue placeholder="Select folder" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Root</SelectItem>
              {(allFoldersQuery.data || []).filter(f => f.id !== moveDialog?.id).map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoveDialog(null)}>Cancel</Button>
            <Button onClick={() => moveDialog && moveMutation.mutate({ type: moveDialog.type, id: moveDialog.id, targetId: moveTargetId === "root" ? null : moveTargetId })} disabled={moveMutation.isPending} data-testid="button-move-confirm">Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteDialog?.name}"?</DialogTitle>
            <DialogDescription>This action cannot be undone. {deleteDialog?.type === "folder" ? "All contents will be deleted." : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteDialog && deleteMutation.mutate({ type: deleteDialog.type, id: deleteDialog.id })} disabled={deleteMutation.isPending} data-testid="button-delete-confirm">
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewFile && (
        <div ref={previewRef} className="fixed inset-0 z-50 bg-black/90 flex flex-col" data-testid="preview-overlay">
          <div className={`flex items-center justify-between p-3 shrink-0 transition-opacity ${isFullscreen ? "opacity-0 hover:opacity-100" : ""}`}>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="text-white/80 hover:text-white" onClick={toggleFullscreen} data-testid="button-fullscreen">
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="text-white/80 hover:text-white" onClick={() => window.open(`/api/files/${previewFile.id}/download`, "_blank")} data-testid="button-preview-download">
                <Download className="w-4 h-4 mr-1" /> Download
              </Button>
              <Button size="icon" variant="ghost" className="text-white/80 hover:text-white" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); setPreviewFileIndex(-1); setIsFullscreen(false); }} data-testid="button-close-preview">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative min-h-0 px-4">
            {canGoPrev && (
              <button className="absolute left-2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors" onClick={() => setPreviewFileIndex(p => p - 1)} data-testid="button-prev-file">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="max-w-full max-h-full flex items-center justify-center overflow-hidden" style={{ width: "100%", height: "100%" }}>
              {previewFile.mimeType.startsWith("image/") && (
                <img src={`/api/files/${previewFile.id}/preview`} alt={previewFile.name} className="max-w-full max-h-full object-contain" data-testid="preview-image" onClick={() => { setPreviewFileIndex(-1); setIsFullscreen(false); }} style={{ cursor: "pointer" }} />
              )}
              {previewFile.mimeType.startsWith("video/") && (
                <video src={`/api/files/${previewFile.id}/preview`} controls className="max-w-full max-h-full object-contain" data-testid="preview-video" />
              )}
              {previewFile.mimeType.startsWith("audio/") && (
                <div className="w-full max-w-md p-6">
                  <audio src={`/api/files/${previewFile.id}/preview`} controls className="w-full" data-testid="preview-audio" />
                </div>
              )}
              {previewFile.mimeType === "application/pdf" && (
                <iframe src={`/api/files/${previewFile.id}/preview`} className="w-full h-full rounded-md bg-white" title={previewFile.name} data-testid="preview-pdf" />
              )}
              {!isPreviewable(previewFile.mimeType) && (
                <div className="text-center text-white/80" data-testid="preview-unavailable">
                  <FileIcon mimeType={previewFile.mimeType} className="w-20 h-20 mx-auto mb-4" />
                  <p className="text-lg">Preview not available</p>
                  <Button className="mt-4" onClick={() => window.open(`/api/files/${previewFile.id}/download`, "_blank")} data-testid="button-download-from-preview">
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                </div>
              )}
            </div>

            {canGoNext && (
              <button className="absolute right-2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors" onClick={() => setPreviewFileIndex(p => p + 1)} data-testid="button-next-file">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="p-3 text-center shrink-0">
            <p className="text-white text-sm font-medium truncate">{previewFile.name}</p>
            <p className="text-white/60 text-xs">{formatFileSize(previewFile.size)} - {formatDate(previewFile.createdAt)} - {previewFileIndex + 1} / {filesList.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ContextMenuItemsProps {
  isAdmin: boolean;
  item: { type: "file" | "folder"; id: string; name: string; isPrivate?: boolean };
  onPreview?: () => void;
  onDownload?: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onPrivacy?: (isPrivate: boolean) => void;
  onCopy: () => void;
  onCut: () => void;
}

function ContextMenuItems({ isAdmin, item, onPreview, onDownload, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: ContextMenuItemsProps) {
  return (
    <>
      {onPreview && <ContextMenuItem onClick={onPreview}><Eye className="w-4 h-4 mr-2" /> Preview</ContextMenuItem>}
      {onDownload && <ContextMenuItem onClick={onDownload}><Download className="w-4 h-4 mr-2" /> Download</ContextMenuItem>}
      {isAdmin && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onRename}><Pencil className="w-4 h-4 mr-2" /> Rename</ContextMenuItem>
          <ContextMenuItem onClick={onCopy}><Copy className="w-4 h-4 mr-2" /> Copy</ContextMenuItem>
          <ContextMenuItem onClick={onCut}><Move className="w-4 h-4 mr-2" /> Cut</ContextMenuItem>
          <ContextMenuItem onClick={onMove}><Move className="w-4 h-4 mr-2" /> Move to...</ContextMenuItem>
          {onPrivacy && (
            <ContextMenuItem onClick={() => onPrivacy(!item.isPrivate)}>
              {item.isPrivate ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {item.isPrivate ? "Make Public" : "Make Private"}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</ContextMenuItem>
        </>
      )}
    </>
  );
}

function ItemActionsDropdown({ isAdmin, item, onPreview, onDownload, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: ContextMenuItemsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-actions-${item.id}`}><MoreVertical className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onPreview && <DropdownMenuItem onClick={onPreview}><Eye className="w-4 h-4 mr-2" /> Preview</DropdownMenuItem>}
        {onDownload && <DropdownMenuItem onClick={onDownload}><Download className="w-4 h-4 mr-2" /> Download</DropdownMenuItem>}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRename}><Pencil className="w-4 h-4 mr-2" /> Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}><Copy className="w-4 h-4 mr-2" /> Copy</DropdownMenuItem>
            <DropdownMenuItem onClick={onCut}><Move className="w-4 h-4 mr-2" /> Cut</DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}><Move className="w-4 h-4 mr-2" /> Move to...</DropdownMenuItem>
            {onPrivacy && (
              <DropdownMenuItem onClick={() => onPrivacy(!item.isPrivate)}>
                {item.isPrivate ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                {item.isPrivate ? "Make Public" : "Make Private"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ViewProps {
  folders: Folder[];
  files: CloudFile[];
  isAdmin: boolean;
  isLarge?: boolean;
  onFolderClick: (id: string) => void;
  onFilePreview: (file: CloudFile) => void;
  onRename: (item: { type: "file" | "folder"; id: string; name: string }) => void;
  onMove: (item: { type: "file" | "folder"; id: string; name: string }) => void;
  onDelete: (item: { type: "file" | "folder"; id: string; name: string }) => void;
  onPrivacy: (type: string, id: string, isPrivate: boolean) => void;
  onCopy: (item: ClipboardItem) => void;
  onCut: (item: ClipboardItem) => void;
}

function ListView({ folders, files, isAdmin, onFolderClick, onFilePreview, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: ViewProps) {
  return (
    <div className="space-y-0.5">
      {folders.map(folder => (
        <FolderListItem key={folder.id} folder={folder} isAdmin={isAdmin}
          onClick={() => onFolderClick(folder.id)}
          onRename={() => onRename({ type: "folder", id: folder.id, name: folder.name })}
          onMove={() => onMove({ type: "folder", id: folder.id, name: folder.name })}
          onDelete={() => onDelete({ type: "folder", id: folder.id, name: folder.name })}
          onPrivacy={(v) => onPrivacy("folder", folder.id, v)}
          onCopy={() => onCopy({ type: "folder", id: folder.id, name: folder.name, action: "copy" })}
          onCut={() => onCut({ type: "folder", id: folder.id, name: folder.name, action: "cut" })}
        />
      ))}
      {files.map(file => (
        <FileListItem key={file.id} file={file} isAdmin={isAdmin}
          onClick={() => onFilePreview(file)}
          onRename={() => onRename({ type: "file", id: file.id, name: file.name })}
          onMove={() => onMove({ type: "file", id: file.id, name: file.name })}
          onDelete={() => onDelete({ type: "file", id: file.id, name: file.name })}
          onPrivacy={(v) => onPrivacy("file", file.id, v)}
          onCopy={() => onCopy({ type: "file", id: file.id, name: file.name, action: "copy" })}
          onCut={() => onCut({ type: "file", id: file.id, name: file.name, action: "cut" })}
        />
      ))}
    </div>
  );
}

function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preventClick = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    preventClick.current = false;
    timerRef.current = setTimeout(() => {
      preventClick.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { onTouchStart, onTouchEnd, onTouchMove: onTouchEnd };
}

function FolderListItem({ folder, isAdmin, onClick, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: {
  folder: Folder; isAdmin: boolean; onClick: () => void;
  onRename: () => void; onMove: () => void; onDelete: () => void;
  onPrivacy: (v: boolean) => void; onCopy: () => void; onCut: () => void;
}) {
  const statsQuery = useQuery<{ totalSize: number; fileCount: number; folderCount: number }>({
    queryKey: ["/api/folders", folder.id, "stats"],
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));

  return (
    <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-3 p-2.5 rounded-md hover-elevate cursor-pointer group" data-testid={`folder-item-${folder.id}`} {...longPress}>
          <div className="flex items-center gap-3 flex-1 min-w-0" onClick={onClick}>
            {folder.isPrivate ? <FolderLock className="w-5 h-5 text-amber-500 shrink-0" /> : <FolderIcon className="w-5 h-5 text-blue-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{folder.name}</p>
              <p className="text-xs text-muted-foreground">
                {statsQuery.data ? `${statsQuery.data.folderCount} folders, ${statsQuery.data.fileCount} files - ${formatFileSize(statsQuery.data.totalSize)}` : "..."}
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{formatDate(folder.createdAt)}</span>
          <ItemActionsDropdown isAdmin={isAdmin}
            item={{ type: "folder", id: folder.id, name: folder.name, isPrivate: folder.isPrivate }}
            onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItems isAdmin={isAdmin}
          item={{ type: "folder", id: folder.id, name: folder.name, isPrivate: folder.isPrivate }}
          onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileListItem({ file, isAdmin, onClick, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: {
  file: CloudFile; isAdmin: boolean; onClick: () => void;
  onRename: () => void; onMove: () => void; onDelete: () => void;
  onPrivacy: (v: boolean) => void; onCopy: () => void; onCut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));

  return (
    <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-3 p-2.5 rounded-md hover-elevate cursor-pointer group" data-testid={`file-item-${file.id}`} {...longPress}>
          <div className="flex items-center gap-3 flex-1 min-w-0" onClick={onClick}>
            <FileIcon mimeType={file.mimeType} isPrivate={file.isPrivate} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{formatDate(file.createdAt)}</span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(`/api/files/${file.id}/download`, "_blank"); }} data-testid={`button-download-${file.id}`}>
              <Download className="w-4 h-4" />
            </Button>
            <ItemActionsDropdown isAdmin={isAdmin}
              item={{ type: "file", id: file.id, name: file.name, isPrivate: file.isPrivate }}
              onPreview={onClick} onDownload={() => window.open(`/api/files/${file.id}/download`, "_blank")}
              onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItems isAdmin={isAdmin}
          item={{ type: "file", id: file.id, name: file.name, isPrivate: file.isPrivate }}
          onPreview={onClick} onDownload={() => window.open(`/api/files/${file.id}/download`, "_blank")}
          onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function GridView({ folders, files, isAdmin, isLarge, onFolderClick, onFilePreview, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: ViewProps) {
  const gridCols = isLarge
    ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8";

  return (
    <div className={`grid ${gridCols} gap-2`}>
      {folders.map(folder => (
        <FolderGridItem key={folder.id} folder={folder} isAdmin={isAdmin} isLarge={!!isLarge}
          onClick={() => onFolderClick(folder.id)}
          onRename={() => onRename({ type: "folder", id: folder.id, name: folder.name })}
          onMove={() => onMove({ type: "folder", id: folder.id, name: folder.name })}
          onDelete={() => onDelete({ type: "folder", id: folder.id, name: folder.name })}
          onPrivacy={(v) => onPrivacy("folder", folder.id, v)}
          onCopy={() => onCopy({ type: "folder", id: folder.id, name: folder.name, action: "copy" })}
          onCut={() => onCut({ type: "folder", id: folder.id, name: folder.name, action: "cut" })}
        />
      ))}
      {files.map(file => (
        <FileGridItem key={file.id} file={file} isAdmin={isAdmin} isLarge={!!isLarge}
          onClick={() => onFilePreview(file)}
          onRename={() => onRename({ type: "file", id: file.id, name: file.name })}
          onMove={() => onMove({ type: "file", id: file.id, name: file.name })}
          onDelete={() => onDelete({ type: "file", id: file.id, name: file.name })}
          onPrivacy={(v) => onPrivacy("file", file.id, v)}
          onCopy={() => onCopy({ type: "file", id: file.id, name: file.name, action: "copy" })}
          onCut={() => onCut({ type: "file", id: file.id, name: file.name, action: "cut" })}
        />
      ))}
    </div>
  );
}

function FolderGridItem({ folder, isAdmin, isLarge, onClick, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: {
  folder: Folder; isAdmin: boolean; isLarge: boolean; onClick: () => void;
  onRename: () => void; onMove: () => void; onDelete: () => void;
  onPrivacy: (v: boolean) => void; onCopy: () => void; onCut: () => void;
}) {
  const statsQuery = useQuery<{ totalSize: number; fileCount: number; folderCount: number }>({
    queryKey: ["/api/folders", folder.id, "stats"],
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));

  return (
    <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div className="relative group" {...longPress}>
          <div
            className={`flex flex-col items-center justify-center p-3 rounded-md hover-elevate cursor-pointer ${isLarge ? "aspect-square" : "aspect-square"}`}
            onClick={onClick} data-testid={`folder-grid-${folder.id}`}
          >
            {folder.isPrivate
              ? <FolderLock className={`${isLarge ? "w-16 h-16" : "w-10 h-10"} text-amber-500 mb-1.5`} />
              : <FolderIcon className={`${isLarge ? "w-16 h-16" : "w-10 h-10"} text-blue-500 mb-1.5`} />
            }
            <p className="text-xs font-medium text-center truncate w-full leading-tight">{folder.name}</p>
            <p className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">
              {statsQuery.data ? `${statsQuery.data.fileCount} files` : "..."}
            </p>
          </div>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ItemActionsDropdown isAdmin={isAdmin}
              item={{ type: "folder", id: folder.id, name: folder.name, isPrivate: folder.isPrivate }}
              onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItems isAdmin={isAdmin}
          item={{ type: "folder", id: folder.id, name: folder.name, isPrivate: folder.isPrivate }}
          onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileGridItem({ file, isAdmin, isLarge, onClick, onRename, onMove, onDelete, onPrivacy, onCopy, onCut }: {
  file: CloudFile; isAdmin: boolean; isLarge: boolean; onClick: () => void;
  onRename: () => void; onMove: () => void; onDelete: () => void;
  onPrivacy: (v: boolean) => void; onCopy: () => void; onCut: () => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const showThumb = isImage || isVideo;
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const thumbUrl = `/api/files/${file.id}/preview`;

  return (
    <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>
        <div className="relative group" {...longPress}>
          <div
            className={`flex flex-col items-center justify-center rounded-md hover-elevate cursor-pointer ${isLarge ? "aspect-square" : "aspect-square"} p-2`}
            onClick={onClick} data-testid={`file-grid-${file.id}`}
          >
            {showThumb ? (
              <div className={`w-full flex-1 min-h-0 rounded overflow-hidden bg-muted/50 flex items-center justify-center ${isLarge ? "mb-1.5" : "mb-1"}`}>
                {isVideo ? (
                  <video src={thumbUrl} muted preload="metadata" className="max-w-full max-h-full object-contain" />
                ) : (
                  <img src={thumbUrl} alt={file.name} className="max-w-full max-h-full object-contain" loading="lazy" />
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <FileIcon mimeType={file.mimeType} isPrivate={file.isPrivate} className={isLarge ? "w-16 h-16" : "w-10 h-10"} />
              </div>
            )}
            <p className="text-xs font-medium text-center truncate w-full leading-tight">{file.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{formatFileSize(file.size)}</p>
          </div>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ItemActionsDropdown isAdmin={isAdmin}
              item={{ type: "file", id: file.id, name: file.name, isPrivate: file.isPrivate }}
              onPreview={onClick} onDownload={() => window.open(`/api/files/${file.id}/download`, "_blank")}
              onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItems isAdmin={isAdmin}
          item={{ type: "file", id: file.id, name: file.name, isPrivate: file.isPrivate }}
          onPreview={onClick} onDownload={() => window.open(`/api/files/${file.id}/download`, "_blank")}
          onRename={onRename} onMove={onMove} onDelete={onDelete} onPrivacy={onPrivacy} onCopy={onCopy} onCut={onCut}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
