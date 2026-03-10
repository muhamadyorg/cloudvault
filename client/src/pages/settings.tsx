import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFileSize } from "@/lib/utils";
import { HardDrive, Shield, Cloud, Pencil, Check, X, Send, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { SiTelegram } from "react-icons/si";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [tgAdminId, setTgAdminId] = useState("");

  const usageQuery = useQuery<{ used: number }>({
    queryKey: ["/api/storage/usage"],
  });

  const limitQuery = useQuery<{ limitGb: number }>({
    queryKey: ["/api/settings/storage-limit"],
  });

  useEffect(() => {
    if (limitQuery.data) {
      setLimitInput(String(limitQuery.data.limitGb));
    }
  }, [limitQuery.data]);

  const limitMutation = useMutation({
    mutationFn: (limitGb: number) =>
      apiRequest("PUT", "/api/settings/storage-limit", { limitGb }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/storage-limit"] });
      setEditingLimit(false);
      toast({ title: "Storage limit updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const tgQuery = useQuery<{ token: string; adminUserId: string; isRunning: boolean }>({
    queryKey: ["/api/settings/telegram"],
    enabled: user?.role === "admin",
  });

  useEffect(() => {
    if (tgQuery.data) {
      setTgToken(tgQuery.data.token || "");
      setTgAdminId(tgQuery.data.adminUserId || "");
    }
  }, [tgQuery.data]);

  const tgSaveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/settings/telegram", { token: tgToken, adminUserId: tgAdminId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/telegram"] });
      toast({ title: "Telegram sozlamalari saqlandi" });
    },
    onError: (err: any) => {
      toast({ title: "Xato", description: err.message, variant: "destructive" });
    },
  });

  const tgDisconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/settings/telegram"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/telegram"] });
      setTgToken(""); setTgAdminId("");
      toast({ title: "Telegram bot o'chirildi" });
    },
    onError: (err: any) => {
      toast({ title: "Xato", description: err.message, variant: "destructive" });
    },
  });

  const limitGb = limitQuery.data?.limitGb ?? 50;
  const totalSpace = limitGb * 1024 * 1024 * 1024;
  const used = usageQuery.data?.used || 0;
  const usedPercentage = Math.min((used / totalSpace) * 100, 100);
  const isAdmin = user?.role === "admin";

  function handleSaveLimit() {
    const val = parseFloat(limitInput);
    if (isNaN(val) || val <= 0) {
      toast({ title: "Invalid value", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    limitMutation.mutate(val);
  }

  return (
    <div className="h-full overflow-y-auto">
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
          {usageQuery.isLoading || limitQuery.isLoading ? (
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

              {isAdmin && (
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium">Total Storage Limit (GB)</Label>
                  {editingLimit ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={limitInput}
                        onChange={(e) => setLimitInput(e.target.value)}
                        className="w-32"
                        data-testid="input-storage-limit"
                      />
                      <span className="text-sm text-muted-foreground">GB</span>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSaveLimit}
                        disabled={limitMutation.isPending}
                        data-testid="button-save-limit"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingLimit(false);
                          setLimitInput(String(limitGb));
                        }}
                        data-testid="button-cancel-limit"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-muted-foreground" data-testid="text-limit-value">
                        {limitGb} GB
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingLimit(true)}
                        data-testid="button-edit-limit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
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

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SiTelegram className="w-5 h-5 text-[#2AABEE]" />
              Telegram Bot
              {tgQuery.data?.isRunning && (
                <Badge variant="secondary" className="ml-auto text-green-600 bg-green-100 dark:bg-green-900/30">
                  Ishlayapti
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bot orqali fayllarni qabul qiling. Siz (admin) yuborgan fayllar to'g'ridan-to'g'ri <strong>Telegram</strong> papkasiga saqlanadi. Boshqa userlar yuborgan fayllar upload request sifatida keladi.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tg-token">Bot Token</Label>
                <Input
                  id="tg-token"
                  type="password"
                  placeholder="1234567890:AAF..."
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  data-testid="input-tg-token"
                />
                <p className="text-xs text-muted-foreground">@BotFather dan olingan token</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tg-admin-id">Sizning Telegram User ID</Label>
                <Input
                  id="tg-admin-id"
                  placeholder="123456789"
                  value={tgAdminId}
                  onChange={(e) => setTgAdminId(e.target.value)}
                  data-testid="input-tg-admin-id"
                />
                <p className="text-xs text-muted-foreground">@userinfobot dan bilib olishingiz mumkin</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                onClick={() => tgSaveMutation.mutate()}
                disabled={tgSaveMutation.isPending}
                data-testid="button-save-telegram"
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {tgSaveMutation.isPending ? "Saqlanmoqda..." : "Saqlash va ishga tushirish"}
              </Button>
              {tgQuery.data?.isRunning && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => tgDisconnectMutation.mutate()}
                  disabled={tgDisconnectMutation.isPending}
                  data-testid="button-disconnect-telegram"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  O'chirish
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
