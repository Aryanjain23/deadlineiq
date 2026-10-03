import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Shield, ArrowLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function LegalLayout({ title, subtitle, children }: LegalLayoutProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b11] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-border/80 bg-white/90 dark:bg-[#070b11]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={location.startsWith("/login") ? "/login" : "/dashboard"}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-text-muted dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface transition-colors flex items-center gap-1.5 text-xs font-mono"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </Link>
            <div className="h-4 w-px bg-slate-200 dark:bg-border" />
            <Link href="/" className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                D
              </div>
              <span className="font-bold tracking-tight text-sm font-['Space_Grotesk'] text-slate-900 dark:text-white">
                DeadlineIQ
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-text-muted dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface transition-colors cursor-pointer"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 border-b border-slate-200 dark:border-border/60 pb-6">
          <div className="flex items-center gap-2 text-primary text-xs font-mono uppercase tracking-wider mb-1">
            <Shield size={14} />
            <span>Legal & Privacy Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk'] tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-text-secondary mt-1.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Legal Document Content Body */}
        <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-slate-700 dark:text-text-secondary leading-relaxed space-y-6">
          {children}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="w-full border-t border-slate-200 dark:border-border/60 py-6 bg-white dark:bg-[#070b11] mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-text-muted">
          <div>© 2026 DeadlineIQ · Effective Date: Oct 3, 2026</div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Storage & Cookies
            </Link>
            <Link href="/delete-account" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Data Deletion
            </Link>
            <Link href="/contact" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
