import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md px-3.5 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <WifiOff size={14} className="shrink-0 animate-pulse text-amber-500" />
      <span>Offline mode — viewing cached data</span>
    </div>
  );
};
