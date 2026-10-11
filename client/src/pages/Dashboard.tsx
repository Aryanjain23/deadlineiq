import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  GraduationCap,
  Layers,
  LogOut,
  MapPin,
  BookOpen,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  Target,
  Trash2,
  X,
  ArrowRight,
  LayoutDashboard,
  User,
} from "lucide-react";
import { clearSession, getSession, isAuthenticated, type AuthUser } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import {
  calculateStats,
  formatDueDateTime,
  loadDeadlines,
  saveDeadlines,
  sortDeadlines,
  type Deadline,
  type ImportanceLevel,
} from "@/lib/deadlines";
import {
  loadTimetable,
  saveTimetable,
  getNextUpcomingClass,
  type TimetableEntry,
  type UpcomingClassResult,
} from "@/lib/timetable";
import {
  loadExams,
  saveExams,
  getNearestUpcomingExam,
  getDaysUntil,
  formatExamDateDisplay,
  formatTime12Hour,
  buildAcademicRadar,
  type Exam,
  type RadarItem,
} from "@/lib/exams";
import {
  calculateSmartRecommendations,
  type PlannerRecommendation,
  type UrgencyTier,
} from "@/lib/planner";
import {
  subscribeToDeadlines,
  createDeadline,
  updateDeadline,
  deleteDeadline,
  subscribeToTimetable,
  saveAllTimetableEntries,
  subscribeToExams,
  saveAllExams,
  subscribeToEvents,
  subscribeToDailyPlan,
  clearAllDailyPlans,
} from "@/lib/services";
import {
  getNearestUpcomingEvent,
  type CalendarEvent,
} from "@/lib/calendar";
import ManualEntryModal from "@/components/ManualEntryModal";
import AiExtractModal from "@/components/AiExtractModal";
import TimetableModal from "@/components/TimetableModal";
import ExamsModal from "@/components/ExamsModal";
import AcademicRadar from "@/components/AcademicRadar";
import FocusModal from "@/components/FocusModal";
import PlanMyDayModal from "@/components/PlanMyDayModal";
import ThemeToggle from "@/components/ThemeToggle";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { formatDateToYYYYMMDD, formatCurrentTimeHHMM, timeToMinutes, minutesToTime, evaluateActivePlanState } from '@/lib/smartPlannerEngine';
import type { SavedDailyPlan, ScheduleBlock } from '@/lib/firebase/types';


function formatShortDueDate(dateStr: string): string {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;

    return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user: authUser, isLoading: isAuthLoading, logout } = useAuth();
  const currentUser = authUser;
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todayPlan, setTodayPlan] = useState<SavedDailyPlan | null>(null);
  const [planMyDayClickTime, setPlanMyDayClickTime] = useState<Date | undefined>(undefined);
  const [planModalMode, setPlanModalMode] = useState<"generate" | "view">("generate");

  // Modals state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [isExamsModalOpen, setIsExamsModalOpen] = useState(false);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isPlanMyDayModalOpen, setIsPlanMyDayModalOpen] = useState(false);
  const [isClearPlansConfirmOpen, setIsClearPlansConfirmOpen] = useState(false);
  const [isClearingPlans, setIsClearingPlans] = useState(false);
  const [planClearedSuccess, setPlanClearedSuccess] = useState(false);

  // Mobile profile & settings menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  // Filter state for deadlines list triggered by statistics cards
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "overdue" | "today" | "upcoming" | "dueSoon" | "highPriority">("all");
  
  // Radar section visibility
  const [isRadarExpanded, setIsRadarExpanded] = useState(true);

  // Authentication check & real-time Firestore data synchronization
  useEffect(() => {
    if (isAuthLoading) return;
    if (!currentUser) {
      setLocation("/login");
      return;
    }

    // Always isolate data per unique user UID to prevent cross-account leakage
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");

    // Real-time synchronization directly with authenticated user's Firestore records
    const unsubDeadlines = subscribeToDeadlines(
      userUid,
      (items) => {
        setDeadlines(items);
      },
      userUid
    );

    const unsubTimetable = subscribeToTimetable(
      userUid,
      (items) => {
        setTimetable(items);
      },
      userUid
    );

    const unsubExams = subscribeToExams(
      userUid,
      (items) => {
        setExams(items);
      },
      userUid
    );

    const unsubEvents = subscribeToEvents(
      userUid,
      (items) => {
        setEvents(items);
      },
      userUid
    );
    const unsubPlan = subscribeToDailyPlan(userUid, formatDateToYYYYMMDD(new Date()), (plan) => {
      setTodayPlan(plan);
    });


    return () => {
      unsubDeadlines();
      unsubTimetable();
      unsubExams();
      unsubEvents();
      unsubPlan();
    };
  }, [currentUser, isAuthLoading, setLocation]);

  // Open modal if linked with query parameter (e.g., from Calendar page navigation)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const modalParam = params.get("modal");
      if (modalParam === "exams") {
        setIsExamsModalOpen(true);
      } else if (modalParam === "timetable") {
        setIsTimetableModalOpen(true);
      }
    }
  }, []);


  const handleOpenPlanMyDay = (mode: "generate" | "view" = "generate") => {
    const clickDate = new Date();
    const clickHHMM = formatCurrentTimeHHMM(clickDate);
    const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local";
    const startMins = timeToMinutes(clickHHMM);
    const endMins = (startMins + 9 * 60) % (24 * 60);
    const endHHMM = minutesToTime(endMins);

    console.log("PLAN_MY_DAY_CLICK", {
      localTimestamp: clickDate.toISOString(),
      timezone: tz,
      planningStart: clickHHMM,
      planningEnd: endHHMM,
    });

    setPlanMyDayClickTime(clickDate);
    setPlanModalMode(mode);
    setIsPlanMyDayModalOpen(true);
  };

  const handleConfirmClearAllPlans = async () => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    setIsClearingPlans(true);
    try {
      await clearAllDailyPlans(userUid);
      setTodayPlan(null);
      setIsClearPlansConfirmOpen(false);
      setPlanClearedSuccess(true);
      setTimeout(() => setPlanClearedSuccess(false), 3500);
    } catch (err) {
      console.error("Failed to clear daily plans:", err);
    } finally {
      setIsClearingPlans(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const handleAddDeadline = async (newDeadline: Deadline) => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    try {
      await createDeadline(userUid, newDeadline, userUid);
      setDeadlines((prev) => [newDeadline, ...prev.filter((d) => d.id !== newDeadline.id)]);
    } catch (err) {
      console.warn("Could not sync added deadline to cloud:", err);
      setDeadlines((prev) => [newDeadline, ...prev.filter((d) => d.id !== newDeadline.id)]);
    }
  };

  const handleToggleComplete = async (id: string) => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    const target = deadlines.find((d) => d.id === id);
    if (!target) return;
    const newCompleted = !target.completed;
    try {
      await updateDeadline(userUid, id, { completed: newCompleted }, userUid);
      setDeadlines((prev) =>
        prev.map((d) => (d.id === id ? { ...d, completed: newCompleted } : d))
      );
    } catch (err) {
      console.warn("Could not sync updated deadline to cloud:", err);
      setDeadlines((prev) =>
        prev.map((d) => (d.id === id ? { ...d, completed: newCompleted } : d))
      );
    }
  };

  const handleDeleteDeadline = async (id: string) => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    try {
      await deleteDeadline(userUid, id, userUid);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.warn("Could not sync deleted deadline to cloud:", err);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    }
  };

  const handleUpdateTimetable = async (updated: TimetableEntry[]) => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    try {
      await saveAllTimetableEntries(userUid, updated, userUid);
      setTimetable(updated);
    } catch (err) {
      console.warn("Could not sync timetable to cloud:", err);
      setTimetable(updated);
    }
  };

  const handleUpdateExams = async (updated: Exam[]) => {
    if (!currentUser) return;
    const userUid = currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    try {
      await saveAllExams(userUid, updated, userUid);
      setExams(updated);
    } catch (err) {
      console.warn("Could not sync exams to cloud:", err);
      setExams(updated);
    }
  };

  const handleViewTask = (id: string) => {
    const el = document.getElementById(`deadline-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[#76d8fb]", "shadow-[0_0_24px_rgba(118,216,251,0.5)]");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-[#76d8fb]", "shadow-[0_0_24px_rgba(118,216,251,0.5)]");
      }, 2000);
    }
  };

  // Recommendations calculated via real-time smart priority heuristics
  const recommendations = useMemo(() => {
    return calculateSmartRecommendations(deadlines, exams, timetable);
  }, [deadlines, exams, timetable]);

  const topRecommendation = recommendations[0] || null;
  const upNextRecommendations = recommendations.slice(1, 3);

  // Consolidated chronological horizon items
  const radarItems = useMemo(() => {
    return buildAcademicRadar(deadlines, exams, timetable);
  }, [deadlines, exams, timetable]);

  // Next upcoming events for the "Coming Up" feed (upcoming today, tomorrow, or future)
  const upcomingEvents = useMemo(() => {
    return radarItems.filter((item) => item.daysRemaining >= 0).slice(0, 4);
  }, [radarItems]);

  // Specific "Today" timeline items: Next Class, Next Deadline, Next Exam
  const nextClass = useMemo(() => {
    return getNextUpcomingClass(timetable);
  }, [timetable]);

  const nextDeadline = useMemo(() => {
    const pending = deadlines.filter((d) => !d.completed);
    if (pending.length === 0) return null;
    const sorted = [...pending].sort((a, b) => {
      const dateDiff = a.dueDate.localeCompare(b.dueDate);
      if (dateDiff !== 0) return dateDiff;
      return (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59");
    });
    return sorted[0] || null;
  }, [deadlines]);

  const nextExam = useMemo(() => {
    return getNearestUpcomingExam(exams);
  }, [exams]);

  const nextCalendarEvent = useMemo(() => {
    return getNearestUpcomingEvent(events);
  }, [events]);

  const hasTodayItems = Boolean(nextClass || nextDeadline || nextExam || nextCalendarEvent);

  // User first name (safe access when unauthenticated before redirect)
  const firstName = currentUser?.name ? currentUser.name.split(" ")[0] : "Student";

  // Today string: YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Nearest upcoming exam calculation for indicators
  const nearestExam = nextExam;
  const nearestExamDays = nearestExam ? getDaysUntil(nearestExam.examDate) : null;

  // Sorted active and completed
  const { active, completed } = sortDeadlines(deadlines);
  const stats = calculateStats(deadlines);

  // Groupings for primary hierarchy:
  // - overdue items
  // - today's deadlines
  // - upcoming deadlines
  // - high-priority items
  const overdueDeadlines = useMemo(() => {
    return active.filter((d) => d.dueDate < todayStr);
  }, [active, todayStr]);

  const todayDeadlines = useMemo(() => {
    return active.filter((d) => d.dueDate === todayStr);
  }, [active, todayStr]);

  const upcomingDeadlines = useMemo(() => {
    return active.filter((d) => d.dueDate > todayStr);
  }, [active, todayStr]);

  const highPriorityDeadlines = useMemo(() => {
    return active.filter((d) => d.importance === "CRITICAL" || d.importance === "HIGH");
  }, [active]);

  // Filtered active deadlines based on stat card click
  const filteredActive = active.filter((item) => {
    if (activeFilter === "all" || activeFilter === "active") return true;
    if (activeFilter === "overdue") {
      return item.dueDate < todayStr;
    }
    if (activeFilter === "today") {
      return item.dueDate === todayStr;
    }
    if (activeFilter === "upcoming") {
      return item.dueDate > todayStr;
    }
    if (activeFilter === "dueSoon") {
      const days = getDaysUntil(item.dueDate);
      return days <= 2 && days >= 0;
    }
    if (activeFilter === "highPriority") {
      return item.importance === "CRITICAL" || item.importance === "HIGH";
    }
    return true;
  });

  const getPriorityAtmosphereClass = (importance: ImportanceLevel) => {
    switch (importance) {
      case "CRITICAL":
        return "border-l-4 border-l-rose-500";
      case "HIGH":
        return "border-l-4 border-l-purple-500";
      case "MEDIUM":
        return "border-l-4 border-l-blue-500";
      case "LOW":
        return "border-l-4 border-l-slate-300 dark:border-l-slate-600";
    }
  };

  const getImportanceBadge = (importance: ImportanceLevel, isCompleted: boolean) => {
    if (isCompleted) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tracking-wider border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 font-medium">
          Completed
        </span>
      );
    }

    switch (importance) {
      case "CRITICAL":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tracking-wider border border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
            Urgent
          </span>
        );
      case "HIGH":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tracking-wider border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
            Important
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tracking-wider border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            Upcoming
          </span>
        );
      case "LOW":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tracking-wider border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.04] font-medium">
            Low
          </span>
        );
    }
  };

  const getTierBadge = (tier: UrgencyTier) => {
    switch (tier) {
      case "URGENT":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-mono font-semibold tracking-wider border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 flex items-center gap-1.5">
            <Flame size={12} className="text-rose-600 dark:text-rose-400" />
            Urgent
          </span>
        );
      case "HIGH":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-mono font-semibold tracking-wider border border-purple-200 dark:border-purple-500/35 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/15 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
            High priority
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-mono font-medium tracking-wider border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            Medium
          </span>
        );
      case "LOW":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
            Low
          </span>
        );
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#05070d] text-[#f4f5f7] flex items-center justify-center relative overflow-hidden">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#76d8fb]/20 to-[#a895ff]/20 border border-white/[0.1] flex items-center justify-center shadow-[0_0_30px_rgba(118,216,251,0.2)]">
            <Sparkles size={20} className="text-[#76d8fb] animate-pulse" />
          </div>
          <div className="text-xs font-mono text-[#8b95a7] tracking-wider uppercase flex items-center gap-2">
            <span>Loading dashboard</span>
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-[#76d8fb] animate-ping" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden selection:bg-[#8bdcf7] selection:text-[#061018] transition-colors duration-200">
      
      {/* ================================================== */}
      {/* 1. ATMOSPHERIC LIQUID BACKGROUND (LIGHT/DARK ADAPTIVE) */}
      {/* ================================================== */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-15 dark:opacity-20 mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Cyan / Aqua Fluid Orb */}
        <div
          className="absolute -top-[15%] left-[8%] w-[680px] h-[680px] rounded-full blur-[110px] opacity-25 dark:opacity-25 liquid-bg-orb-1"
          style={{
            background: "radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(14, 165, 233, 0.08) 60%, transparent 75%)",
          }}
        />

        {/* Violet / Amethyst Fluid Orb */}
        <div
          className="absolute top-[35%] right-[-5%] w-[750px] h-[750px] rounded-full blur-[130px] opacity-20 dark:opacity-20 liquid-bg-orb-2"
          style={{
            background: "radial-gradient(circle, rgba(167, 139, 250, 0.25) 0%, rgba(124, 58, 237, 0.06) 65%, transparent 80%)",
          }}
        />

        {/* Warm Coral / Amber Accent Orb */}
        <div
          className="absolute bottom-[-10%] left-[25%] w-[700px] h-[700px] rounded-full blur-[120px] opacity-18 dark:opacity-18 liquid-bg-orb-3"
          style={{
            background: "radial-gradient(circle, rgba(251, 146, 60, 0.2) 0%, rgba(244, 63, 94, 0.06) 60%, transparent 75%)",
          }}
        />

        {/* Architectural subtle grid mesh */}
        <div
          className="absolute inset-0 opacity-[0.025] dark:opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(currentColor 1px, transparent 1px),
              linear-gradient(90deg, currentColor 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* ================================================== */}
      {/* 2. TOP NAVIGATION HEADER                            */}
      {/* ================================================== */}
      <header className="relative z-30 w-full border-b border-slate-200/80 dark:border-border bg-[#faf8f5]/95 dark:bg-surface/90 backdrop-blur-2xl shadow-xs dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-colors">
        <div className="max-w-[1376px] mx-auto px-4 sm:px-6 md:px-12 h-16 flex items-center justify-between">
          
          {/* DeadlineIQ Brand Logo */}
          <Link href="/dashboard" className="brand group flex-shrink-0" aria-label="DeadlineIQ dashboard">
            <span className="brand-mark relative" aria-hidden="true">
              <span className="absolute -inset-1 rounded-lg bg-blue-500/15 dark:bg-[#76d8fb]/20 blur-sm group-hover:bg-blue-500/25 dark:group-hover:bg-[#76d8fb]/35 transition-colors" />
              <svg viewBox="0 0 32 32" fill="none" className="relative z-10 text-blue-600 dark:text-[#b8ecf8]">
                <path d="M7 7.5h8.5a8.5 8.5 0 1 1 0 17H7v-17Z" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 12h4a4 4 0 1 1 0 8h-4v-8Z" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="24.5" cy="8" r="2.1" fill="#2563eb" className="dark:fill-[#86dcff]" />
              </svg>
            </span>
            <span className="brand-name text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
              Deadline<span className="text-blue-600 dark:text-[#86d8f2]">IQ</span>
            </span>
          </Link>

          {/* DESKTOP NAVIGATION (Uniform, consistent, strictly aligned) */}
          <div className="hidden md:flex items-center gap-2.5">
            {/* Calendar Link */}
            <Link
              href="/calendar"
              className="h-9 inline-flex items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer shadow-xs active:scale-95 btn-tactile flex-shrink-0"
              title="Open Academic Calendar"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <CalendarDays size={16} strokeWidth={1.8} className="text-[#7c3aed] dark:text-[#a895ff]" />
              </span>
              <span>Calendar</span>
              {events.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-purple-500/15 text-purple-700 dark:text-[#d8ceff] leading-none">
                  {events.length}
                </span>
              )}
            </Link>

            {/* My Timetable Button */}
            <button
              type="button"
              onClick={() => setIsTimetableModalOpen(true)}
              className="h-9 inline-flex items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer shadow-xs active:scale-95 btn-tactile flex-shrink-0"
              title="Open Weekly Timetable"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <Calendar size={16} strokeWidth={1.8} className="text-[#0284c7] dark:text-[#76d8fb]" />
              </span>
              <span>My Timetable</span>
            </button>

            {/* My Exams Button */}
            <button
              type="button"
              onClick={() => setIsExamsModalOpen(true)}
              className="h-9 inline-flex items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer shadow-xs active:scale-95 btn-tactile flex-shrink-0"
              title="Open Exam Schedule"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <GraduationCap size={16} strokeWidth={1.8} className="text-amber-600 dark:text-[#fbaf72]" />
              </span>
              <span>My Exams</span>
              {exams.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-amber-500/15 text-amber-700 dark:text-[#fed7aa] leading-none">
                  {exams.length}
                </span>
              )}
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton className="h-9" />

            {/* Theme Toggle */}
            <ThemeToggle className="h-9" />

            {/* Logged-in user profile capsule */}
            <Link
              href="/account"
              className="h-9 inline-flex items-center gap-2.5 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white/90 dark:bg-surface/90 hover:bg-slate-50 dark:hover:bg-surface-elevated hover:border-blue-300 dark:hover:border-[#76d8fb]/40 backdrop-blur-md shadow-xs text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer flex-shrink-0 active:scale-95 group"
              title="Open Account Profile & Settings"
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name || "User"}
                  className="w-4 h-4 rounded-full object-cover border border-blue-400 dark:border-[#76d8fb]/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] dark:bg-[#75d5b0] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981] dark:bg-[#75d5b0]" />
                </span>
              )}
              <span className="truncate max-w-[140px] lg:max-w-[200px]">
                <strong className="text-slate-900 dark:text-white font-medium group-hover:text-blue-600 dark:group-hover:text-[#76d8fb] transition-colors">
                  {currentUser.name || currentUser.email || currentUser.usn}
                </strong>
              </span>
            </Link>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-text-secondary hover:text-rose-600 dark:hover:text-[#fb7185] transition-all duration-200 px-3 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent hover:border-rose-200 dark:hover:border-rose-500/25 cursor-pointer active:scale-95 flex-shrink-0"
              title="Log out"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>

          {/* MOBILE TOP BAR (Clean, non-cramped profile button & dropdown) */}
          <div className="md:hidden relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="h-9 min-w-[36px] px-2.5 rounded-full border border-slate-200/90 dark:border-white/10 bg-white dark:bg-surface flex items-center gap-2 text-xs font-mono text-slate-800 dark:text-white shadow-xs cursor-pointer active:scale-95 transition-all"
              aria-label="Open user menu"
              aria-expanded={isMobileMenuOpen}
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name || "User"}
                  className="w-5 h-5 rounded-full object-cover border border-blue-400 dark:border-[#76d8fb]/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-[10px]">
                  {((currentUser.name || currentUser.email || "U")[0] || "U").toUpperCase()}
                </div>
              )}
              <span className="max-w-[70px] xs:max-w-[100px] sm:max-w-[130px] truncate font-medium">
                {firstName}
              </span>
              <ChevronDown
                size={12}
                className={`text-slate-400 transition-transform duration-200 ${isMobileMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Mobile Profile & Secondary Controls Dropdown */}
            {isMobileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-hidden="true"
                />

                <div
                  ref={mobileMenuRef}
                  className="absolute top-12 right-0 z-50 w-72 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-[#fcfbf9] dark:bg-[#0c101a] p-4 shadow-xl dark:shadow-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* User Profile Header */}
                  <Link
                    href="/account"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-white/[0.08] hover:opacity-80 transition-opacity cursor-pointer group"
                  >
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.name || "User"}
                        className="w-10 h-10 rounded-full object-cover border border-blue-400 dark:border-[#76d8fb]/40"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                        {(currentUser.name || currentUser.email || "U")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-[#76d8fb] transition-colors">
                        {currentUser.name || "Student"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                        {currentUser.email || currentUser.usn || "Active Session"}
                      </div>
                    </div>
                  </Link>

                  {/* Profile & Settings Navigation Link */}
                  <Link
                    href="/account"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/20 text-xs font-medium text-blue-700 dark:text-[#76d8fb] hover:bg-blue-50 dark:hover:bg-blue-500/20 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <User size={14} />
                      <span>Account &amp; Profile Settings</span>
                    </div>
                    <ChevronRight size={14} />
                  </Link>

                  {/* Mobile App Install Button */}
                  <div className="py-0.5">
                    <PWAInstallButton className="w-full justify-center py-2" />
                  </div>

                  {/* Theme Switching Row */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      Appearance
                    </span>
                    <ThemeToggle variant="segmented" />
                  </div>

                  {/* Quick Summary Pill */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">Deadlines Tracked</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {deadlines.length}
                    </span>
                  </div>

                  {/* Logout Button */}
                  <div className="pt-2 border-t border-slate-200/80 dark:border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-rose-200/80 dark:border-rose-500/30 transition-all cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-[1376px] w-full mx-auto px-4 sm:px-6 md:px-12 pt-6 pb-24 md:py-10 space-y-8">
        
        {/* ================================================== */}
        {/* 3. PERSONALIZED OVERVIEW HEADER                     */}
        {/* ================================================== */}
        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 pb-6 border-b border-slate-200/80 dark:border-white/[0.06]">
          <div>
            {/* User Greeting */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif] leading-tight">
              Hello, {firstName}.
            </h1>
            <p className="text-xs sm:text-base text-slate-600 dark:text-slate-400 mt-1 font-normal leading-relaxed">
              {overdueDeadlines.length > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  Attention required: You have {overdueDeadlines.length} overdue task{overdueDeadlines.length > 1 ? "s" : ""}.
                </span>
              ) : todayDeadlines.length > 0 ? (
                <span>
                  You have <strong className="text-slate-900 dark:text-white">{todayDeadlines.length} task{todayDeadlines.length > 1 ? "s" : ""}</strong> due today.
                </span>
              ) : (
                <span>Your upcoming work is on schedule.</span>
              )}
            </p>
          </div>

          {/* Quick Primary Actions (Reflows comfortably on mobile) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => handleOpenPlanMyDay("generate")}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer btn-tactile active:scale-95 flex-shrink-0"
              title="Generate your schedule for today"
            >
              <Calendar size={15} />
              <span>Plan My Day</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer btn-tactile active:scale-95"
                title="Import deadlines from notices or documents"
              >
                <FileText size={14} className="text-blue-600 dark:text-blue-400" />
                <span>AI Extract</span>
              </button>

              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer btn-tactile active:scale-95"
                title="Add a new deadline manually"
              >
                <Plus size={14} />
                <span>Add deadline</span>
              </button>
            </div>
          </div>
        </section>

        {/* ================================================== */}
        {/* 4. COMPACT & CLICKABLE STATISTICS BAR              */}
        {/* ================================================== */}
        <section aria-label="Workload Statistics">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            
            {/* ALL ACTIVE */}
            <div
              onClick={() => {
                setActiveFilter(activeFilter === "active" ? "all" : "active");
                document.getElementById("deadlines-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border transition-all cursor-pointer shadow-xs group ${
                activeFilter === "active"
                  ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                  : "border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20"
              }`}
              title="Click to view all active tasks"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Active
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              </div>
              <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-slate-900 dark:text-white mt-1 tracking-tight tabular-nums">
                {stats.activeCount}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                {stats.activeCount === 1 ? "1 task pending" : `${stats.activeCount} tasks pending`}
              </span>
            </div>

            {/* OVERDUE OR DUE TODAY */}
            {overdueDeadlines.length > 0 ? (
              <div
                onClick={() => {
                  setActiveFilter(activeFilter === "overdue" ? "all" : "overdue");
                  document.getElementById("deadlines-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border transition-all cursor-pointer shadow-xs group ${
                  activeFilter === "overdue"
                    ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/40 dark:bg-rose-950/20"
                    : "border-rose-200 dark:border-rose-500/30 hover:border-rose-300 dark:hover:border-rose-500/50"
                }`}
                title="Click to view overdue tasks"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
                    Overdue
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
                </div>
                <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-rose-600 dark:text-rose-400 mt-1 tracking-tight tabular-nums">
                  {overdueDeadlines.length}
                </div>
                <span className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5 block truncate font-medium">
                  Requires action
                </span>
              </div>
            ) : (
              <div
                onClick={() => {
                  setActiveFilter(activeFilter === "today" ? "all" : "today");
                  document.getElementById("deadlines-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border transition-all cursor-pointer shadow-xs group ${
                  activeFilter === "today"
                    ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                    : "border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20"
                }`}
                title="Click to view tasks due today"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Due today
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                </div>
                <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-slate-900 dark:text-white mt-1 tracking-tight tabular-nums">
                  {todayDeadlines.length}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                  Before midnight
                </span>
              </div>
            )}

            {/* DUE SOON */}
            <div
              onClick={() => {
                setActiveFilter(activeFilter === "dueSoon" ? "all" : "dueSoon");
                document.getElementById("deadlines-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border transition-all cursor-pointer shadow-xs group ${
                activeFilter === "dueSoon"
                  ? "border-amber-500 ring-1 ring-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
                  : "border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20"
              }`}
              title="Click to filter tasks due within 48 hours"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Due soon
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              </div>
              <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-amber-600 dark:text-amber-400 mt-1 tracking-tight tabular-nums">
                {stats.dueSoonCount}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                Next 48 hours
              </span>
            </div>

            {/* HIGH PRIORITY */}
            <div
              onClick={() => {
                setActiveFilter(activeFilter === "highPriority" ? "all" : "highPriority");
                document.getElementById("deadlines-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border transition-all cursor-pointer shadow-xs group ${
                activeFilter === "highPriority"
                  ? "border-purple-500 ring-1 ring-purple-500 bg-purple-50/40 dark:bg-purple-950/20"
                  : "border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20"
              }`}
              title="Click to filter critical & high priority tasks"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  High priority
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
              </div>
              <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-purple-700 dark:text-purple-300 mt-1 tracking-tight tabular-nums">
                {stats.highPriorityCount}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                Critical or high
              </span>
            </div>

            {/* UPCOMING EXAMS */}
            <div
              onClick={() => setIsExamsModalOpen(true)}
              className="rounded-xl p-3.5 sm:p-4 bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer shadow-xs group col-span-2 lg:col-span-1"
              title="Click to view exam schedule"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <GraduationCap size={14} className="text-slate-500 dark:text-slate-400" />
                  <span>Exams</span>
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              </div>
              <div className="flex items-baseline justify-between mt-1 gap-2">
                <div className="text-2xl font-semibold font-['Space_Grotesk',sans-serif] text-slate-900 dark:text-white tracking-tight tabular-nums">
                  {exams.length}
                </div>
                {nearestExam && (
                  <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 truncate max-w-[140px] lg:max-w-[85px] bg-slate-100 dark:bg-white/[0.05] px-2 py-0.5 rounded font-medium">
                    {nearestExamDays === 0
                      ? "Today"
                      : nearestExamDays === 1
                      ? "Tomorrow"
                      : nearestExamDays !== null && nearestExamDays <= 7
                      ? `In ${nearestExamDays}d`
                      : nearestExam.subject}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                {exams.length === 1 ? "1 exam scheduled" : `${exams.length} scheduled`}
              </span>
            </div>

          </div>

          {/* Active Filter Pill when filter is active */}
          {activeFilter !== "all" && (
            <div className="flex items-center gap-2 mt-3 px-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Filtering:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-medium">
                <span>
                  {activeFilter === "active" && "All active tasks"}
                  {activeFilter === "overdue" && "Overdue tasks"}
                  {activeFilter === "today" && "Due today"}
                  {activeFilter === "upcoming" && "Upcoming tasks"}
                  {activeFilter === "dueSoon" && "Due within 48 hours"}
                  {activeFilter === "highPriority" && "High & critical priority"}
                </span>
                <button
                  onClick={() => setActiveFilter("all")}
                  className="hover:text-rose-500 transition-colors cursor-pointer ml-0.5"
                  title="Clear filter"
                >
                  <X size={12} />
                </button>
              </span>
              <button
                onClick={() => setActiveFilter("all")}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-1"
              >
                Reset to all
              </button>
            </div>
          )}
        </section>

        {/* ================================================== */}
        {/* TODAY'S PLAN CARD ("WHAT TO DO NOW")              */}
        {/* ================================================== */}
        <section className="relative z-10" aria-label="Today's Plan">
          <div className="rounded-2xl p-5 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111726] shadow-xs flex flex-col gap-4 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400">
                  <Clock size={19} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                    Today's Plan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {todayPlan ? `Saved schedule for ${todayPlan.date}` : "No active schedule generated for today"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {todayPlan && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-mono tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                    Saved
                  </span>
                )}
                {todayPlan && (
                  <button
                    type="button"
                    onClick={() => setIsClearPlansConfirmOpen(true)}
                    className="min-h-[38px] px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 transition-colors flex items-center gap-1.5 cursor-pointer btn-tactile"
                    title="Clear all saved daily plans"
                  >
                    <Trash2 size={14} />
                    <span>Clear All Plans</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenPlanMyDay(todayPlan ? "view" : "generate")}
                  className="min-h-[38px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer btn-tactile"
                >
                  <Sparkles size={14} />
                  <span>{todayPlan ? "View / Edit Plan" : "Plan My Day"}</span>
                </button>
              </div>
            </div>

            {planClearedSuccess && (
              <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
                <Check size={14} />
                <span>All saved Plan My Day schedules have been cleared.</span>
              </div>
            )}

            {/* CARD CONTENT STATE */}
            {(() => {
              const planState = evaluateActivePlanState(todayPlan?.blocks || []);

              if (!todayPlan || !todayPlan.blocks || todayPlan.blocks.length === 0) {
                return (
                  <div className="py-4 text-center flex flex-col items-center justify-center">
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2">
                      No plan for today yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenPlanMyDay("generate")}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={14} />
                      <span>Plan My Day</span>
                    </button>
                  </div>
                );
              }

              if (planState.status === "COMPLETED") {
                return (
                  <div className="py-4 px-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Check size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          PLAN COMPLETE
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          You finished today's planned blocks.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPlanMyDay("generate")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer"
                      >
                        Plan Next 9 Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPlanMyDay("view")}
                        className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5 cursor-pointer" onClick={() => handleOpenPlanMyDay("view")}>
                  {/* NOW BLOCK */}
                  {planState.activeBlock && (
                    <div className="p-3 sm:p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold bg-blue-600 text-white uppercase animate-pulse">
                          NOW
                        </span>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {planState.activeBlock.activity}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>{planState.activeBlock.startTime} – {planState.activeBlock.endTime}</span>
                            {planState.activeBlock.subject && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 font-medium">
                                {planState.activeBlock.subject}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {planState.remainingTimeStr && (
                        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-blue-600/15 text-blue-700 dark:text-blue-300 flex-shrink-0">
                          {planState.remainingTimeStr}
                        </span>
                      )}
                    </div>
                  )}

                  {/* NEXT BLOCK */}
                  {planState.nextBlock && (
                    <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                          {planState.activeBlock ? "NEXT" : "NEXT UP"}
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                            {planState.nextBlock.activity}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>{planState.nextBlock.startTime} – {planState.nextBlock.endTime}</span>
                            {planState.nextBlock.subject && (
                              <span>· {planState.nextBlock.subject}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* UP NEXT BLOCKS */}
                  {planState.upNextBlocks.length > 0 && (
                    <div className="pt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Up next: {planState.upNextBlocks.map((b) => b.activity).join(" · ")}
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                        View Full Plan ({todayPlan.blocks.length} blocks) →
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </section>

        {/* ================================================== */}
        {/* 5. TODAY'S OVERVIEW STRIP                          */}
        {/*    (Only shows real existing items, omits empty)   */}
        {/* ================================================== */}
        {hasTodayItems && (
          <section className="relative z-10" aria-label="Today's Overview">
            <div className="rounded-2xl p-4 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111726] shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Today's overview
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Classes & scheduled events
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                
                {/* NEXT CLASS (if exists) */}
                {nextClass ? (
                  <div
                    onClick={() => setIsTimetableModalOpen(true)}
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <BookOpen size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          Next class
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {nextClass.isToday ? "Today" : nextClass.isTomorrow ? "Tomorrow" : nextClass.dayOfWeek}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {nextClass.entry.subject}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <Clock size={11} className="text-slate-400" />
                        <span>{formatTime12Hour(nextClass.timeStr)}</span>
                        {nextClass.entry.room && (
                          <>
                            <span>·</span>
                            <span className="truncate">{nextClass.entry.room}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* NEXT CALENDAR EVENT (if exists) */}
                {nextCalendarEvent ? (
                  <Link
                    href="/calendar"
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-100/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CalendarDays size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-violet-700 dark:text-violet-400">
                          Next event
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatShortDueDate(nextCalendarEvent.date)}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
                        {nextCalendarEvent.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{nextCalendarEvent.category}</span>
                        {nextCalendarEvent.startTime && (
                          <>
                            <span>·</span>
                            <span>{formatTime12Hour(nextCalendarEvent.startTime)}</span>
                          </>
                        )}
                        {nextCalendarEvent.location && (
                          <>
                            <span>·</span>
                            <span className="truncate">{nextCalendarEvent.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </Link>
                ) : null}

                {/* NEXT DEADLINE (if exists) */}
                {nextDeadline ? (
                  <div
                    onClick={() => handleViewTask(nextDeadline.id)}
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
                          Next deadline
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatShortDueDate(nextDeadline.dueDate)}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {nextDeadline.taskName}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="truncate font-medium">{nextDeadline.subject}</span>
                        {nextDeadline.dueTime && (
                          <>
                            <span>·</span>
                            <span>{nextDeadline.dueTime}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* NEXT EXAM (if exists) */}
                {nextExam ? (
                  <div
                    onClick={() => setIsExamsModalOpen(true)}
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <GraduationCap size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          Next exam
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {nearestExamDays === 0
                            ? "Today"
                            : nearestExamDays === 1
                            ? "Tomorrow"
                            : `In ${nearestExamDays}d`}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                        {nextExam.subject}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{nextExam.examType} Exam</span>
                        <span>·</span>
                        <span>{formatExamDateDisplay(nextExam.examDate).monthShort} {formatExamDateDisplay(nextExam.examDate).dayNum}</span>
                      </p>
                    </div>
                  </div>
                ) : null}

              </div>
            </div>
          </section>
        )}

        {/* ================================================== */}
        {/* 6. PRIORITY FOCUS & UPCOMING SCHEDULE               */}
        {/* ================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch" aria-label="Priority and Horizon">
          
          {/* -------------------------------------------------- */}
          {/* PRIORITY FOCUS CARD (7 COLS ON DESKTOP)            */}
          {/* -------------------------------------------------- */}
          <div className="lg:col-span-7 rounded-2xl p-5 sm:p-6 flex flex-col justify-between border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111726] shadow-xs">
            {topRecommendation ? (
              <>
                <div>
                  {/* Top Status Bar */}
                  <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200/70 dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Priority focus
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getTierBadge(topRecommendation.urgencyTier)}
                    </div>
                  </div>

                  {/* Task Name & Subject */}
                  <div className="mb-4">
                    <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight font-['Space_Grotesk',sans-serif] leading-tight">
                      {topRecommendation.deadline.taskName}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 font-medium text-slate-800 dark:text-slate-200">
                        {topRecommendation.deadline.subject}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Clock size={12} className="text-slate-400" />
                        <span>{formatDueDateTime(topRecommendation.deadline.dueDate, topRecommendation.deadline.dueTime)}</span>
                      </span>
                    </div>

                    {topRecommendation.deadline.description && (
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">
                        {topRecommendation.deadline.description}
                      </p>
                    )}
                  </div>

                  {/* Reason Why Prioritized */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141b2d] border border-slate-200/80 dark:border-white/[0.06] mb-4">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Why this is prioritized:
                    </span>
                    <ul className="space-y-1">
                      {topRecommendation.reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Focus Actions */}
                <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFocusModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-all flex items-center gap-2 cursor-pointer btn-tactile"
                  >
                    <Clock size={14} />
                    <span>Start focus</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleViewTask(topRecommendation.deadline.id)}
                    className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer btn-tactile"
                  >
                    <span>View task</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </>
            ) : (
              /* All Caught Up State */
              <div className="py-8 text-center flex flex-col items-center justify-center h-full">
                <div className="w-10 h-10 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                  <CheckCircle2 size={22} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                  You are all caught up
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                  No active deadlines currently need attention.
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsAiModalOpen(true)}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>Extract notice</span>
                  </button>
                  <button
                    onClick={() => setIsManualModalOpen(true)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add task</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* -------------------------------------------------- */}
          {/* UPCOMING SCHEDULE (5 COLS ON DESKTOP)              */}
          {/* -------------------------------------------------- */}
          <div className="lg:col-span-5 rounded-2xl p-5 sm:p-6 flex flex-col justify-between border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111726] shadow-xs">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 dark:border-white/[0.06] mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Upcoming schedule
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Chronological feed
                </span>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  No upcoming deadlines, exams, or classes scheduled.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingEvents.map((item) => {
                    const isExam = item.type === "exam";
                    const isDeadline = item.type === "deadline";
                    const isClass = item.type === "class";

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isExam) setIsExamsModalOpen(true);
                          else if (isClass) setIsTimetableModalOpen(true);
                          else if (isDeadline) {
                            const originalId = item.id.replace("radar-dl-", "");
                            handleViewTask(originalId);
                          }
                        }}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-all cursor-pointer group shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {/* Clean Type Tag */}
                              {isExam && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300 flex items-center gap-1">
                                  <GraduationCap size={11} />
                                  Exam {item.examType ? `· ${item.examType}` : ""}
                                </span>
                              )}
                              {isDeadline && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-500/15 dark:border-blue-500/30 dark:text-blue-300 flex items-center gap-1">
                                  <Clock size={11} />
                                  Deadline
                                </span>
                              )}
                              {isClass && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300 flex items-center gap-1">
                                  <BookOpen size={11} />
                                  Class
                                </span>
                              )}

                              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium truncate">
                                {item.subject}
                              </span>
                            </div>

                            <h4 className="text-sm font-medium text-slate-900 dark:text-white tracking-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.title}
                            </h4>

                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {item.daysRemaining === 0
                                  ? "Today"
                                  : item.daysRemaining === 1
                                  ? "Tomorrow"
                                  : `In ${item.daysRemaining} days`}
                              </span>
                              {item.time && (
                                <>
                                  <span>·</span>
                                  <span>{formatTime12Hour(item.time)}</span>
                                </>
                              )}
                              {item.room && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{item.room}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <ChevronRight
                            size={14}
                            className="text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200 group-hover:translate-x-0.5 transition-all mt-2 flex-shrink-0"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 mt-4 border-t border-slate-200/70 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Chronological horizon</span>
              <button
                onClick={() => {
                  document.getElementById("academic-radar-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 font-medium"
              >
                <span>View timeline</span>
                <ChevronRight size={12} />
              </button>
            </div>
          </div>

        </section>

        {/* ================================================== */}
        {/* 7. VISUALLY INTEGRATED ACADEMIC RADAR SECTION       */}
        {/* ================================================== */}
        <section id="academic-radar-section" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                Timeline Overview
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-mono rounded-full border border-slate-200 dark:border-white/[0.09] bg-slate-100 dark:bg-white/[0.03] text-slate-700 dark:text-[#a0aab8] font-medium">
                {radarItems.length} items
              </span>
            </div>

            <button
              onClick={() => setIsRadarExpanded(!isRadarExpanded)}
              className="text-xs font-mono text-slate-600 dark:text-[#8ca0b8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>{isRadarExpanded ? "Collapse" : "Expand"}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isRadarExpanded ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {isRadarExpanded && (
            <AcademicRadar
              deadlines={deadlines}
              exams={exams}
              timetable={timetable}
              onToggleDeadline={handleToggleComplete}
              onOpenExamsModal={() => setIsExamsModalOpen(true)}
              onOpenTimetableModal={() => setIsTimetableModalOpen(true)}
            />
          )}
        </section>

        {/* ================================================== */}
        {/* 8. DEADLINES LIST & CHECKBOX MANAGEMENT            */}
        {/* ================================================== */}
        <section id="deadlines-section" className="space-y-6 pt-4 border-t border-slate-200/80 dark:border-white/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                Your deadlines
              </h2>
              <span className="px-3 py-1 text-xs font-mono rounded-full border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] text-slate-700 dark:text-[#a0aab8] font-medium shadow-xs backdrop-blur-md">
                {activeFilter !== "all" ? `${filteredActive.length} of ${deadlines.length}` : `${deadlines.length} total`}
              </span>
            </div>

            {/* Quick Actions in Section Header */}
            <div className="flex items-center gap-3">
              <div className="text-xs font-mono text-slate-500 dark:text-[#667487] hidden md:block">
                AUTOSORTED · DUE DATE & PRIORITY
              </div>
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-blue-700 dark:text-[#76d8fb] hover:bg-blue-50 dark:hover:bg-[#76d8fb]/10 border border-blue-200/80 dark:border-[#76d8fb]/30 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs btn-tactile"
              >
                <Plus size={13} />
                <span>Add deadline</span>
              </button>
            </div>
          </div>

          {/* EMPTY STATE */}
          {deadlines.length === 0 ? (
            <div className="rounded-2xl p-10 sm:p-14 text-center max-w-xl mx-auto shadow-xs border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#111726]">
              <div className="w-12 h-12 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                No deadlines yet
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                Add a deadline manually or extract dates from a course notice or syllabus.
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 transition-all flex items-center gap-2 cursor-pointer shadow-xs btn-tactile"
                >
                  <FileText size={14} className="text-blue-600 dark:text-blue-400" />
                  <span>Extract from notice</span>
                </button>
                <button
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-all flex items-center gap-2 cursor-pointer shadow-xs btn-tactile"
                >
                  <Plus size={14} />
                  <span>Add deadline</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* ACTIVE DEADLINES GROUP */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-[#8b97a8] mb-3.5 px-1.5 font-medium">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-[#76d8fb] shadow-xs dark:shadow-[0_0_8px_rgba(118,216,251,0.8)]" />
                    <span>ACTIVE TASKS ({filteredActive.length})</span>
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-[#5e6a7c]">CLICK CIRCLE TO COMPLETE</span>
                </div>

                {filteredActive.length === 0 ? (
                  <div className="liquid-glass-card rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-[#768395] font-mono border border-slate-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#090d16]/70">
                    {activeFilter !== "all"
                      ? "No tasks match the active filter. Reset filter above to view all tasks."
                      : "All current active deadlines are completed. Great momentum!"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredActive.map((item) => {
                      const glowClass = getPriorityAtmosphereClass(item.importance);

                      return (
                        <div
                          key={item.id}
                          id={`deadline-${item.id}`}
                          className={`liquid-glass-card ${glowClass} rounded-2xl p-3.5 sm:p-5 flex items-start sm:items-center gap-3 sm:gap-4 group transition-all duration-300 scroll-mt-24`}
                        >
                          {/* Liquid Checkbox Circle with Satisfying Interaction */}
                          <button
                            type="button"
                            onClick={() => handleToggleComplete(item.id)}
                            className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-blue-600 bg-white hover:bg-blue-50/50 shadow-xs dark:border-white/20 dark:hover:border-[#76d8fb] dark:bg-white/[0.03] dark:hover:bg-[#76d8fb]/15 hover:shadow-xs dark:hover:shadow-[0_0_14px_rgba(118,216,251,0.4)] flex items-center justify-center transition-all duration-200 cursor-pointer flex-shrink-0 group/chk focus:outline-none mt-0.5 sm:mt-0"
                            aria-label={`Mark "${item.taskName}" as complete`}
                          >
                            <span className="w-2 h-2 rounded-full bg-transparent group-hover/chk:bg-blue-600 dark:group-hover/chk:bg-[#76d8fb]/60 transition-colors" />
                          </button>

                          {/* Task details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base sm:text-lg font-medium text-slate-900 dark:text-white/95 tracking-tight group-hover:text-blue-600 dark:group-hover:text-white transition-colors">
                                {item.taskName}
                              </h4>
                              {item.source === "ai" && (
                                <span className="text-[9px] font-mono tracking-wider text-violet-700 bg-violet-50 border border-violet-200 dark:text-[#c7baff] dark:bg-[#a895ff]/15 dark:border-[#a895ff]/30 px-2 py-0.5 rounded-full font-medium">
                                  AI EXTRACTED
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs text-slate-600 dark:text-[#8c97a8]">
                              {/* Subject tag */}
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-[#cbd5e1] font-mono text-[11px] font-medium">
                                {item.subject}
                              </span>

                              <span className="text-slate-300 dark:text-[#3a4454]">•</span>

                              {/* Due Date & Time */}
                              <span className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-[#dce4ec]">
                                <Clock size={13} className="text-blue-600 dark:text-[#76d8fb]" />
                                <span>{formatDueDateTime(item.dueDate, item.dueTime)}</span>
                              </span>

                              {/* Description snippet */}
                              {item.description && (
                                <>
                                  <span className="text-slate-300 dark:text-[#3a4454]">•</span>
                                  <span className="truncate max-w-[280px] sm:max-w-[340px] text-slate-500 dark:text-[#788597]">
                                    {item.description}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Importance badge & delete button */}
                          <div className="flex items-center gap-2 sm:gap-3.5 flex-shrink-0">
                            {getImportanceBadge(item.importance, false)}

                            <button
                              type="button"
                              onClick={() => handleDeleteDeadline(item.id)}
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#525f72] dark:hover:text-[#fb7185] dark:hover:bg-rose-500/10 p-1.5 rounded-lg transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              title="Delete deadline"
                              aria-label="Delete deadline"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* COMPLETED DEADLINES GROUP */}
              {completed.length > 0 && (
                <div id="completed-tasks-group" className="pt-6 border-t border-slate-200/80 dark:border-white/[0.06] scroll-mt-24">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#667487] mb-3.5 px-1.5">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 dark:text-[#75d5b0]" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">COMPLETED ({completed.length})</span>
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-[#556172]">CLICK CHECKMARK TO RESTORE</span>
                  </div>

                  <div className="space-y-2.5 opacity-80 hover:opacity-100 transition-opacity duration-200">
                    {completed.map((item) => (
                      <div
                        key={item.id}
                        className="liquid-glass-card rounded-2xl p-3.5 sm:p-4.5 flex items-center gap-3 sm:gap-4 bg-slate-50/80 border border-slate-200/80 dark:bg-white/[0.02] dark:border-white/[0.06]"
                      >
                        {/* Checked Checkbox with Emerald Fill */}
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(item.id)}
                          className="w-6 h-6 rounded-full border border-emerald-500 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white dark:border-[#75d5b0] dark:bg-gradient-to-br dark:from-[#75d5b0] dark:to-[#38a17d] dark:text-[#061a12] flex items-center justify-center transition-all cursor-pointer flex-shrink-0 shadow-xs dark:shadow-[0_0_12px_rgba(117,213,176,0.4)]"
                          aria-label={`Mark "${item.taskName}" as incomplete`}
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>

                        {/* Task details (faded + clean strikethrough) */}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-base font-normal text-slate-500 dark:text-[#808b9c] line-through">
                            {item.taskName}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-2.5 mt-1 text-[11px] text-slate-400 dark:text-[#5c6879] font-mono">
                            <span>{item.subject}</span>
                            <span>•</span>
                            <span>{formatDueDateTime(item.dueDate, item.dueTime)}</span>
                          </div>
                        </div>

                        {/* Badge & delete */}
                        <div className="flex items-center gap-2 sm:gap-3.5 flex-shrink-0">
                          {getImportanceBadge(item.importance, true)}

                          <button
                            type="button"
                            onClick={() => handleDeleteDeadline(item.id)}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#475262] dark:hover:text-[#fb7185] dark:hover:bg-rose-500/10 p-1.5 rounded-lg transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Delete deadline"
                            aria-label="Delete deadline"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </section>
      </main>

      {/* ================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR                       */}
      {/* ================================================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#faf8f5]/95 dark:bg-[#0c101a]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_25px_rgba(0,0,0,0.4)] pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 px-3 transition-colors"
      >
        <div className="grid grid-cols-4 items-center gap-1 max-w-md mx-auto">
          {/* 1. Home / Dashboard */}
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-blue-600 dark:text-[#76d8fb] transition-all cursor-pointer active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <LayoutDashboard size={18} strokeWidth={2} />
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Home</span>
          </button>

          {/* 2. My Timetable */}
          <button
            type="button"
            onClick={() => setIsTimetableModalOpen(true)}
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <Calendar size={18} strokeWidth={1.8} className="text-[#0284c7] dark:text-[#76d8fb]" />
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Timetable</span>
          </button>

          {/* 3. My Exams */}
          <button
            type="button"
            onClick={() => setIsExamsModalOpen(true)}
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group relative"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 relative" aria-hidden="true">
              <GraduationCap size={18} strokeWidth={1.8} className="text-amber-600 dark:text-[#fbaf72]" />
              {exams.length > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[8px] font-mono font-bold bg-amber-500 text-white leading-none">
                  {exams.length}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Exams</span>
          </button>

          {/* 4. Calendar */}
          <Link
            href="/calendar"
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group relative"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 relative" aria-hidden="true">
              <CalendarDays size={18} strokeWidth={1.8} className="text-[#7c3aed] dark:text-[#a895ff]" />
              {events.length > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[8px] font-mono font-bold bg-purple-500 text-white leading-none">
                  {events.length}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Calendar</span>
          </Link>
        </div>
      </nav>

      {/* MODALS */}
      <ManualEntryModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onAddDeadline={handleAddDeadline}
        timetable={timetable}
        calendarEvents={events}
      />

      <AiExtractModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        timetable={timetable}
        existingDeadlines={deadlines}
        onAddDeadline={handleAddDeadline}
        onOpenManualModal={() => setIsManualModalOpen(true)}
      />

      <TimetableModal
        isOpen={isTimetableModalOpen}
        onClose={() => setIsTimetableModalOpen(false)}
        timetable={timetable}
        onUpdateTimetable={handleUpdateTimetable}
      />

      <ExamsModal
        isOpen={isExamsModalOpen}
        onClose={() => setIsExamsModalOpen(false)}
        exams={exams}
        onUpdateExams={handleUpdateExams}
        timetable={timetable}
      />

      {/* Focus Mode Distraction-Free Modal */}
      <FocusModal
        isOpen={isFocusModalOpen}
        onClose={() => setIsFocusModalOpen(false)}
        recommendation={topRecommendation}
        upNextRecommendations={upNextRecommendations}
        onCompleteTask={handleToggleComplete}
      />

      {/* Plan My Day Intelligent Schedule Modal */}
      <PlanMyDayModal
        isOpen={isPlanMyDayModalOpen}
        clickDate={planMyDayClickTime}
        initialMode={planModalMode}
        onClose={() => setIsPlanMyDayModalOpen(false)}
        uid={currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest")}
        deadlines={deadlines}
        timetable={timetable}
        exams={exams}
        events={events}
        onCompleteDeadline={handleToggleComplete}
        onViewTask={handleViewTask}
        onOpenAddDeadline={() => setIsManualModalOpen(true)}
        onOpenTimetable={() => setIsTimetableModalOpen(true)}
        onPlanCleared={() => setTodayPlan(null)}
      />

      {/* Confirmation Dialog: Clear All Plans */}
      <AnimatePresence>
        {isClearPlansConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#0c101a] border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 flex-shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                    Clear All Saved Plans?
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    All saved Plan My Day schedules belonging to your account will be permanently removed from Cloud Firestore. Your deadlines, weekly timetable, exams, calendar events, and academic profile will remain completely untouched.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  disabled={isClearingPlans}
                  onClick={() => setIsClearPlansConfirmOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isClearingPlans}
                  onClick={handleConfirmClearAllPlans}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isClearingPlans ? (
                    <>
                      <RotateCcw size={14} className="animate-spin" />
                      <span>Clearing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Clear All Plans</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
