import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  GraduationCap,
  Building2,
  BookOpen,
  Shield,
  ShieldCheck,
  Trash2,
  Camera,
  Upload,
  CheckCircle2,
  Calendar,
  CalendarDays,
  Bell,
  Moon,
  Sun,
  Flame,
  Sparkles,
  Clock,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Lock,
  RefreshCw,
  LogOut,
  ExternalLink,
  ChevronRight,
  Check,
  X,
  Sliders,
  CheckCheck,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getUserProfile, saveUserProfile, deleteUserProfileData } from "@/lib/services/userService";
import { subscribeToDeadlines, subscribeToExams, subscribeToTimetable } from "@/lib/services";
import type { UserProfileDocument } from "@/lib/firebase/types";
import type { Deadline } from "@/lib/deadlines";
import type { Exam } from "@/lib/exams";
import type { TimetableEntry } from "@/lib/timetable";
import {
  isGoogleCalendarConfigured,
  getGoogleCalendarMeta,
  disconnectGoogleCalendar,
  requestGoogleCalendarAccess,
} from "@/lib/googleCalendar";
import {
  getGmailMeta,
  syncGmailTasks,
  disconnectGmail,
  type GmailMeta,
} from "@/lib/gmail";
import {
  getNotificationPermission,
  sendTestNotification,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from "@/lib/notifications";
import ThemeToggle from "@/components/ThemeToggle";
import GmailReviewSettingsSection from "@/components/GmailReviewSettingsSection";
import GoogleSetupCheckCard from "@/components/GoogleSetupCheckCard";

export default function AccountPage() {
  const [, setLocation] = useLocation();
  const { user: authUser, isLoading: isAuthLoading, logout, deleteAccount, updateUserContext } = useAuth();
  const { theme, setTheme, isDark } = useTheme();

  const userUid = authUser?.uid || (authUser?.usn ? `usn_${authUser.usn}` : "");

  // Profile Form States
  const [profile, setProfile] = useState<UserProfileDocument | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [usn, setUsn] = useState("");
  const [degree, setDegree] = useState("");
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState("");
  const [college, setCollege] = useState("");
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  // Preferences & Notifications
  const [dailyPlanReminder, setDailyPlanReminder] = useState(true);
  const [deadlineAlerts, setDeadlineAlerts] = useState(true);
  const [examAlerts, setExamAlerts] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus>(() =>
    getNotificationPermission()
  );
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [testNotificationResult, setTestNotificationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setNotificationPermission(getNotificationPermission());
  }, []);

  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    setTestNotificationResult(null);
    try {
      const res = await sendTestNotification();
      setTestNotificationResult(res);
      setNotificationPermission(getNotificationPermission());
    } catch (err: any) {
      setTestNotificationResult({
        success: false,
        message: err?.message || "Failed to trigger test notification.",
      });
    } finally {
      setIsTestingNotification(false);
    }
  };

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Academic stats
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);

  // Modals & Sheets
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Google Calendar Meta
  const isGoogleConfigured = isGoogleCalendarConfigured();
  const [googleMeta, setGoogleMeta] = useState(() => getGoogleCalendarMeta(userUid));

  // Gmail Integration Meta
  const [gmailMeta, setGmailMeta] = useState(() => getGmailMeta(userUid));
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [gmailStatusMessage, setGmailStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication check
  useEffect(() => {
    if (isAuthLoading) return;
    if (!authUser) {
      setLocation("/login");
    }
  }, [authUser, isAuthLoading, setLocation]);

  // Load user profile and data subscriptions
  useEffect(() => {
    if (!userUid) return;

    let isMounted = true;
    // Load user profile strictly for authenticated UID
    getUserProfile(userUid).then((data) => {
      if (!isMounted) return;
      if (data) {
        setProfile(data);
        setDisplayName(data.displayName || authUser?.name || "");
        setUsn(data.usn || "");
        setDegree(data.degree || "");
        setBranch(data.branch || "");
        setSemester(data.semester || "");
        setCollege(data.college || "");
        setPhotoURL(data.photoURL || authUser?.photoURL || null);
        if (data.preferences) {
          setDailyPlanReminder(data.preferences.dailyPlanReminder ?? true);
          setDeadlineAlerts(data.preferences.deadlineAlerts ?? true);
          setExamAlerts(data.preferences.examAlerts ?? true);
        }
      } else {
        setProfile(null);
        setDisplayName(authUser?.name || "");
        setUsn("");
        setDegree("");
        setBranch("");
        setSemester("");
        setCollege("");
        setPhotoURL(authUser?.photoURL || null);
      }
    });

    const unsubDeadlines = subscribeToDeadlines(userUid, (items) => {
      setDeadlines(items);
    }, userUid);

    const unsubExams = subscribeToExams(userUid, (items) => {
      setExams(items);
    }, userUid);

    const unsubTimetable = subscribeToTimetable(userUid, (items) => {
      setTimetable(items);
    }, userUid);

    return () => {
      isMounted = false;
      unsubDeadlines();
      unsubExams();
      unsubTimetable();
    };
  }, [userUid, authUser]);

  // Productivity metrics calculations
  const totalTasks = deadlines.length;
  const completedTasks = useMemo(() => deadlines.filter((d) => d.completed).length, [deadlines]);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
  
  // Calculate study streak (based on completed tasks and activity)
  const streakDays = useMemo(() => {
    if (completedTasks === 0) return 1;
    return Math.min(30, Math.max(1, Math.floor(completedTasks / 2) + 2));
  }, [completedTasks]);

  // Handle Profile Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Image size must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPhotoURL(base64);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoURL(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Save Profile Handler
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userUid) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updatedData: Partial<UserProfileDocument> = {
        displayName: displayName.trim() || "Student",
        usn: usn.trim().toUpperCase(),
        degree: degree.trim(),
        branch: branch.trim(),
        semester: semester.trim(),
        college: college.trim(),
        photoURL: photoURL,
        preferences: {
          theme: theme as any,
          dailyPlanReminder,
          deadlineAlerts,
          examAlerts,
        },
      };

      await saveUserProfile(userUid, updatedData);

      // Update auth context state
      updateUserContext({
        name: displayName.trim() || "Student",
        usn: usn.trim().toUpperCase(),
        photoURL: photoURL,
      });

      setProfile((prev) => ({
        ...(prev || {
          uid: userUid,
          email: authUser?.email || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        ...updatedData,
        displayName: displayName.trim() || "Student",
        usn: usn.trim().toUpperCase(),
      } as UserProfileDocument));

      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.warn("Save profile failed:", err);
      setErrorMessage("Failed to save profile changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Google Calendar & Gmail Unified Connect / Disconnect
  const handleToggleGoogleCalendar = async () => {
    if (!userUid) return;
    if (googleMeta.isConnected) {
      await disconnectGoogleCalendar(userUid);
      setGoogleMeta(getGoogleCalendarMeta(userUid));
    } else {
      try {
        const { requestUnifiedGoogleAccess } = await import("@/lib/googleAuth");
        await requestUnifiedGoogleAccess(userUid, "calendar");
        setGoogleMeta(getGoogleCalendarMeta(userUid));
        setGmailMeta(getGmailMeta(userUid));
      } catch (e: any) {
        console.warn("Google Calendar connection failed:", e);
        setErrorMessage(e?.message || "Failed to connect Google Calendar. Please try again.");
      }
    }
  };

  // Gmail Integration Connect / Sync / Disconnect
  const handleToggleGmail = async () => {
    if (!userUid) return;
    if (gmailMeta.isConnected) {
      await disconnectGmail(userUid);
      setGmailMeta(getGmailMeta(userUid));
      setGmailStatusMessage("Gmail disconnected.");
      setTimeout(() => setGmailStatusMessage(null), 3000);
    } else {
      setIsSyncingGmail(true);
      setGmailStatusMessage(null);
      try {
        const { requestUnifiedGoogleAccess } = await import("@/lib/googleAuth");
        const res = await requestUnifiedGoogleAccess(userUid, "gmail");
        setGoogleMeta(getGoogleCalendarMeta(userUid));
        setGmailMeta(getGmailMeta(userUid));
        setGmailStatusMessage(
          `Connected to ${res.connectedEmail || "Google Account"}! Gmail and Google Calendar are now synchronized.`
        );
      } catch (err: any) {
        console.warn("Gmail connection failed:", err);
        setErrorMessage(err?.message || "Failed to connect Gmail. Please try again.");
      } finally {
        setIsSyncingGmail(false);
      }
    }
  };

  const handleSyncGmail = async () => {
    if (!userUid) return;
    setIsSyncingGmail(true);
    setGmailStatusMessage(null);
    try {
      const result = await syncGmailTasks(userUid, false);
      setGmailMeta(getGmailMeta(userUid));
      setGmailStatusMessage(
        result.count > 0
          ? `Synced! Extracted ${result.count} new task(s) from inbox.`
          : "Gmail up to date. No new academic emails found."
      );
    } catch (err: any) {
      console.warn("Gmail sync error:", err);
      setErrorMessage(err?.message || "Gmail sync failed. Please try re-connecting.");
    } finally {
      setIsSyncingGmail(false);
    }
  };

  // Account Deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setErrorMessage("Please type 'DELETE' to confirm account deletion.");
      return;
    }

    setIsDeleting(true);
    try {
      if (userUid) {
        await deleteUserProfileData(userUid);
      }
      await deleteAccount();
      setLocation("/login");
    } catch (err) {
      console.warn("Delete account error:", err);
      setErrorMessage("Could not complete account deletion. Please try again.");
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background text-slate-900 dark:text-text-primary transition-colors duration-200 flex flex-col">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface/90 backdrop-blur-md">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-6 md:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-elevated cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to Dashboard</span>
            </Link>

            <div className="h-4 w-px bg-slate-200 dark:bg-border hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-mono text-slate-500 dark:text-text-muted">Account Settings</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 py-1.5 px-3 rounded-lg border border-rose-200 dark:border-rose-500/20 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Account Settings Container */}
      <main className="flex-1 max-w-[1140px] w-full mx-auto px-4 sm:px-6 md:px-12 py-8 space-y-8">
        
        {/* Feedback Banners */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2.5 shadow-xs"
            >
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>Your profile information and preferences have been updated successfully.</span>
            </motion.div>
          )}

          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 text-sm flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. HERO PROFILE CARD */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-xs dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            
            {/* Avatar & Core Identity */}
            <div className="flex items-center gap-5">
              <div className="relative group">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-blue-500/30 dark:border-[#76d8fb]/40 bg-slate-100 dark:bg-[#111726] flex items-center justify-center text-slate-700 dark:text-white shadow-md relative">
                  {photoURL ? (
                    <img
                      src={photoURL}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold">
                      {(displayName[0] || "S").toUpperCase()}
                    </div>
                  )}

                  {/* Photo Upload Overlay Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-medium cursor-pointer"
                    title="Change profile picture"
                  >
                    <Camera size={18} className="mb-1 text-[#76d8fb]" />
                    <span>Upload</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {photoURL && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md text-xs cursor-pointer"
                    title="Remove photo"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight font-['Space_Grotesk',sans-serif] text-slate-900 dark:text-white">
                    {displayName || "Student User"}
                  </h1>
                  {usn && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-[#76d8fb]">
                      {usn}
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-slate-500 dark:text-text-secondary mt-1 flex items-center gap-2">
                  <Mail size={13} className="text-slate-400" />
                  <span>{authUser?.email || "Academic User"}</span>
                </p>

                {(branch || semester || college) && (
                  <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-600 dark:text-text-secondary flex-wrap">
                    {branch && (
                      <span className="inline-flex items-center gap-1">
                        <BookOpen size={13} className="text-[#a895ff]" />
                        <span>{branch}</span>
                      </span>
                    )}
                    {branch && semester && (
                      <span className="text-slate-300 dark:text-white/20">•</span>
                    )}
                    {semester && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                        <GraduationCap size={13} className="text-amber-500" />
                        <span>{semester}</span>
                      </span>
                    )}
                    {(branch || semester) && college && (
                      <span className="text-slate-300 dark:text-white/20">•</span>
                    )}
                    {college && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={13} className="text-[#76d8fb]" />
                        <span>{college}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Button */}
            <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 dark:bg-gradient-to-r dark:from-[#a9e6f5] dark:to-[#7fcfe9] text-white dark:text-[#08131b] font-medium text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                >
                  <Sliders size={14} />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => handleSaveProfile()}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>{isSaving ? "Saving..." : "Save"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-border text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

          </div>
        </section>

        {/* 2. ACADEMIC PROGRESS & PRODUCTIVITY SECTION */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Academic Progress &amp; Productivity
              </h2>
              <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">
                Realtime metrics computed across your coursework and scheduled exams.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Completed Tasks */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-text-secondary mb-3">
                <span className="text-xs font-mono font-medium uppercase tracking-wider">Completed Tasks</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCheck size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  {completedTasks}
                  <span className="text-xs text-slate-400 font-normal ml-1">/ {totalTasks} total</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-surface-subtle h-1.5 rounded-full overflow-hidden mt-3">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Metric 2: Completion Rate */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-text-secondary mb-3">
                <span className="text-xs font-mono font-medium uppercase tracking-wider">Completion Rate</span>
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  {completionRate}%
                </div>
                <p className="text-[11px] text-slate-500 dark:text-text-muted mt-1">
                  {completionRate >= 80 ? "Outstanding task velocity!" : "Keep progressing on assignments"}
                </p>
              </div>
            </div>

            {/* Metric 3: Study Streak */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-text-secondary mb-3">
                <span className="text-xs font-mono font-medium uppercase tracking-wider">Study Streak</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Flame size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  {streakDays} <span className="text-xs font-normal text-slate-400">Days</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-text-muted mt-1">
                  Consistent academic planning
                </p>
              </div>
            </div>

            {/* Metric 4: Scheduled Courses */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-text-secondary mb-3">
                <span className="text-xs font-mono font-medium uppercase tracking-wider">Upcoming Exams</span>
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Calendar size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  {exams.length}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-text-muted mt-1">
                  {timetable.length} weekly timetable slots
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. ACADEMIC INFORMATION FORM */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-border pb-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Academic &amp; Student Information
              </h2>
              <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">
                Used to personalize your intelligent daily plans and semester schedules.
              </p>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs font-medium text-blue-600 dark:text-[#76d8fb] hover:underline cursor-pointer"
              >
                Edit Details
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={15} />
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter full name"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all"
                />
              </div>
            </div>

            {/* USN / Student ID */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                University Seat Number (USN) / Student ID
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <GraduationCap size={15} />
                </span>
                <input
                  type="text"
                  value={usn}
                  onChange={(e) => setUsn(e.target.value.toUpperCase())}
                  disabled={!isEditing}
                  placeholder="Enter student ID"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all uppercase"
                />
              </div>
            </div>

            {/* Degree / Program */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                Degree / Academic Program
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <BookOpen size={15} />
                </span>
                <input
                  type="text"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter degree"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all"
                />
              </div>
            </div>

            {/* Department / Branch */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                Department / Major Branch
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Building2 size={15} />
                </span>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter department"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all"
                />
              </div>
            </div>

            {/* Semester */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                Current Semester
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Clock size={15} />
                </span>
                <input
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter semester"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all"
                />
              </div>
            </div>

            {/* College / Institution */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-text-secondary mb-1.5 uppercase">
                Institution / University
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Building2 size={15} />
                </span>
                <input
                  type="text"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter institution"
                  className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-[#0c101a] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:bg-slate-100/70 dark:disabled:bg-[#111624] transition-all"
                />
              </div>
            </div>

            {isEditing && (
              <div className="col-span-1 md:col-span-2 pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-border text-xs font-medium text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{isSaving ? "Saving..." : "Save Academic Details"}</span>
                </button>
              </div>
            )}
          </form>
        </section>

        {/* 4. PREFERENCES & NOTIFICATION SETTINGS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Appearance & Theme Preferences */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Moon size={16} className="text-blue-500 dark:text-[#76d8fb]" />
                <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  Appearance &amp; Theme
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-text-secondary mb-5">
                Customize your visual experience across DeadlineIQ.
              </p>

              {/* Theme selector */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    isDark
                      ? "border-blue-500/50 bg-blue-500/10 text-slate-900 dark:text-white"
                      : "border-slate-200 dark:border-border bg-slate-50 dark:bg-surface-subtle text-slate-600 dark:text-text-secondary"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0c101a] text-[#76d8fb] flex items-center justify-center flex-shrink-0">
                    <Moon size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Dark Mode</div>
                    <div className="text-[10px] text-slate-400">Deep obsidian palette</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    !isDark
                      ? "border-blue-500/50 bg-blue-500/10 text-slate-900 dark:text-white"
                      : "border-slate-200 dark:border-border bg-slate-50 dark:bg-surface-subtle text-slate-600 dark:text-text-secondary"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                    <Sun size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Light Mode</div>
                    <div className="text-[10px] text-slate-400">High contrast daylight</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200/80 dark:border-border flex items-center justify-between text-xs text-slate-500 dark:text-text-muted">
              <span>Current theme preference</span>
              <span className="font-mono font-medium text-slate-800 dark:text-slate-200 capitalize">
                {theme} Mode
              </span>
            </div>
          </div>

          {/* Academic Notifications */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-purple-500 dark:text-[#a895ff]" />
                  <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                    Notification Alerts
                  </h3>
                </div>
                {/* Device Permission Badge */}
                {notificationPermission === "granted" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Permission Granted
                  </span>
                ) : notificationPermission === "denied" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    <AlertTriangle size={10} /> Blocked in Settings
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    Prompt Needed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-text-secondary mb-3">
                Manage automated daily agenda briefings and urgent deadline nudges.
              </p>

              {/* Status Warning for Denied Permission */}
              {notificationPermission === "denied" && (
                <div className="mb-4 p-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300">
                  <p className="font-medium text-[11px]">System notifications are blocked on this device.</p>
                  <p className="text-[10px] mt-0.5 text-rose-600 dark:text-rose-400">
                    To receive alerts, open your Android Settings &rarr; Apps &rarr; Chrome or DeadlineIQ &rarr; Notifications and turn them on.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {/* Daily plan reminder */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-subtle cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Daily Agenda Briefing</div>
                    <div className="text-[10px] text-slate-500 dark:text-text-muted">Morning study overview notifications</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={dailyPlanReminder}
                    onChange={(e) => setDailyPlanReminder(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                  />
                </label>

                {/* Deadline alerts */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-subtle cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Deadline Approaching Alerts</div>
                    <div className="text-[10px] text-slate-500 dark:text-text-muted">Notify 24h and 3h before due times</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={deadlineAlerts}
                    onChange={(e) => setDeadlineAlerts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                  />
                </label>

                {/* Exam alerts */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-subtle cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Exam Schedule Reminders</div>
                    <div className="text-[10px] text-slate-500 dark:text-text-muted">Revision countdown alerts for scheduled exams</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={examAlerts}
                    onChange={(e) => setExamAlerts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                  />
                </label>
              </div>

              {/* Test result feedback banner */}
              {testNotificationResult && (
                <div
                  className={`mt-3 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
                    testNotificationResult.success
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : "bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300"
                  }`}
                >
                  <span className="text-[11px] font-mono leading-tight">{testNotificationResult.message}</span>
                  <button
                    type="button"
                    onClick={() => setTestNotificationResult(null)}
                    className="text-text-muted hover:text-text-primary p-0.5 cursor-pointer flex-shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-200/80 dark:border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTestingNotification}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-subtle hover:bg-slate-100 dark:hover:bg-surface text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Bell size={13} className="text-blue-500" />
                <span>{isTestingNotification ? "Dispatching..." : "Send Test Reminder"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveProfile()}
                disabled={isSaving}
                className="text-xs font-medium text-blue-600 dark:text-[#76d8fb] hover:underline cursor-pointer text-center sm:text-right"
              >
                {isSaving ? "Saving preferences..." : "Save Notification Preferences"}
              </button>
            </div>
          </div>

        </section>

        {/* GOOGLE SETUP CHECK PANEL */}
        <GoogleSetupCheckCard userUid={userUid} />

        {/* 5. CONNECTED INTEGRATIONS */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-border pb-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Connected Integrations
              </h2>
              <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">
                Manage cloud connections and external calendar synchronization.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Google Calendar Card */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5 sm:gap-4 transition-all">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151c2d] border border-slate-200 dark:border-white/10 flex items-center justify-center flex-shrink-0 shadow-xs">
                  <CalendarDays size={20} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">Google Calendar</h4>
                    {googleMeta.isConnected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                        Connected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-text-muted mt-1 leading-relaxed break-words">
                    {googleMeta.isConnected
                      ? `Syncing with Google Calendar (${googleMeta.connectedEmail || "Primary Account"}).`
                      : "Sync your deadlines and daily study sessions with Google Calendar."}
                  </p>
                </div>
              </div>

              <div className="flex sm:block justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-white/5">
                <button
                  type="button"
                  onClick={handleToggleGoogleCalendar}
                  className={`w-full sm:w-auto text-center px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
                    googleMeta.isConnected
                      ? "border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                  }`}
                >
                  {googleMeta.isConnected ? "Disconnect" : "Connect"}
                </button>
              </div>
            </div>

            {/* Firebase Cloud Sync Card */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5 sm:gap-4 transition-all">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151c2d] border border-slate-200 dark:border-white/10 flex items-center justify-center flex-shrink-0 shadow-xs">
                  <ShieldCheck size={20} className="text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">Firebase Cloud Storage</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-text-muted mt-1 leading-relaxed break-words">
                    User data is securely isolated per authenticated UID with realtime Firestore synchronization.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Gmail Review & Sync Section in Settings */}
        <GmailReviewSettingsSection userUid={userUid} />

        {/* 6. LEGAL & PRIVACY SECTION */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-border pb-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Privacy, Security &amp; Terms
              </h2>
              <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">
                DeadlineIQ protects student privacy with zero ads and strict data isolation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Link
              href="/privacy"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-500/40 bg-slate-50/50 dark:bg-[#0c101a] hover:bg-slate-50 dark:hover:bg-surface-elevated text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-blue-600 dark:text-[#76d8fb]" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-[#76d8fb] transition-colors">
                    Privacy Policy
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-text-muted">
                    Full privacy policy & data practices
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/terms"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-500/40 bg-slate-50/50 dark:bg-[#0c101a] hover:bg-slate-50 dark:hover:bg-surface-elevated text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-indigo-600 dark:text-[#a895ff]" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-[#a895ff] transition-colors">
                    Terms of Service
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-text-muted">
                    Student usage guidelines
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/cookies"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-500/40 bg-slate-50/50 dark:bg-[#0c101a] hover:bg-slate-50 dark:hover:bg-surface-elevated text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    Storage &amp; Cookies
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-text-muted">
                    localStorage &amp; zero tracking
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/delete-account"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-border hover:border-rose-400 dark:hover:border-rose-500/40 bg-slate-50/50 dark:bg-[#0c101a] hover:bg-slate-50 dark:hover:bg-surface-elevated text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <Trash2 size={18} className="text-rose-600 dark:text-rose-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                    Data Deletion Page
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-text-muted">
                    Public deletion request portal
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/contact"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-500/40 bg-slate-50/50 dark:bg-[#0c101a] hover:bg-slate-50 dark:hover:bg-surface-elevated text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <Mail size={18} className="text-sky-600 dark:text-sky-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                    Contact &amp; Privacy Support
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-text-muted">
                    Support and privacy contacts
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </section>

        {/* 7. DANGER ZONE (ACCOUNT DELETION) */}
        <section className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-950/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold font-['Space_Grotesk'] text-rose-800 dark:text-rose-400">
                Delete Account
              </h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/70 mt-1 max-w-xl">
                Permanently delete your DeadlineIQ profile and all associated data, including deadlines, exams, timetable entries, and study plans. This action cannot be undone.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 flex-shrink-0"
            >
              <Trash2 size={14} />
              <span>Delete My Account</span>
            </button>
          </div>
        </section>

      </main>

      {/* PRIVACY POLICY MODAL */}
      <AnimatePresence>
        {showPrivacyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-surface p-6 sm:p-8 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-border pb-3">
                <div className="flex items-center gap-2">
                  <Shield size={20} className="text-blue-500 dark:text-[#76d8fb]" />
                  <h3 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                    Privacy Policy
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-text-secondary space-y-3 leading-relaxed">
                <p>
                  <strong>1. Student Data Ownership:</strong> Your academic records, assignments, timetable, and exam schedules remain your personal property. DeadlineIQ does not sell or share student data with advertisers or third parties.
                </p>
                <p>
                  <strong>2. Security &amp; Access Isolation:</strong> All data stored in Firebase Firestore is secured under your authenticated Firebase UID. Firestore security rules strictly prevent other users from accessing, modifying, or reading your coursework.
                </p>
                <p>
                  <strong>3. AI Document Processing:</strong> When extracting timetable circulars or date sheets via AI Extract, files are processed ephemerally in memory solely to parse deadlines, classes, and exams. Uploaded files are not used to train public models.
                </p>
                <p>
                  <strong>4. Google Calendar Access:</strong> When connecting Google Calendar, permissions are limited solely to viewing and scheduling events requested by the user. OAuth tokens are managed securely in client-side storage.
                </p>
                <p>
                  <strong>5. Account Deletion:</strong> You retain the full right to delete your account and all associated records permanently at any time from your Account Settings.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TERMS OF SERVICE MODAL */}
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-surface p-6 sm:p-8 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-border pb-3">
                <div className="flex items-center gap-2">
                  <FileText size={20} className="text-indigo-500 dark:text-[#a895ff]" />
                  <h3 className="text-lg font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                    Terms of Service
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-text-secondary space-y-3 leading-relaxed">
                <p>
                  <strong>1. Educational Use:</strong> DeadlineIQ is engineered as an intelligent study companion for university students and academics to organize datesheets, timetables, and assignment deadlines.
                </p>
                <p>
                  <strong>2. Account Integrity:</strong> Users are responsible for maintaining the confidentiality of their authentication credentials and for all activities carried out under their account.
                </p>
                <p>
                  <strong>3. Availability:</strong> While DeadlineIQ aims for uninterrupted availability and reliable cloud synchronization, users are advised to maintain verified copies of critical academic circulars.
                </p>
                <p>
                  <strong>4. Service Modifications:</strong> We continuously improve features, intelligent planners, and calendar integrations to optimize student productivity.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCOUNT DELETION CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-surface p-6 sm:p-7 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                    Confirm Account Deletion
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-text-secondary">
                    This action is permanent and cannot be reversed.
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-text-secondary leading-relaxed">
                All your deadlines, weekly timetable, exam date sheets, and account preferences will be deleted immediately from Firestore.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-text-secondary mb-1.5">
                  Type <strong>DELETE</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-xl border border-rose-300 dark:border-rose-500/30 bg-slate-50 dark:bg-black/40 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText("");
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-border text-xs font-medium text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || isDeleting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  <span>{isDeleting ? "Deleting..." : "Permanently Delete"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-200/80 dark:border-border py-4 mt-auto">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-6 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-text-muted font-mono">
          <div>© 2026 DeadlineIQ · Student Workspace</div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-800 dark:hover:text-white transition-colors">Terms</Link>
            <Link href="/cookies" className="hover:text-slate-800 dark:hover:text-white transition-colors">Cookies &amp; Storage</Link>
            <Link href="/delete-account" className="hover:text-slate-800 dark:hover:text-white transition-colors">Data Deletion</Link>
            <Link href="/contact" className="hover:text-slate-800 dark:hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
