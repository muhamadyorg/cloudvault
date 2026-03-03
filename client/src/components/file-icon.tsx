import {
  FileImage, FileVideo, FileAudio, FileText, FileArchive,
  File, FileCode, FileSpreadsheet, Presentation, Lock
} from "lucide-react";
import { getFileIconType } from "@/lib/utils";

interface FileIconProps {
  mimeType: string;
  className?: string;
  isPrivate?: boolean;
}

export function FileIcon({ mimeType, className = "w-5 h-5", isPrivate }: FileIconProps) {
  const type = getFileIconType(mimeType);
  const iconMap: Record<string, any> = {
    image: FileImage,
    video: FileVideo,
    audio: FileAudio,
    pdf: FileText,
    archive: FileArchive,
    doc: FileText,
    spreadsheet: FileSpreadsheet,
    presentation: Presentation,
    code: FileCode,
    file: File,
  };

  const colorMap: Record<string, string> = {
    image: "text-emerald-500",
    video: "text-purple-500",
    audio: "text-amber-500",
    pdf: "text-red-500",
    archive: "text-yellow-600",
    doc: "text-blue-500",
    spreadsheet: "text-green-600",
    presentation: "text-orange-500",
    code: "text-slate-500",
    file: "text-muted-foreground",
  };

  const Icon = iconMap[type] || File;
  const color = colorMap[type] || "text-muted-foreground";

  return (
    <div className="relative">
      <Icon className={`${className} ${color}`} />
      {isPrivate && (
        <Lock className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
      )}
    </div>
  );
}
