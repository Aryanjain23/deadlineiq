import React, { useState } from "react";
import { Download, Smartphone, X, Check } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface PWAInstallButtonProps {
  variant?: "header" | "card" | "compact";
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = "header",
  className = "",
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already installed and running in standalone mode, hide button
  if (isInstalled && !justInstalled) {
    return null;
  }

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 3000);
    }
  };

  if (justInstalled) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium ${className}`}>
        <Check size={14} /> Installed
      </span>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === "compact") {
      return (
        <button
          type="button"
          onClick={handleInstall}
          title="Install DeadlineIQ App"
          aria-label="Install DeadlineIQ App"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-all duration-150 ${className}`}
        >
          <Smartphone size={13} />
          <span>Install</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleInstall}
        title="Install DeadlineIQ App"
        aria-label="Install DeadlineIQ App"
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary hover:text-white dark:hover:text-primary-foreground font-medium text-xs transition-all duration-150 shadow-sm ${className}`}
      >
        <Download size={14} className="animate-pulse" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install on iPhone / iPad"
          aria-label="Install on iPhone / iPad"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface text-text-secondary hover:text-text-primary text-xs font-medium transition ${className}`}
        >
          <Smartphone size={13} />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-surface-elevated border border-border p-6 shadow-2xl relative text-text-primary animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Install DeadlineIQ</h3>
                  <p className="text-xs text-text-muted">Add to your iPhone / iPad Home Screen</p>
                </div>
              </div>
              <div className="space-y-2.5 text-xs text-text-secondary leading-relaxed bg-surface-subtle/50 p-3.5 rounded-xl border border-border-subtle">
                <p className="flex items-start gap-2">
                  <span className="font-mono text-primary font-bold">1.</span>
                  <span>Tap the <strong>Share</strong> button in Safari's navigation bar.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-mono text-primary font-bold">2.</span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-mono text-primary font-bold">3.</span>
                  <span>Tap <strong>Add</strong> in the top-right corner.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
