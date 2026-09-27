import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lock,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

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

export default function Login() {
  const [, setLocation] = useLocation();
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleFillDemo = () => {
    setUsn("1MS21CS042");
    setPassword("deadlineiq2026");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Non-functional for Step 1 as requested: "Do NOT implement authentication yet. Do NOT add Firebase yet. Do NOT add APIs yet."
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="min-h-screen bg-[#080a10] text-[#f4f5f7] flex flex-col selection:bg-[#8bdcf7] selection:text-[#061018] relative overflow-hidden"
    >
      {/* Background atmosphere lighting & subtle grid */}
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

      {/* Decorative Orbits */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full border border-[rgba(118,216,251,0.08)] opacity-60"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-[-10%] w-[700px] h-[700px] rounded-full border border-[rgba(168,149,255,0.06)] opacity-50"
        aria-hidden="true"
      />

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-6 flex items-center justify-between">
        <Logo />

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#929aaa] hover:text-white transition-colors duration-180 py-2 px-3 rounded-md hover:bg-white/[0.04] border border-transparent hover:border-[#242936]"
        >
          <ArrowLeft size={14} className="text-[#76d8fb]" />
          <span>Back to DeadlineIQ</span>
        </Link>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-4 md:py-8 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          
          {/* Left Column: Premium Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <div className="relative rounded-2xl border border-[rgba(210,224,243,0.12)] bg-[#11141d]/85 backdrop-blur-xl p-7 sm:p-9 shadow-[0_24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
              {/* Card top badge */}
              <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-wider text-[#8b95a7] uppercase mb-4">
                <span className="w-2 h-2 rounded-full bg-[#75d5b0] shadow-[0_0_8px_rgba(117,213,176,0.6)]" />
                <span>Command Center Access · Sem 04</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#f4f5f7] font-['Space_Grotesk',sans-serif]">
                Welcome back.
              </h1>
              <p className="text-sm text-[#929aaa] mt-2 mb-7 leading-relaxed">
                Your academic command center is ready.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* USN Field */}
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase mb-2">
                    USN
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                      <GraduationCap size={17} />
                    </span>
                    <input
                      type="text"
                      value={usn}
                      onChange={(e) => setUsn(e.target.value)}
                      placeholder="Enter your university seat number"
                      autoComplete="username"
                      className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-4 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180 font-normal"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-mono tracking-wider text-[#cbd3df] uppercase">
                      Password
                    </label>
                    <span className="text-[11px] text-[#768395] hover:text-[#76d8fb] cursor-pointer transition-colors">
                      Forgot?
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#768395]">
                      <Lock size={16} />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full bg-[#0a0d14]/90 border border-[#242936] focus:border-[#76d8fb] focus:ring-1 focus:ring-[#76d8fb]/40 rounded-lg pl-10 pr-11 py-3 text-sm text-[#f4f5f7] placeholder-[#606b7d] outline-none transition-all duration-180"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#768395] hover:text-[#dce3ec] transition-colors focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Remember me option */}
                <div className="flex items-center justify-between text-xs text-[#8793a3] pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#242936] bg-[#0a0d14] text-[#76d8fb] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#76d8fb]"
                    />
                    <span>Remember this session</span>
                  </label>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#697484]">
                    <ShieldCheck size={12} className="text-[#75d5b0]" /> 256-bit safe
                  </span>
                </div>

                {/* Primary Button */}
                <button
                  type="submit"
                  className="w-full min-h-[50px] px-5 rounded-lg text-[#08131b] font-semibold text-sm tracking-tight flex items-center justify-center gap-2 bg-gradient-to-r from-[#a9e6f5] to-[#7fcfe9] hover:from-[#c6f2fa] hover:to-[#94e3f3] shadow-[0_5px_24px_rgba(83,184,224,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_8px_34px_rgba(86,197,228,0.28)] transition-all duration-200 cursor-pointer active:scale-[0.99] mt-2"
                >
                  <span>Enter DeadlineIQ</span>
                  <ArrowRight size={16} />
                </button>

                {/* Demo account note */}
                <div className="pt-2 text-center">
                  <div className="inline-flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-[#242936]/80 bg-[#171b25]/50 w-full">
                    <div className="text-xs text-[#a0a9b8]">
                      Demo account available for the hackathon
                    </div>
                    <button
                      type="button"
                      onClick={handleFillDemo}
                      className="text-[11px] font-mono text-[#76d8fb] hover:text-[#b8ecf8] hover:underline cursor-pointer inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Auto-fill demo credentials</span>
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Return link */}
                <div className="pt-1 text-center">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-xs text-[#8793a3] hover:text-[#dce3ec] transition-colors py-1 cursor-pointer"
                  >
                    <span>← Back to DeadlineIQ</span>
                  </Link>
                </div>
              </form>
            </div>
          </motion.div>

          {/* Right Column: Subtle Visual Preview of DeadlineIQ Dashboard */}
          <motion.div
            initial={{ opacity: 0, filter: "blur(12px)", scale: 0.97 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
            className="lg:col-span-7 hidden md:block"
            aria-label="Preview of the DeadlineIQ student planner dashboard"
          >
            <div className="relative">
              {/* Glow backdrop behind preview */}
              <div
                className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-[#76d8fb]/10 via-[#a895ff]/10 to-transparent blur-2xl -z-10 pointer-events-none"
                aria-hidden="true"
              />

              {/* Floating ambient badge */}
              <div className="absolute -top-3 right-6 z-20 px-3 py-1 rounded-full border border-[#76d8fb]/30 bg-[#0f1522]/90 backdrop-blur-md shadow-lg text-[10px] font-mono text-[#86dcff] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#76d8fb] animate-pulse" />
                <span>COMMAND VIEW PREVIEW</span>
              </div>

              {/* Faded/blurred academic dashboard window */}
              <div className="rounded-xl border border-[rgba(189,220,240,0.19)] bg-gradient-to-br from-[#151a27]/95 to-[#0c0f17]/95 shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_60px_rgba(69,156,196,0.08)] overflow-hidden select-none pointer-events-none">
                
                {/* Topbar */}
                <div className="h-10 px-4 border-b border-[rgba(214,229,247,0.085)] bg-white/[0.016] flex items-center justify-between text-xs text-[#798497]">
                  <div className="flex items-center gap-2 font-['Space_Grotesk'] font-semibold text-[11px] text-[#d4deed]">
                    <span className="w-4 h-4 rounded border border-[rgba(156,220,240,0.38)] bg-[rgba(95,183,215,0.09)] text-[#b7eafa] flex items-center justify-center text-[9px]">
                      D
                    </span>
                    <span>deadline<span className="text-[#76d8fb] font-normal">IQ</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#798497]">
                    <span>Workspace</span>
                    <ChevronRight size={10} />
                    <span>Semester 04</span>
                  </div>
                  <div className="flex items-center -space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#46565d] border border-[#131722] text-[8px] flex items-center justify-center text-white">R</span>
                    <span className="w-5 h-5 rounded-full bg-[#5e4d65] border border-[#131722] text-[8px] flex items-center justify-center text-white">M</span>
                    <span className="w-5 h-5 rounded-full bg-[#232b37] border border-[#131722] text-[8px] flex items-center justify-center text-[#a8b1c1]">+</span>
                  </div>
                </div>

                {/* Dashboard body */}
                <div className="grid grid-cols-12 min-h-[360px]">
                  {/* Mini Sidebar */}
                  <div className="col-span-3 border-r border-[rgba(214,229,247,0.075)] p-3 flex flex-col justify-between bg-[#0e121a]/60">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-[#647185] tracking-widest px-2 mb-2">
                        WORKSPACE
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#d9eaf0] bg-gradient-to-r from-[rgba(102,180,214,0.15)] to-transparent border-l-2 border-[#77cde8]">
                        <LayoutGrid size={12} className="text-[#76d8fb]" />
                        <span>Overview</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <span className="flex items-center gap-2">
                          <CalendarDays size={12} />
                          <span>Timeline</span>
                        </span>
                        <span className="text-[9px] font-mono bg-white/[0.04] px-1 rounded text-[#9ba9bc]">8</span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <BookOpen size={12} />
                        <span>Courses</span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-[#8f9aad]">
                        <Target size={12} />
                        <span>Focus</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[rgba(214,229,247,0.08)] flex items-center gap-2 px-1 text-xs">
                      <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[#383854] to-[#252c40] border border-[rgba(183,192,238,0.23)] flex items-center justify-center text-[10px] text-[#e1dcff] font-['Space_Grotesk']">
                        R
                      </span>
                      <div className="text-[10px] leading-tight">
                        <div className="text-[#cdd6e1] font-medium">Riya Sharma</div>
                        <div className="text-[#758294] text-[8px]">Student plan</div>
                      </div>
                    </div>
                  </div>

                  {/* Main Preview Content */}
                  <div className="col-span-9 p-4.5 space-y-4">
                    {/* Header */}
                    <div className="flex items-end justify-between border-b border-[rgba(219,230,244,0.06)] pb-3">
                      <div>
                        <div className="text-[8px] font-mono text-[#768395] tracking-widest">
                          MONDAY, SEPTEMBER 28
                        </div>
                        <h2 className="text-base font-['Space_Grotesk'] font-medium text-[#eff3f7] tracking-tight mt-0.5">
                          Your week, in focus<span className="text-[#76d8fb]">.</span>
                        </h2>
                      </div>
                      <div className="text-[9px] text-[#a6b1c0] bg-white/[0.03] border border-[rgba(210,225,245,0.12)] rounded px-2 py-1 flex items-center gap-1">
                        <span>This week</span>
                        <ChevronRight size={10} />
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-2 py-1 border-b border-[rgba(219,230,244,0.06)] pb-3 text-left">
                      <div>
                        <span className="block text-[8px] text-[#788394]">Coming up</span>
                        <b className="text-sm font-['Space_Grotesk'] text-[#e5eaf1]">
                          08 <small className="text-[9px] text-[#758191] font-normal">items</small>
                        </b>
                      </div>
                      <div>
                        <span className="block text-[8px] text-[#788394]">Focus time</span>
                        <b className="text-sm font-['Space_Grotesk'] text-[#e5eaf1]">
                          6.5 <small className="text-[9px] text-[#758191] font-normal">hrs</small>
                        </b>
                      </div>
                      <div>
                        <span className="block text-[8px] text-[#788394]">On track</span>
                        <b className="text-sm font-['Space_Grotesk'] text-[#82d6b7]">
                          82<small className="text-[9px] font-normal">%</small>
                        </b>
                      </div>
                      <div>
                        <span className="block text-[8px] text-[#788394] font-mono">WEEKLY LOAD</span>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-1.5">
                          <div className="w-[64%] h-full bg-gradient-to-r from-[#67c7e6] to-[#a594fa] rounded-full" />
                        </div>
                        <span className="text-[8px] text-[#83ceb0] block text-right mt-0.5">Moderate</span>
                      </div>
                    </div>

                    {/* Upcoming Deadlines + Calendar Elements */}
                    <div className="grid grid-cols-12 gap-3 text-left">
                      {/* Upcoming Deadlines list */}
                      <div className="col-span-7 space-y-1.5">
                        <div className="flex items-center justify-between text-[8px] font-mono text-[#8994a5] mb-1">
                          <span>UPCOMING DEADLINES</span>
                          <span className="text-[#8bbcd1]">3 due soon</span>
                        </div>

                        {/* Item 1 */}
                        <div className="p-2 rounded border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#78d3ed] shadow-[0_0_6px_rgba(120,211,238,0.7)] flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium text-[#dce3ec] truncate">
                              Physics lab record
                            </div>
                            <div className="text-[8px] text-[#828d9d]">PHY 204 · Today, 5:00 PM</div>
                          </div>
                          <span className="px-1.5 py-0.5 text-[8px] font-mono rounded border border-[rgba(110,207,233,0.3)] text-[#9fdff1] bg-[rgba(108,190,219,0.1)]">
                            HIGH
                          </span>
                        </div>

                        {/* Item 2 */}
                        <div className="p-2 rounded border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#af9af7] flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium text-[#dce3ec] truncate">
                              Mathematics set 04
                            </div>
                            <div className="text-[8px] text-[#828d9d]">MAT 201 · Oct 1, 11:59 PM</div>
                          </div>
                          <span className="px-1.5 py-0.5 text-[8px] font-mono rounded border border-[rgba(173,151,247,0.3)] text-[#b7a6f6] bg-[rgba(151,127,223,0.1)]">
                            MED
                          </span>
                        </div>

                        {/* Item 3 */}
                        <div className="p-2 rounded border border-[rgba(219,230,244,0.08)] bg-white/[0.015] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#81aef5] flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium text-[#dce3ec] truncate">
                              Electronics revision
                            </div>
                            <div className="text-[8px] text-[#828d9d]">ECE 210 · Oct 4, 9:00 AM</div>
                          </div>
                          <span className="px-1.5 py-0.5 text-[8px] font-mono rounded border border-[rgba(127,175,239,0.25)] text-[#a2bfe9] bg-[rgba(114,151,205,0.08)]">
                            PLAN
                          </span>
                        </div>
                      </div>

                      {/* Calendar snippet */}
                      <div className="col-span-5 border-l border-[rgba(217,229,244,0.065)] pl-3 space-y-2">
                        <div className="flex items-center justify-between text-[8px] font-mono text-[#788597]">
                          <span>SEPTEMBER</span>
                          <span>WEEK 40</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 text-center font-mono text-[7px] text-[#768193]">
                          <div>MON<span className="block mt-1 w-4 h-4 mx-auto rounded-full bg-[#8ad8ed] text-[#0d141c] font-bold text-[8px] flex items-center justify-center">28</span></div>
                          <div>TUE<span className="block mt-1 text-[8px] text-[#cbd3df]">29</span></div>
                          <div>WED<span className="block mt-1 text-[8px] text-[#cbd3df]">30</span></div>
                          <div>THU<span className="block mt-1 text-[8px] text-[#cbd3df]">01</span></div>
                          <div>FRI<span className="block mt-1 text-[8px] text-[#cbd3df]">02</span></div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="text-[8px] px-1.5 py-1 rounded bg-[rgba(92,180,207,0.12)] border border-[rgba(110,196,222,0.25)] text-[#a8e0ef] truncate">
                            Lab record submission
                          </div>
                          <div className="text-[8px] px-1.5 py-1 rounded bg-[rgba(145,124,206,0.12)] border border-[rgba(175,151,236,0.25)] text-[#c7b6fc] truncate">
                            Discrete Maths Set
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Recommendation Card */}
                    <div className="p-2.5 rounded-lg border border-[rgba(142,205,233,0.18)] bg-gradient-to-r from-[rgba(75,144,171,0.12)] to-[rgba(150,133,205,0.08)] flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-[rgba(109,194,227,0.12)] border border-[rgba(126,209,237,0.2)] text-[#9ce4f6] flex items-center justify-center flex-shrink-0">
                        <Sparkles size={12} />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-[9.5px] font-medium text-[#dbe9f0] leading-tight">
                          AI Recommendation: Focus on Physics lab
                        </div>
                        <div className="text-[8px] text-[#8794a5] leading-tight">
                          Highest workload impact · Estimated time 45 min
                        </div>
                      </div>
                      <span className="text-[8px] font-mono text-[#90dece] bg-[#90dece]/10 border border-[#90dece]/25 px-1.5 py-0.5 rounded">
                        94% confidence
                      </span>
                    </div>

                  </div>
                </div>

                {/* Bottom subtle bar */}
                <div className="px-4 py-2 border-t border-[rgba(214,229,247,0.075)] bg-black/20 flex items-center justify-between text-[8px] font-mono text-[#748091]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#75d5b0]" />
                    <span>SYNCHRONIZED WITH SEMESTER CALENDAR</span>
                  </span>
                  <span>PREVIEW ONLY · UNLOCKS WITH CREDENTIALS</span>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Footer info */}
      <footer className="relative z-10 w-full max-w-[1376px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between text-[11px] text-[#647080] font-mono">
        <div>© 2026 DeadlineIQ · Academic planning, intelligently.</div>
        <div className="hidden sm:block">PORTAL V1.0.4 · SECURE ACADEMIC COMMAND</div>
      </footer>
    </motion.div>
  );
}
