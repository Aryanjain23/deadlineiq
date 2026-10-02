import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  variant?: "pill" | "icon" | "segmented";
  showLabel?: boolean;
}

export default function ThemeToggle({
  className = "",
  variant = "pill",
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`p-2 rounded-full border border-border bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all cursor-pointer shadow-sm active:scale-95 ${className}`}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDark ? (
          <Moon size={15} className="text-[#76d8fb]" />
        ) : (
          <Sun size={15} className="text-amber-500" />
        )}
      </button>
    );
  }

  if (variant === "segmented") {
    return (
      <div
        className={`inline-flex items-center p-1 rounded-full border border-border bg-surface-subtle transition-colors ${className}`}
        role="group"
        aria-label="Color theme selector"
      >
        <button
          type="button"
          onClick={() => isDark && toggleTheme()}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
            !isDark
              ? "bg-white text-slate-900 shadow-sm border border-slate-200/80 font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          aria-pressed={!isDark}
          title="Light theme"
        >
          <Sun size={13} className={!isDark ? "text-amber-500" : ""} />
          <span>Light</span>
        </button>

        <button
          type="button"
          onClick={() => !isDark && toggleTheme()}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
            isDark
              ? "bg-[#182234] text-white shadow-sm border border-white/[0.1] font-semibold"
              : "text-slate-500 hover:text-slate-900"
          }`}
          aria-pressed={isDark}
          title="Dark theme"
        >
          <Moon size={13} className={isDark ? "text-[#76d8fb]" : ""} />
          <span>Dark</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface hover:bg-surface-elevated text-xs font-mono text-text-secondary hover:text-text-primary transition-all cursor-pointer shadow-sm active:scale-95 group ${className}`}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        {isDark ? (
          <Moon
            size={14}
            className="text-[#76d8fb] transition-transform group-hover:-rotate-12"
          />
        ) : (
          <Sun
            size={14}
            className="text-amber-500 transition-transform group-hover:rotate-45"
          />
        )}
      </div>

      {showLabel ? (
        <span className="font-medium capitalize">{theme}</span>
      ) : (
        <span className="hidden sm:inline font-medium capitalize">{theme}</span>
      )}
    </button>
  );
}
