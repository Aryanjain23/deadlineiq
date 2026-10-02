import { Cloud, CheckCircle2, Loader2, CloudOff } from "lucide-react";

export type SyncState = "idle" | "saving" | "synced" | "offline" | "loading" | "uploading";

interface FirebaseSyncStatusProps {
  state: SyncState;
  customText?: string;
  className?: string;
}

export default function FirebaseSyncStatus({
  state,
  customText,
  className = "",
}: FirebaseSyncStatusProps) {
  if (state === "idle") return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border backdrop-blur-md transition-all ${
        state === "saving" || state === "uploading" || state === "loading"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-[#bae6fd]"
          : state === "synced"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-[#a7f3d0]"
          : "border-border bg-surface-subtle text-text-muted"
      } ${className}`}
    >
      {state === "saving" && (
        <>
          <Loader2 size={11} className="animate-spin text-sky-500" />
          <span>{customText || "Saving to cloud..."}</span>
        </>
      )}

      {state === "uploading" && (
        <>
          <Loader2 size={11} className="animate-spin text-sky-500" />
          <span>{customText || "Uploading source..."}</span>
        </>
      )}

      {state === "loading" && (
        <>
          <Loader2 size={11} className="animate-spin text-sky-500" />
          <span>{customText || "Loading deadlines..."}</span>
        </>
      )}

      {state === "synced" && (
        <>
          <CheckCircle2 size={12} className="text-emerald-500" />
          <span>{customText || "Synced to cloud"}</span>
        </>
      )}

      {state === "offline" && (
        <>
          <CloudOff size={11} className="text-text-muted" />
          <span>{customText || "Saved locally"}</span>
        </>
      )}
    </div>
  );
}
