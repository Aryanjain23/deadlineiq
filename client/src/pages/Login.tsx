import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getReadableFirebaseErrorMessage,
  isUnauthorizedDomainError,
  isAuthCancelledError,
  getFirebaseConfig,
} from "@/lib/firebase";

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.31 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27a7.19 7.19 0 0 1 0-4.54V6.58H1.27a11.96 11.96 0 0 0 0 10.84l4.01-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="brand" aria-label="DeadlineIQ home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M7 7.5h8.5a8.5 8.5 0 1 1 0 17H7v-17Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 12h4a4 4 0 1 1 0 8h-4v-8Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="24.5" cy="8" r="2.1" fill="#86dcff" />
        </svg>
      </span>
      <span className="brand-name">Deadline<span>IQ</span></span>
    </Link>
  );
}

type AuthMode = "signin" | "signup" | "forgot";

export default function Login() {
  const [, setLocation] = useLocation();
  const {
    user,
    isLoading: authLoading,
    loginWithGoogle,
    signUpWithEmail,
    loginWithEmail,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const firebaseProjectId = getFirebaseConfig().projectId || "deadlineiq-3a3b5";

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const handleCopyDomain = async () => {
    if (!unauthorizedDomain) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(unauthorizedDomain);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = unauthorizedDomain;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    } catch (e) {
      console.warn("Could not copy domain to clipboard:", e);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsGoogleSubmitting(true);

    try {
      const targetMode = mode === "signup" ? "signup" : "signin";
      const authUser = await loginWithGoogle(targetMode);
      if (authUser) {
        setLocation("/dashboard");
      }
    } catch (err: any) {
      if (isAuthCancelledError(err)) {
        return;
      }

      const isDomainIssue = isUnauthorizedDomainError(err);
      if (isDomainIssue) {
        console.warn("Google sign-in requires domain authorization:", err?.message || err);
        const host = typeof window !== "undefined" ? window.location.hostname : "current-domain";
        setUnauthorizedDomain(host);
        setError(null);
      } else {
        console.warn("Google sign-in prevented:", err?.message || err);
        setError(getReadableFirebaseErrorMessage(err));
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await loginWithEmail(cleanEmail, password);
      setLocation("/dashboard");
    } catch (err: any) {
      console.warn("Login failure:", err?.message || err);
      setError(getReadableFirebaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanName = displayName.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError("Please enter your full name.");
      return;
    }
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signUpWithEmail(cleanEmail, password, cleanName);
      setLocation("/dashboard");
    } catch (err: any) {
      console.warn("Sign up failure:", err?.message || err);
      setError(getReadableFirebaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter the email address associated with your account.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(cleanEmail);
      setSuccessMessage(
        `Password reset instructions have been sent to ${cleanEmail}. Please check your inbox and spam folder.`
      );
    } catch (err: any) {
      console.warn("Password reset failure:", err?.message || err);
      setError(getReadableFirebaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="min-h-screen bg-[#080a10] text-[#f4f5f7] flex flex-col selection:bg-[#8bdcf7] selection:text-[#061018] relative overflow-hidden"
    >
      {/* Subtle architectural atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 65% 55% at 20% 30%, rgba(26, 60, 92, 0.35), transparent 70%),
            radial-gradient(ellipse 50% 45% at 85% 65%, rgba(68, 54, 120, 0.22), transparent 70%),
            linear-gradient(rgba(124, 158, 187, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124, 158, 187, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
        }}
      />

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-6 flex items-center justify-between">
        <Logo />

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#929aaa] hover:text-white transition-colors duration-180 py-2 px-3.5 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-[#242936]"
        >
          <ArrowLeft size={14} className="text-[#76d8fb]" />
          <span>Back to Home</span>
        </Link>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-4 md:py-8 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          
          {/* Left Column: Auth Card */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <div className="relative rounded-2xl border border-[rgba(210,224,243,0.12)] bg-[#11141d]/90 backdrop-blur-xl p-7 sm:p-9 shadow-[0_24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
              
              {/* Title & subtitle */}
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#f4f5f7] font-['Space_Grotesk',sans-serif]">
                {mode === "signin" && "Welcome back"}
                {mode === "signup" && "Create your account"}
                {mode === "forgot" && "Reset password"}
              </h1>
              <p className="text-sm text-[#929aaa] mt-2 mb-6 leading-relaxed">
                {mode === "signin" && "Sign in to access your timetable, exams, deadlines, and smart daily planner."}
                {mode === "signup" && "Set up your student profile to automatically organize your academic schedule."}
                {mode === "forgot" && "Enter your registered email address to receive secure reset instructions."}
              </p>

              {/* Mode Switcher Tabs */}
              {mode !== "forgot" ? (
                <div className="grid grid-cols-2 p-1 bg-[#090c13] border border-[#202636] rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className={`py-2 text-xs font-medium rounded-lg transition-all duration-180 cursor-pointer ${
                      mode === "signin"
                        ? "bg-[#1c2230] text-[#f4f5f7] shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-white/[0.08]"
                        : "text-[#808d9f] hover:text-[#c4cedb]"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className={`py-2 text-xs font-medium rounded-lg transition-all duration-180 cursor-pointer ${
                      mode === "signup"
                        ? "bg-[#1c2230] text-[#f4f5f7] shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-white/[0.08]"
                        : "text-[#808d9f] hover:text-[#c4cedb]"
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              ) : (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-[#76d8fb] hover:text-[#aee7f9] cursor-pointer transition-colors"
                  >
                    <ArrowLeft size={13} />
                    <span>Back to sign in</span>
                  </button>
                </div>
              )}

              {/* Google Sign-In */}
              {mode !== "forgot" && (
                <div className="mb-5">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleSubmitting || isSubmitting}
                    className="w-full min-h-[46px] px-4 rounded-xl border border-[rgba(210,224,243,0.18)] bg-[#171b26] hover:bg-[#1f2535] hover:border-[#76d8fb]/40 text-[#f4f5f7] font-medium text-xs sm:text-sm flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.35)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed group"
                  >
                    {isGoogleSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#76d8fb]" />
                        <span>Connecting with Google...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="w-4 h-4 flex-shrink-0" />
                        <span>Continue with Google</span>
                        <ChevronRight
                          size={14}
                          className="text-[#6d798b] group-hover:text-[#76d8fb] transition-colors ml-auto hidden sm:inline"
                        />
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="relative flex items-center justify-center my-5">
                    <div className="border-t border-[#232938] w-full" />
                    <span className="bg-[#11141d] px-3 text-[11px] font-mono text-[#6c788a] uppercase tracking-wider relative">
                      or continue with credentials
                    </span>
                  </div>
                </div>
              )}

              {/* Error or Success Banners */}
              <AnimatePresence>
                {unauthorizedDomain && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    role="alert"
                    className="p-4 mb-5 rounded-xl border border-amber-500/35 bg-[#17140e] text-[#fef3c7] text-xs shadow-[0_8px_30px_rgba(245,158,11,0.12)] relative"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-md bg-amber-500/20 text-amber-300">
                          <ShieldAlert size={15} />
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#fef3c7] font-['Space_Grotesk',sans-serif]">
                          Firebase Domain Authorization Required
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUnauthorizedDomain(null)}
                        className="text-amber-400/60 hover:text-amber-200 transition-colors p-1 -mr-1 -mt-1 cursor-pointer"
                        aria-label="Dismiss banner"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <p className="text-amber-200/80 leading-relaxed mb-3 text-[11px] sm:text-xs">
                      Firebase Google Sign-In requires your app's web domain to be added to Authorized Domains in your Firebase console.
                    </p>

                    {/* Domain Box */}
                    <div className="bg-[#0b0906] border border-amber-500/25 rounded-lg p-2 flex items-center justify-between gap-2 mb-3">
                      <code className="font-mono text-[11px] text-amber-200 truncate select-all px-1">
                        {unauthorizedDomain}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyDomain}
                        className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-100 font-medium text-[11px] transition-all cursor-pointer active:scale-95"
                      >
                        {copiedDomain ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-300">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Domain</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-amber-500/20">
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0c0a06] font-semibold text-xs transition-colors shadow-sm cursor-pointer"
                      >
                        <span>Open Firebase Settings</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </motion.div>
                )}

                {error && !unauthorizedDomain && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    role="alert"
                    className="p-3 mb-5 rounded-lg border border-[rgba(251,113,133,0.3)] bg-rose-950/40 text-[#fca5a5] text-xs flex flex-col gap-2 shadow-[0_4px_16px_rgba(251,113,133,0.1)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <AlertCircle size={16} className="flex-shrink-0 text-[#fb7185]" />
                      <span className="leading-snug">{error}</span>
                    </div>

                    {(error.includes("create an account first") || error.includes("Create Account first")) && (
                      <div className="pt-1 border-t border-rose-500/20 flex items-center justify-between">
                        <span className="text-[11px] text-[#fca5a5]/70">Need a new profile?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("signup");
                            setError(null);
                            setSuccessMessage(null);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#76d8fb] hover:text-[#aee7f9] cursor-pointer transition-colors"
                        >
                          <span>Switch to Create Account</span>
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    )}

                    {(error.includes("Please sign in instead") || error.includes("already exists")) && (
                      <div className="pt-1 border-t border-rose-500/20 flex items-center justify-between">
                        <span className="text-[11px] text-[#fca5a5]/70">Already have an account?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("signin");
                            setError(null);
                            setSuccessMessage(null);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#76d8fb] hover:text-[#aee7f9] cursor-pointer transition-colors"
                        >
                          <span>Switch to Sign In</span>
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="p-3 mb-5 rounded-lg border border-[rgba(117,213,176,0.3)] bg-emerald-950/40 text-[#a7f3d0] text-xs flex items-center gap-2.5 shadow-[0_4px_16px_rgba(117,213,176,0.1)]"
                  >
                    <CheckCircle2 size={16} className="flex-shrink-0 text-[#75d5b0]" />
                    <span className="leading-snug">{successMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 1. SIGN IN FORM (Only Email, Password, Remember Session, Sign In) */}
              {mode === "signin" && (
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <Mail size={16} />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="student@university.edu"
                        autoComplete="email"
                        required
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-4 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setSuccessMessage(null);
                        }}
                        className="text-[11px] text-[#768395] hover:text-[#76d8fb] cursor-pointer transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <Lock size={16} />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-11 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#768395] hover:text-[#dce3ec] transition-colors focus:outline-none cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember session */}
                  <div className="flex items-center justify-between text-xs text-[#8793a3] pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-[#242936] bg-[#0a0d14] text-[#76d8fb] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#76d8fb]"
                      />
                      <span>Remember session</span>
                    </label>
                  </div>

                  {/* Primary Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || authLoading}
                    className="w-full min-h-[50px] px-5 rounded-lg text-[#08131b] font-semibold text-sm tracking-tight flex items-center justify-center gap-2 bg-gradient-to-r from-[#a9e6f5] to-[#7fcfe9] hover:from-[#c6f2fa] hover:to-[#94e3f3] disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_5px_24px_rgba(83,184,224,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_8px_34px_rgba(86,197,228,0.28)] transition-all duration-200 cursor-pointer active:scale-[0.99] mt-3"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#08131b]" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* 2. SIGN UP / CREATE ACCOUNT FORM */}
              {mode === "signup" && (
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <UserIcon size={16} />
                      </span>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Your Name"
                        autoComplete="name"
                        required
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-4 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <Mail size={16} />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="student@university.edu"
                        autoComplete="email"
                        required
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-4 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Password (min 6 characters)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <Lock size={16} />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Create a password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-11 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#768395] hover:text-[#dce3ec] transition-colors focus:outline-none cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <KeyRound size={16} />
                      </span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-11 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#768395] hover:text-[#dce3ec] transition-colors focus:outline-none cursor-pointer"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[50px] px-5 rounded-lg text-[#08131b] font-semibold text-sm tracking-tight flex items-center justify-center gap-2 bg-gradient-to-r from-[#a9e6f5] to-[#7fcfe9] hover:from-[#c6f2fa] hover:to-[#94e3f3] disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_5px_24px_rgba(83,184,224,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_8px_34px_rgba(86,197,228,0.28)] transition-all duration-200 cursor-pointer active:scale-[0.99] mt-3"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#08131b]" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* 3. FORGOT PASSWORD FORM */}
              {mode === "forgot" && (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                        <Mail size={16} />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="student@university.edu"
                        autoComplete="email"
                        required
                        className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-4 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[48px] px-5 rounded-lg text-[#08131b] font-semibold text-sm tracking-tight flex items-center justify-center gap-2 bg-gradient-to-r from-[#a9e6f5] to-[#7fcfe9] hover:from-[#c6f2fa] hover:to-[#94e3f3] disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_5px_24px_rgba(83,184,224,0.18)] transition-all duration-200 cursor-pointer mt-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#08131b]" />
                        <span>Sending reset email...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Password Reset Link</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs text-[#8793a3] hover:text-[#dce3ec] transition-colors cursor-pointer"
                    >
                      ← Return to Sign In
                    </button>
                  </div>
                </form>
              )}

              {/* Back to Home Link */}
              <div className="pt-4 text-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-xs text-[#8793a3] hover:text-[#dce3ec] transition-colors py-1 cursor-pointer"
                >
                  <span>← Back to Home</span>
                </Link>
              </div>

            </div>
          </motion.div>

          {/* Right Column: Visual Dashboard Overview */}
          <motion.div
            initial={{ opacity: 0, filter: "blur(12px)", scale: 0.97 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
            className="lg:col-span-7 hidden md:block"
            aria-label="Preview of the DeadlineIQ student planner"
          >
            <div className="relative">
              {/* Glow backdrop */}
              <div
                className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-[#76d8fb]/10 via-[#a895ff]/10 to-transparent blur-2xl -z-10 pointer-events-none"
                aria-hidden="true"
              />

              {/* Dashboard visual window */}
              <div className="rounded-xl border border-[rgba(189,220,240,0.19)] bg-gradient-to-br from-[#151a27]/95 to-[#0c0f17]/95 shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_60px_rgba(69,156,196,0.08)] overflow-hidden select-none pointer-events-none">
                
                {/* Topbar */}
                <div className="h-10 px-4 border-b border-[rgba(214,229,247,0.085)] bg-white/[0.016] flex items-center justify-between text-xs text-[#798497]">
                  <div className="flex items-center gap-2 font-['Space_Grotesk'] font-semibold text-[11px] text-[#d4deed]">
                    <span className="w-4 h-4 rounded border border-[rgba(156,220,240,0.38)] bg-[rgba(95,183,215,0.09)] text-[#b7eafa] flex items-center justify-center text-[9px]">
                      D
                    </span>
                    <span>Deadline<span className="text-[#76d8fb] font-normal">IQ</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#798497]">
                    <span>Academic Workspace</span>
                  </div>
                </div>

                {/* Dashboard body */}
                <div className="grid grid-cols-12 min-h-[360px]">
                  {/* Mini Sidebar */}
                  <div className="col-span-3 border-r border-[rgba(214,229,247,0.075)] p-3 flex flex-col justify-between bg-[#0e121a]/60">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#d9eaf0] bg-gradient-to-r from-[rgba(102,180,214,0.15)] to-transparent border-l-2 border-[#77cde8]">
                        <LayoutGrid size={12} className="text-[#76d8fb]" />
                        <span>Dashboard</span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <CalendarDays size={12} />
                        <span>Calendar</span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <Calendar size={12} />
                        <span>Timetable</span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <Sparkles size={12} />
                        <span>Plan My Day</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Preview Content */}
                  <div className="col-span-9 p-4.5 space-y-4">
                    {/* Header */}
                    <div className="flex items-end justify-between border-b border-[rgba(219,230,244,0.06)] pb-3">
                      <div>
                        <h2 className="text-base font-['Space_Grotesk'] font-medium text-[#eff3f7] tracking-tight">
                          Intelligent Academic Planner<span className="text-[#76d8fb]">.</span>
                        </h2>
                        <p className="text-[10px] text-[#8794a5] mt-0.5">
                          Synced with classes, exams, active deadlines, and calendar events.
                        </p>
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 text-left">
                      <div className="p-2.5 rounded-lg border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#78d3ed] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-[#dce3ec]">
                            Automated Timetable &amp; Exam Extraction
                          </div>
                          <div className="text-[9px] text-[#828d9d]">
                            Upload datesheets, timetables, or notices to automatically populate schedules.
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#af9af7] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-[#dce3ec]">
                            Context-Aware Daily Planner
                          </div>
                          <div className="text-[9px] text-[#828d9d]">
                            Prioritizes fixed classes, urgent deadlines, and revision for upcoming exams.
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#75d5b0] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-[#dce3ec]">
                            Google Calendar Synchronization
                          </div>
                          <div className="text-[9px] text-[#828d9d]">
                            Seamlessly synchronize assignments and study sessions with your external calendar.
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Bottom subtle bar */}
                <div className="px-4 py-2 border-t border-[rgba(214,229,247,0.075)] bg-black/20 flex items-center justify-between text-[8px] font-mono text-[#748091]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#75d5b0]" />
                    <span>SECURE CLOUD STORAGE</span>
                  </span>
                  <span>DEADLINEIQ ACADEMIC PLATFORM</span>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between text-[11px] text-[#647080] font-mono">
        <div>© 2026 DeadlineIQ · Academic planning, intelligently.</div>
        <div className="hidden sm:block">STUDENT WORKSPACE</div>
      </footer>
    </motion.div>
  );
}
