import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize, formatDate } from "@/lib/utils";
import { FileIcon } from "@/components/file-icon";
import { Check, X, Loader2, Inbox, FolderOpen } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import type { UploadRequest, Folder } from "@shared/schema";

export default function UploadRequestsPage() {
  const [folderOverrides, setFolderOverrides] = useState<Record<string, string>>({});

  const requestsQuery = useQuery<UploadRequest[]>({
    queryKey: ["/api/upload-requests", "?status=pending"],
  });

  const foldersQuery = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId?: string | null }) =>
      apiRequest("POST", `/api/upload-requests/${id}/approve`, { targetFolderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/upload-requests/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload-requests"] });
    },
  });

  const requests = requestsQuery.data || [];
  const allFolders = foldersQuery.data || [];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold" data-testid="text-requests-title">Upload Requests</h1>
        <p className="text-sm text-muted-foreground">Review and approve user upload requests</p>
      </div>

      {requestsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="text-no-requests">
          <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No pending requests</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">All upload requests have been processed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <Card key={req.id} data-testid={`request-card-${req.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <FileIcon mimeType={req.mimeType} className="w-8 h-8" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{req.originalName}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{formatFileSize(req.size)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-1 min-w-[150px]">
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Select
                      value={folderOverrides[req.id] || req.targetFolderId || "root"}
                      onValueChange={(val) =>
                        setFolderOverrides(prev => ({ ...prev, [req.id]: val }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-folder-${req.id}`}>
                        <SelectValue placeholder="Destination folder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Root</SelectItem>
                        {allFolders.map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        const override = folderOverrides[req.id];
                        const targetFolderId = override === "root" ? null : (override || req.targetFolderId || null);
                        approveMutation.mutate({ id: req.id, targetFolderId });
                      }}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${req.id}`}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectMutation.mutate(req.id)}
                      disabled={rejectMutation.isPending}
                      data-testid={`button-reject-${req.id}`}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4 mr-1" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
