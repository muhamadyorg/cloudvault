import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/utils";
import { HardDrive, Shield, Cloud } from "lucide-react";

export default function SettingsPage() {
  const usageQuery = useQuery<{ used: number }>({
    queryKey: ["/api/storage/usage"],
  });

  const totalSpace = 50 * 1024 * 1024 * 1024;
  const used = usageQuery.data?.used || 0;
  const usedPercentage = Math.min((used / totalSpace) * 100, 100);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground">System information and storage usage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Storage Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {usageQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground" data-testid="text-storage-used">
                  {formatFileSize(used)} used
                </span>
                <span className="text-sm text-muted-foreground" data-testid="text-storage-total">
                  {formatFileSize(totalSpace)} total
                </span>
              </div>
              <Progress value={usedPercentage} className="h-3" data-testid="progress-storage" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium" data-testid="text-storage-percentage">
                  {usedPercentage.toFixed(1)}% used
                </span>
                <span className="text-sm text-muted-foreground" data-testid="text-storage-free">
                  {formatFileSize(totalSpace - used)} free
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Encryption</span>
            <Badge variant="secondary" data-testid="badge-encryption">
              Enabled
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Session-based Auth</span>
            <Badge variant="secondary" data-testid="badge-auth">
              Active
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Password Hashing</span>
            <Badge variant="secondary" data-testid="badge-hashing">
              bcrypt
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            System Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Platform</span>
            <span className="text-sm text-muted-foreground" data-testid="text-platform">CloudVault v1.0</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Database</span>
            <span className="text-sm text-muted-foreground">PostgreSQL</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Max Upload Size</span>
            <span className="text-sm text-muted-foreground">Unlimited</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
