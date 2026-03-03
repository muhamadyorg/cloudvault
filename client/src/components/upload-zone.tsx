import { useState, useCallback, useRef } from "react";
import { Upload, Smartphone, Monitor, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatFileSize } from "@/lib/utils";

interface UploadZoneProps {
  folderId: string | null;
  onComplete?: () => void;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  size: number;
}

export function UploadZone({ folderId, onComplete }: UploadZoneProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin";
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    if (!files.length) return;
    setIsUploading(true);

    const fileArray = Array.from(files);
    const initialProgress = fileArray.map(f => ({
      fileName: f.name,
      progress: 0,
      size: f.size,
    }));
    setUploads(initialProgress);

    const endpoint = isAdmin ? "/api/files/upload" : "/api/files/request-upload";
    const formData = new FormData();
    fileArray.forEach(f => formData.append("files", f));
    if (folderId) formData.append("folderId", folderId);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploads(prev => prev.map(u => ({ ...u, progress: pct })));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.responseText || "Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(formData);
      });

      toast({
        title: isAdmin ? "Files uploaded" : "Upload request sent",
        description: isAdmin
          ? `${fileArray.length} file(s) uploaded successfully`
          : "Your upload request has been sent to the admin for approval",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/upload-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      onComplete?.();
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploads([]);
    }
  }, [isAdmin, folderId, toast, onComplete]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  return (
    <div className="space-y-4">
      <div
        className={`relative border-2 border-dashed rounded-md p-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="upload-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
          data-testid="input-file-upload"
        />
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-muted mx-auto">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragging ? "Drop files here" : "Drag and drop files here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin ? "Files will be uploaded directly" : "Files will be sent as a request to admin"}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {isMobile ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "image/*,video/*";
                      fileInputRef.current.capture = "environment";
                      fileInputRef.current.click();
                    }
                  }}
                  data-testid="button-upload-gallery"
                >
                  <Smartphone className="w-4 h-4 mr-1" />
                  Gallery
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "";
                      fileInputRef.current.removeAttribute("capture");
                      fileInputRef.current.click();
                    }
                  }}
                  data-testid="button-upload-files"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Files
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "";
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                  }
                }}
                data-testid="button-browse-files"
              >
                <Monitor className="w-4 h-4 mr-1" />
                Browse Files
              </Button>
            )}
          </div>
        </div>
      </div>

      {isUploading && uploads.length > 0 && (
        <div className="space-y-3" data-testid="upload-progress-area">
          {uploads.map((u, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate flex-1">{u.fileName}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatFileSize(u.size)} - {u.progress}%
                </span>
              </div>
              <Progress value={u.progress} className="h-2" data-testid={`progress-upload-${i}`} />
            </div>
          ))}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </div>
        </div>
      )}
    </div>
  );
}
