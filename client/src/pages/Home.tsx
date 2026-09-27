import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  LayoutGrid,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  ScanLine,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";

type LogoProps = { compact?: boolean };

function Logo({ compact = false }: LogoProps) {
  return (
    <a className={`brand${compact ? " brand-compact" : ""}`} href="#top" aria-label="DeadlineIQ home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M7 7.5h8.5a8.5 8.5 0 1 1 0 17H7v-17Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 12h4a4 4 0 1 1 0 8h-4v-8Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="24.5" cy="8" r="2.1" fill="#86dcff" />
        </svg>
      </span>
      <span className="brand-name">Deadline<span>IQ</span></span>
    </a>
  );
}

type MagneticLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  arrow?: boolean;
  onClick?: () => void;
};

function MagneticLink({ href, children, className = "", arrow = false, onClick }: MagneticLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const handleMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch" || !linkRef.current) return;
    const rect = linkRef.current.getBoundingClientRect();
    const dx = (event.clientX - rect.left - rect.width / 2) * 0.08;
    const dy = (event.clientY - rect.top - rect.height / 2) * 0.1;
    linkRef.current.style.setProperty("--mx", `${dx}px`);
    linkRef.current.style.setProperty("--my", `${dy}px`);
  };
  const handleLeave = () => {
    linkRef.current?.style.setProperty("--mx", "0px");
    linkRef.current?.style.setProperty("--my", "0px");
  };
  return (
    <a
      ref={linkRef}
      className={`magnetic-link ${className}`}
      href={href}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onClick={onClick}
    >
      <span>{children}</span>
      {arrow && <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" />}
    </a>
  );
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add("is-visible");
          observer.unobserve(node);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="nav-shell">
        <Logo />
        <nav className={`nav-links${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="#product" onClick={closeMenu}>Product</a>
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a className="nav-mobile-login" href="#get-started" onClick={closeMenu}>Log in <ArrowUpRight size={14} /></a>
        </nav>
        <div className="nav-actions">
          <a className="nav-login" href="#get-started">Log in</a>
          <a className="nav-cta" href="#get-started">Get started <ArrowUpRight size={14} /></a>
        </div>
        <button
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}

function HeroInterface() {
  return (
    <div className="hero-visual" aria-label="Preview of the DeadlineIQ student planner">
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="hero-orbit orbit-three" />
      <div className="hero-datapoint point-one" />
      <div className="hero-datapoint point-two" />
      <div className="hero-datapoint point-three" />
      <div className="float-note float-note-pdf"><span className="note-icon purple"><FileText size={15} /></span><span><b>Notice scanned</b><small>3 deadlines found</small></span><CheckCircle2 size={15} className="note-check" /></div>
      <div className="float-note float-note-priority"><span className="priority-spark"><Sparkles size={15} /></span><span><b>Priority updated</b><small>Physics lab · 92/100</small></span></div>
      <div className="float-note float-note-time"><Clock3 size={14} /><span>Due in <b>18 hours</b></span></div>
      <div className="product-window">
        <div className="window-topbar">
          <div className="window-brand"><span className="mini-mark">D</span><span>deadline<span>IQ</span></span></div>
          <div className="window-crumb">Workspace <ChevronRight size={11} /> Semester 04</div>
          <div className="window-avatars"><i>R</i><i>M</i><i className="avatar-add">+</i></div>
        </div>
        <div className="window-body">
          <aside className="window-sidebar">
            <span className="sidebar-label">WORKSPACE</span>
            <div className="sidebar-item active"><LayoutGrid size={13} /> Overview</div>
            <div className="sidebar-item"><CalendarDays size={13} /> My timeline <span className="sidebar-count">8</span></div>
            <div className="sidebar-item"><BookOpen size={13} /> Courses</div>
            <div className="sidebar-item"><Target size={13} /> Focus mode</div>
            <div className="sidebar-bottom"><span className="sidebar-avatar">R</span><span>Riya Sharma<small>Student plan</small></span><MoreHorizontal size={14} /></div>
          </aside>
          <div className="window-content">
            <div className="window-heading">
              <div><div className="window-date">MONDAY, SEPTEMBER 28</div><h3>Your week, in focus<span>.</span></h3></div>
              <button className="window-period">This week <ChevronRight size={12} /></button>
            </div>
            <div className="window-stats">
              <div className="window-stat"><span>Coming up</span><b>08 <small>items</small></b></div>
              <div className="window-stat"><span>Focus time</span><b>6.5 <small>hrs</small></b></div>
              <div className="window-stat"><span>On track</span><b className="stat-green">82<small>%</small></b></div>
              <div className="mini-progress"><span>WEEKLY LOAD</span><div className="progress-track"><i /></div><small>Moderate</small></div>
            </div>
            <div className="window-columns">
              <div className="window-agenda">
                <div className="agenda-head"><span>UP NEXT</span><a href="#planner">View all <ArrowUpRight size={11} /></a></div>
                <div className="agenda-row urgent"><i className="agenda-dot cyan-dot" /><div><b>Physics lab record</b><small>PHY 204 <span>·</span> Today, 5:00 PM</small></div><span className="agenda-tag tag-high">HIGH</span></div>
                <div className="agenda-row"><i className="agenda-dot violet-dot" /><div><b>Mathematics set 04</b><small>MAT 201 <span>·</span> Oct 1, 11:59 PM</small></div><span className="agenda-tag tag-medium">MED</span></div>
                <div className="agenda-row"><i className="agenda-dot blue-dot" /><div><b>Electronics revision</b><small>ECE 210 <span>·</span> Oct 4, 9:00 AM</small></div><span className="agenda-tag tag-low">PLAN</span></div>
              </div>
              <div className="window-week">
                <div className="week-head"><span>SEPTEMBER</span><span>WEEK 40</span></div>
                <div className="week-days"><span>MON<small>28</small></span><span>TUE<small>29</small></span><span>WED<small>30</small></span><span>THU<small>01</small></span><span>FRI<small>02</small></span></div>
                <div className="week-ticks"><i /><i /><i /><i /><i /></div>
                <div className="week-event event-a">Lab record</div>
                <div className="week-event event-b">Maths set</div>
                <div className="week-event event-c">Review</div>
              </div>
            </div>
            <div className="ai-insight"><span className="insight-icon"><Sparkles size={14} /></span><span><b>One clear next step</b><small>Start Physics now. You’ll need about 45 min.</small></span><ArrowRight size={14} /></div>
          </div>
        </div>
      </div>
      <div className="hero-visual-caption"><span className="caption-live" /> LIVE SEMESTER OVERVIEW <span className="caption-separator">/</span> 04 TASKS ORGANIZED</div>
    </div>
  );
}

function Transformation() {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cards = Array.from(section.querySelectorAll<HTMLElement>(".journey-card"));
    const board = section.querySelector<HTMLElement>(".journey-board");
    const orb = section.querySelector<HTMLElement>(".processing-orb");
    const phase = section.querySelector<HTMLElement>(".journey-phase");
    let frame = 0;
    let lastPhase = "";
    const update = () => {
      frame = 0;
      const maxScroll = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = reduceMotion ? 1 : Math.max(0, Math.min(1, -section.getBoundingClientRect().top / maxScroll));
      const eased = progress * progress * (3 - 2 * progress);
      cards.forEach((card) => {
        const x = Number(card.dataset.ox || 0) * (1 - eased);
        const y = Number(card.dataset.oy || 0) * (1 - eased);
        const rotate = Number(card.dataset.rotate || 0) * (1 - eased);
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)`;
        card.style.filter = `blur(${(1 - eased) * 1.5}px)`;
      });
      if (board) {
        const boardProgress = Math.max(0, Math.min(1, (progress - 0.25) / 0.66));
        const boardEase = boardProgress * boardProgress * (3 - 2 * boardProgress);
        board.style.opacity = String(0.12 + boardEase * 0.88);
        board.style.transform = `translate3d(0, ${(1 - boardEase) * 38}px, 0) scale(${0.94 + boardEase * 0.06})`;
        board.style.filter = `blur(${(1 - boardEase) * 9}px)`;
      }
      if (orb) {
        const orbProgress = Math.max(0, Math.min(1, (progress - 0.08) / 0.58));
        orb.style.opacity = String(Math.sin(orbProgress * Math.PI) * 0.88);
        orb.style.transform = `translate(-50%, -50%) scale(${0.88 + orbProgress * 0.16})`;
      }
      const label = progress < 0.2 ? "SCATTERED INPUT" : progress < 0.49 ? "READING THE SIGNAL" : progress < 0.76 ? "PRIORITY LOCKED" : "YOUR PLAN, IN FOCUS";
      if (phase && label !== lastPhase) {
        phase.textContent = label;
        lastPhase = label;
      }
      section.style.setProperty("--journey-progress", String(progress));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <section className="journey-section" id="product" ref={sectionRef} aria-label="How DeadlineIQ transforms information into a plan">
      <div className="journey-sticky">
        <div className="journey-inner">
          <div className="journey-heading">
            <span className="eyebrow"><span className="eyebrow-line" /> THE DEADLINEIQ DIFFERENCE</span>
            <h2>From scattered<br />to <span className="text-gradient">sorted.</span></h2>
            <p>Watch a semester find its rhythm.</p>
          </div>
          <div className="journey-stage">
            <div className="journey-grid" />
            <div className="processing-orb"><span className="orb-ring" /><span className="orb-ring ring-two" /><span className="orb-core"><Sparkles size={22} /></span><small>UNDERSTANDING</small></div>
            <div className="journey-card card-physics" data-ox="-88" data-oy="-100" data-rotate="-13"><span className="journey-card-symbol symbol-cyan"><FileText size={16} /></span><span><b>Physics lab record</b><small>PDF notice · 2 pages</small></span><span className="journey-card-meta">SEP 29</span></div>
            <div className="journey-card card-maths" data-ox="104" data-oy="-116" data-rotate="11"><span className="journey-card-symbol symbol-purple"><MessageCircle size={16} /></span><span><b>Maths assignment</b><small>Class group message</small></span><span className="journey-card-meta">OCT 01</span></div>
            <div className="journey-card card-exam" data-ox="-116" data-oy="92" data-rotate="9"><span className="journey-card-symbol symbol-orange"><CalendarDays size={16} /></span><span><b>Electronics IA</b><small>Classroom announcement</small></span><span className="journey-card-meta">OCT 04</span></div>
            <div className="journey-card card-project" data-ox="126" data-oy="97" data-rotate="-11"><span className="journey-card-symbol symbol-blue"><BookOpen size={16} /></span><span><b>Group project review</b><small>Shared course notes</small></span><span className="journey-card-meta">OCT 06</span></div>
            <div className="journey-board">
              <div className="journey-board-top"><span className="board-kicker"><span className="caption-live" /> TODAY · MON, SEP 28</span><span className="board-day">Your plan <ArrowUpRight size={13} /></span></div>
              <div className="journey-plan-row"><span className="plan-time">4:00</span><i className="plan-line cyan-line" /><div><b>Physics lab record</b><small>45 min · Focus block</small></div><span className="plan-priority">92</span></div>
              <div className="journey-plan-row"><span className="plan-time">5:45</span><i className="plan-line violet-line" /><div><b>Reset & recharge</b><small>30 min · Break</small></div><Check size={14} className="plan-check" /></div>
              <div className="journey-plan-row"><span className="plan-time">6:15</span><i className="plan-line blue-line" /><div><b>Mathematics assignment</b><small>60 min · Deep work</small></div><span className="plan-priority plan-priority-medium">67</span></div>
              <div className="journey-ai-note"><Sparkles size={14} /><span>Physics comes first: closest deadline, highest workload.</span></div>
            </div>
          </div>
          <div className="journey-footer"><span className="journey-phase">SCATTERED INPUT</span><div className="journey-progress"><span /></div><span className="journey-step">SCROLL TO EXPLORE <ArrowDown size={13} /></span></div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="section problem-section" id="about">
      <div className="section-shell problem-layout">
        <Reveal className="problem-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> THE EVERYDAY MESS</span>
          <h2>College information<br />is <span className="text-gradient">everywhere.</span></h2>
          <p>One deadline in a class group. Another buried in a 12-page PDF. A third mentioned at the end of a lecture you almost forgot to write down.</p>
          <p className="problem-emphasis">It’s not that you’re disorganized.<br /><strong>The system is.</strong></p>
          <a className="text-link" href="#how-it-works">Meet your new system <ArrowRight size={15} /></a>
        </Reveal>
        <Reveal className="source-visual" delay={120}>
          <div className="source-lines"><i /><i /><i /><i /></div>
          <div className="source-card source-whatsapp"><span className="source-icon whatsapp"><MessageCircle size={15} /></span><span><small>CLASS GROUP · 9:42 AM</small><b>Reminder: lab record is due Tuesday!</b></span><span className="source-unread" /></div>
          <div className="source-card source-pdf"><span className="source-icon pdf"><FileText size={15} /></span><span><small>DEPT. OF PHYSICS · PDF</small><b>Internal assessment schedule</b></span><span className="pdf-pages">2 pages</span></div>
          <div className="source-card source-class"><span className="source-icon class"><BookOpen size={15} /></span><span><small>CLASSROOM · ECE 210</small><b>Project review moved to Oct 6</b></span></div>
          <div className="source-card source-calendar"><span className="source-icon calendar"><CalendarDays size={15} /></span><span><small>STUDENT PORTAL</small><b>Mid-semester exam timetable</b></span></div>
          <div className="source-card source-event"><span className="source-icon event"><Bell size={15} /></span><span><small>CLUB ANNOUNCEMENT</small><b>Registration closes this week</b></span></div>
          <div className="source-core"><span className="source-core-glow" /><span className="source-core-mark">D<span>IQ</span></span><b>One clear timeline</b><small>everything, finally connected</small></div>
          <div className="source-caption"><span className="caption-live" /> FROM SIX SOURCES TO ONE PLAN</div>
        </Reveal>
      </div>
      <div className="section-edge-label">01 <span>INFORMATION OVERLOAD</span></div>
    </section>
  );
}

const extractedDeadlines = [
  { title: "Physics Lab Record", date: "29 September", time: "5:00 PM", priority: "High", color: "cyan" },
  { title: "Mathematics Assignment", date: "1 October", time: "11:59 PM", priority: "Medium", color: "violet" },
  { title: "Electronics Internal Assessment", date: "4 October", time: "9:00 AM", priority: "High", color: "blue" },
];

function ExtractionSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("internal-assessment-notice.pdf");
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanned, setIsScanned] = useState(true);
  const selectFile = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setIsScanned(false);
    setIsScanning(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };
  const startScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    setIsScanned(false);
    window.setTimeout(() => {
      setIsScanning(false);
      setIsScanned(true);
    }, 1450);
  };
  return (
    <section className="section extraction-section" id="how-it-works">
      <div className="section-shell">
        <Reveal className="section-intro centered-intro">
          <span className="eyebrow"><span className="eyebrow-line" /> BUILT TO NOTICE THE DETAILS</span>
          <h2>Give it information.<br /><span className="text-gradient">It finds what matters.</span></h2>
          <p>Drop in the things you already receive. DeadlineIQ spots the dates, decodes the urgency, and gives each one a place in your plan.</p>
        </Reveal>
        <Reveal className="extract-workbench" delay={100}>
          <div className="workbench-top"><div className="workbench-label"><span className="workbench-dot" /> INTELLIGENCE ENGINE <span className="workbench-version">BETA 0.9</span></div><div className="workbench-step">01 <span>/</span> 03 &nbsp; Extract</div></div>
          <div className="workbench-body">
            <div className="upload-column">
              <div
                className={`dropzone${isDragging ? " is-dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Choose or drop an academic notice"
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
              >
                <input ref={inputRef} className="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx" onChange={(event) => selectFile(event.target.files?.[0])} />
                <span className="upload-illustration"><span className="upload-illustration-grid" /><FileText size={26} strokeWidth={1.4} /><i><Upload size={13} /></i></span>
                <b>Drop a notice to begin</b>
                <span className="dropzone-caption">PDF, screenshot, doc or plain text</span>
                <span className="dropzone-browse">Browse files <ArrowUpRight size={12} /></span>
                <span className="dropzone-trust"><CheckCircle2 size={11} /> Private by design</span>
              </div>
              <div className="supported-sources"><span>OR CONNECT A SOURCE</span><div><span><MessageCircle size={13} /> Class group</span><span><Paperclip size={13} /> Paste a link</span></div></div>
            </div>
            <div className="extract-arrow"><ArrowRight size={18} /><span>UNDERSTAND</span></div>
            <div className="document-column">
              <div className="document-preview">
                <div className="doc-topline"><span><FileText size={12} /> {fileName}</span><span className="doc-page-count">PDF · 2 PAGES</span></div>
                <div className={`document-page${isScanning ? " is-scanning" : ""}`}>
                  <div className="document-header"><small>DEPARTMENT OF PHYSICS</small><b>Internal Assessment<br />Schedule</b><span>Academic year 2026—27</span></div>
                  <div className="document-rule" />
                  <span className="doc-section-label">IMPORTANT DATES</span>
                  <div className="doc-text-row"><i /> Lab record submission</div>
                  <div className="doc-text-row marked"><i /> Due Tuesday, 29 September · 5 PM</div>
                  <div className="doc-text-row"><i /> Mid-term practical examination</div>
                  <div className="doc-text-row marked"><i /> Internal assessment · 4 October</div>
                  <div className="doc-text-row"><i /> Please contact your course coordinator</div>
                  {isScanning && <div className="scan-line"><span /></div>}
                  {!isScanning && isScanned && <div className="scan-complete"><Check size={12} /> DATES IDENTIFIED</div>}
                </div>
                <div className="doc-ai-chip"><span className="ai-chip-icon"><Sparkles size={12} /></span><span><b>{isScanning ? "Reading your notice…" : isScanned ? "3 deadlines detected" : "Ready to scan"}</b><small>{isScanning ? "Finding dates and context" : isScanned ? "Dates, courses & priority matched" : "A quick scan finds the important bits"}</small></span><span className="ai-chip-spark" /></div>
              </div>
              <button className={`scan-button${isScanning ? " is-busy" : ""}`} onClick={startScan} disabled={isScanning}>
                {isScanning ? <><span className="button-spinner" /> Scanning notice…</> : <><ScanLine size={15} /> {isScanned ? "Scan another notice" : "Extract deadlines"} <ArrowRight size={14} /></>}
              </button>
            </div>
            <div className="extract-arrow second-arrow"><ArrowRight size={18} /><span>ORGANIZE</span></div>
            <div className="results-column">
              <div className="results-header"><span>EXTRACTED DEADLINES</span><span className="results-count">03 FOUND</span></div>
              <div className="extracted-list">
                {extractedDeadlines.map((item, index) => (
                  <div className={`extracted-item${isScanning || !isScanned ? " is-muted" : ""}`} key={item.title} style={{ transitionDelay: `${index * 70}ms` }}>
                    <span className={`extract-dot ${item.color}`} />
                    <span className="extract-item-copy"><b>{item.title}</b><small><CalendarDays size={11} /> {item.date} <span>·</span> {item.time}</small></span>
                    <span className={`extract-priority ${item.color}`}>{item.priority}</span>
                  </div>
                ))}
              </div>
              <div className="extraction-confidence"><span className="confidence-check"><Check size={12} /></span><span><b>Context understood</b><small>Course, date & urgency confirmed</small></span><span className="confidence-score">98%</span></div>
              <span className="manual-note">You’re always in control. Review before adding.</span>
            </div>
          </div>
          <div className="workbench-bottom"><span><span className="caption-live" /> PROCESSING HAPPENS IN SECONDS</span><span>PDF &nbsp;·&nbsp; IMAGE &nbsp;·&nbsp; TEXT</span></div>
        </Reveal>
      </div>
      <div className="section-edge-label">02 <span>AI EXTRACTION</span></div>
    </section>
  );
}

const priorityRows = [
  { name: "Physics Lab Record", course: "PHY 204", score: 92, tag: "Act today", color: "cyan", time: "18h left", factors: ["Deadline", "Workload"] },
  { name: "Mathematics Assignment", course: "MAT 201", score: 67, tag: "This week", color: "violet", time: "3d left", factors: ["Workload"] },
  { name: "Electronics IA", course: "ECE 210", score: 54, tag: "Coming up", color: "blue", time: "6d left", factors: ["Importance"] },
];

function PrioritySection() {
  return (
    <section className="section priority-section" id="features">
      <div className="section-shell">
        <div className="priority-layout">
          <Reveal className="priority-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> PRIORITY, WITH CONTEXT</span>
            <h2>Not every deadline<br />deserves the <span className="text-gradient">same urgency.</span></h2>
            <p>A due date is only part of the story. We weigh the time left, the work involved and what the deadline means—so your next step feels obvious.</p>
            <div className="factor-pills"><span><Clock3 size={13} /> Time remaining</span><span><Zap size={13} /> Estimated effort</span><span><Target size={13} /> Course importance</span><span><CalendarDays size={13} /> Schedule conflicts</span></div>
          </Reveal>
          <Reveal className="priority-console" delay={120}>
            <div className="priority-console-top"><span><span className="console-led" /> PRIORITY ENGINE</span><span>WEIGHTED SIGNALS <MoreHorizontal size={15} /></span></div>
            <div className="priority-console-heading"><div><small>YOUR UPCOMING WORK</small><h3>What needs you first?</h3></div><span className="console-filter">All courses <ChevronRight size={11} /></span></div>
            <div className="priority-list">
              {priorityRows.map((row, index) => (
                <div className="priority-row" key={row.name}>
                  <span className={`priority-rank rank-${row.color}`}>0{index + 1}</span>
                  <span className={`priority-course-icon icon-${row.color}`}>{index === 0 ? <FileText size={15} /> : index === 1 ? <BookOpen size={15} /> : <CalendarDays size={15} />}</span>
                  <span className="priority-task"><b>{row.name}</b><small>{row.course} <i>·</i> <span>{row.time}</span></small></span>
                  <span className="score-track"><i className={`score-fill fill-${row.color}`} style={{ width: `${row.score}%`, transitionDelay: `${index * 110}ms` }} /></span>
                  <span className={`priority-score score-${row.color}`}>{row.score}<small>/100</small></span>
                  <span className={`priority-tag tag-${row.color}`}>{row.tag}</span>
                </div>
              ))}
            </div>
            <div className="priority-reason"><span className="reason-spark"><Sparkles size={14} /></span><span><b>Why is Physics first?</b><small>Closest due date <i>+</i> highest estimated workload</small></span><div className="reason-bars"><i /><i /><i /></div><ArrowUpRight size={14} /></div>
            <div className="engine-factor-row"><span>TIME REMAINING <b>32%</b><i><em style={{ width: "32%" }} /></i></span><span>ESTIMATED EFFORT <b>40%</b><i><em style={{ width: "40%" }} /></i></span><span>COURSE WEIGHT <b>28%</b><i><em style={{ width: "28%" }} /></i></span></div>
          </Reveal>
        </div>
      </div>
      <div className="section-edge-label">03 <span>INTELLIGENT PRIORITIZATION</span></div>
    </section>
  );
}

function PlannerSection() {
  return (
    <section className="section planner-section" id="planner">
      <div className="section-shell planner-layout">
        <Reveal className="planner-visual">
          <div className="planner-window">
            <div className="planner-window-header"><span className="planner-window-title"><CalendarDays size={14} /> TODAY'S PLAN</span><span className="planner-window-date">MON · SEP 28 <ChevronRight size={12} /></span></div>
            <div className="planner-summary"><span>Make room for what matters.</span><small>3 focus blocks <i>·</i> 2h 15m planned</small></div>
            <div className="planner-timeline">
              <div className="planner-time-label">4:00</div><div className="timeline-rail"><i className="rail-node node-cyan" /></div><div className="planner-event event-highlight"><span className="event-course-mark cyan-mark">PHY</span><span className="event-copy"><b>Physics lab record</b><small>Focus block <i>·</i> Lab 3</small></span><span className="event-duration">45 min</span><ArrowUpRight size={13} /></div>
              <div className="planner-time-label">5:45</div><div className="timeline-rail"><i className="rail-node node-purple" /></div><div className="planner-event event-break"><span className="event-course-mark break-mark">✳</span><span className="event-copy"><b>Reset & recharge</b><small>A little room to breathe</small></span><span className="event-duration">30 min</span><CheckCircle2 size={13} /></div>
              <div className="planner-time-label">6:15</div><div className="timeline-rail"><i className="rail-node node-blue" /></div><div className="planner-event"><span className="event-course-mark blue-mark">MAT</span><span className="event-copy"><b>Mathematics assignment</b><small>Problem set 04 <i>·</i> Library</small></span><span className="event-duration">60 min</span><MoreHorizontal size={14} /></div>
              <div className="planner-time-label">7:30</div><div className="timeline-rail last-rail"><i className="rail-node node-violet" /></div><div className="planner-event"><span className="event-course-mark violet-mark">ECE</span><span className="event-copy"><b>Electronics revision</b><small>Review lecture notes</small></span><span className="event-duration">30 min</span><MoreHorizontal size={14} /></div>
            </div>
            <div className="planner-window-footer"><span><span className="caption-live" /> YOUR DAY IS LOOKING GOOD</span><button>Adjust plan <ArrowUpRight size={12} /></button></div>
          </div>
          <div className="planner-ai-float"><span className="planner-ai-icon"><Sparkles size={14} /></span><span><small>A THOUGHT FROM YOUR AI</small><b>Physics goes first—it's due soon and needs the most time.</b></span><span className="ai-float-dot" /></div>
        </Reveal>
        <Reveal className="planner-copy" delay={90}>
          <span className="eyebrow"><span className="eyebrow-line" /> A PLAN THAT FITS REAL LIFE</span>
          <h2>Don’t just know<br />what’s due. Know<br /><span className="text-gradient">what’s next.</span></h2>
          <p>A realistic day, not an impossible to-do list. DeadlineIQ makes space for deep work, breaks and everything else your semester asks of you.</p>
          <div className="planner-quote"><span className="quote-rule" /><p>“Physics is prioritized because it has the shortest remaining time and highest estimated workload.”</p><small><Sparkles size={12} /> YOUR PLAN, EXPLAINED</small></div>
        </Reveal>
      </div>
      <div className="section-edge-label">04 <span>YOUR PERSONALIZED PLANNER</span></div>
    </section>
  );
}

const weekBars = [
  { day: "M", amount: 43 }, { day: "T", amount: 68 }, { day: "W", amount: 54 }, { day: "T", amount: 82, peak: true }, { day: "F", amount: 38 }, { day: "S", amount: 22 }, { day: "S", amount: 31 },
];

function RiskSection() {
  return (
    <section className="section risk-section" id="risk">
      <div className="section-shell">
        <div className="risk-heading-row">
          <Reveal className="risk-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> A LITTLE PERSPECTIVE</span>
            <h2>See academic pressure<br />before it becomes <span className="text-gradient">a problem.</span></h2>
            <p>Your workload, in context. A gentler way to know when it’s time to start early, ask for help, or take a breath.</p>
          </Reveal>
          <Reveal className="risk-status" delay={100}>
            <div className="risk-status-top"><span><Target size={14} /> SEMESTER PULSE</span><span>UPDATED JUST NOW <i /></span></div>
            <div className="risk-meter"><div className="meter-arc"><i /><span>MODERATE</span><b>62<small>/100</small></b></div><div className="meter-scale"><span>LOW</span><i /><i className="scale-active" /><i /><span>HIGH</span></div><div className="risk-guidance"><span className="guidance-check"><Check size={12} /></span><span><b>You’ve got time to stay on track.</b><small>One deadline could use an early start.</small></span></div></div>
          </Reveal>
        </div>
        <div className="risk-dashboard-grid">
          <Reveal className="risk-metric-card metric-deadlines">
            <div className="metric-top"><span>COMING UP</span><span className="metric-icon icon-cyan"><CalendarDays size={14} /></span></div>
            <div className="metric-main"><b>08</b><span>deadlines in 14 days</span></div>
            <div className="metric-foot"><span className="metric-change">+2</span><span>from last week</span><div className="sparkline"><i style={{ height: "44%" }} /><i style={{ height: "65%" }} /><i style={{ height: "48%" }} /><i style={{ height: "76%" }} /><i style={{ height: "57%" }} /><i style={{ height: "86%" }} /><i style={{ height: "65%" }} /><i style={{ height: "100%" }} /></div></div>
          </Reveal>
          <Reveal className="risk-metric-card metric-overload" delay={60}>
            <div className="metric-top"><span>OVERLOAD CHECK</span><span className="metric-icon icon-violet"><Zap size={14} /></span></div>
            <div className="metric-main"><b className="metric-good">Manageable</b></div>
            <p>No heavy collision this week. Friday stays yours.</p>
            <div className="overload-track"><i /><span>WEEKLY CAPACITY <b>64%</b></span></div>
          </Reveal>
          <Reveal className="risk-metric-card metric-workload" delay={120}>
            <div className="metric-top"><span>YOUR WEEKLY LOAD</span><span className="metric-icon icon-blue"><Clock3 size={14} /></span></div>
            <div className="weekly-total"><b>11.5</b><span>hours estimated</span><small>THIS WEEK <ChevronRight size={11} /></small></div>
            <div className="week-bars">{weekBars.map((bar, index) => <span className={bar.peak ? "bar-peak" : ""} key={`${bar.day}-${index}`} style={{ height: `${bar.amount}%` }}><i>{bar.day}</i></span>)}</div>
          </Reveal>
          <Reveal className="risk-metric-card metric-subjects" delay={180}>
            <div className="metric-top"><span>NEEDS A LITTLE LOVE</span><span className="metric-icon icon-orange"><Bell size={14} /></span></div>
            <div className="subject-risk"><span className="subject-icon phy-subject">PHY</span><span><b>Physics</b><small>2 upcoming <i>·</i> 4.5h work</small></span><span className="subject-alert">SOON</span></div>
            <div className="subject-risk"><span className="subject-icon ece-subject">ECE</span><span><b>Electronics</b><small>1 upcoming <i>·</i> 2h work</small></span><span className="subject-normal">ON TRACK</span></div>
          </Reveal>
        </div>
        <div className="completion-strip"><div className="completion-left"><span className="completion-ring"><Check size={14} /></span><span><b>You’re building good momentum</b><small>Small progress counts. Keep showing up.</small></span></div><div className="completion-right"><div className="completion-label"><span>COMPLETED THIS MONTH</span><b>68%</b></div><div className="completion-track"><i /></div></div></div>
      </div>
      <div className="section-edge-label">05 <span>RISK RADAR</span></div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-section" id="get-started">
      <div className="final-orbit final-orbit-a" /><div className="final-orbit final-orbit-b" /><div className="final-orbit final-orbit-c" />
      <div className="final-content">
        <Reveal className="final-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> YOUR SEMESTER, BACK IN YOUR HANDS</span>
          <h2>Take control<br />of your <span className="text-gradient">semester.</span></h2>
          <p>DeadlineIQ turns academic chaos into a plan you can actually follow.</p>
          <MagneticLink href="#top" className="button-primary final-button" arrow>Enter DeadlineIQ <ArrowRight size={15} /></MagneticLink>
          <span className="final-caption"><span className="caption-live" /> BUILT FOR STUDENTS. READY FOR WHAT’S NEXT.</span>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand"><Logo compact /><span>AI-powered academic planning.<br />A little more room to think.</span></div>
        <div className="footer-links"><a href="#product">Product</a><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a></div>
        <div className="footer-bottom"><span>© 2026 DeadlineIQ · Built for students.</span><span>LESS SCRAMBLING. MORE SEMESTER.</span></div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="site-shell" id="top">
      <Header />
      <main>
        <section className="hero-section">
          <div className="hero-atmosphere" aria-hidden="true" />
          <div className="hero-crosshair crosshair-a" /><div className="hero-crosshair crosshair-b" />
          <div className="hero-main">
            <div className="hero-copy">
              <div className="announcement-pill"><span className="announce-spark"><Sparkles size={12} /></span> YOUR SEMESTER, FINALLY IN SYNC <ArrowRight size={12} /></div>
              <h1>Your deadlines.<br /><span>Handled by<br className="mobile-break" /> <em>intelligence.</em></span></h1>
              <p>Turn scattered notices, assignments and academic announcements into a personalized plan that tells you exactly what to do next.</p>
              <div className="hero-actions"><MagneticLink href="#get-started" className="button-primary" arrow>Enter DeadlineIQ</MagneticLink><a href="#how-it-works" className="button-secondary"><span className="play-icon"><ArrowDown size={13} /></span> See how it works</a></div>
              <div className="hero-proof"><span className="proof-avatars"><i>R</i><i>M</i><i>A</i><i>+</i></span><span><b>Less “I forgot.”</b><small>More “I’ve got this.”</small></span><span className="proof-divider" /><span className="proof-note"><span className="caption-live" /> MADE FOR THE WAY COLLEGE WORKS</span></div>
            </div>
            <HeroInterface />
          </div>
          <div className="hero-bottom"><span><i>01</i> / THE NEW SEMESTER OS</span><a href="#product">SCROLL TO SEE HOW IT WORKS <ArrowDown size={12} /></a><span>BUILT FOR THE IN-BETWEEN MOMENTS</span></div>
        </section>
        <Transformation />
        <ProblemSection />
        <ExtractionSection />
        <PrioritySection />
        <PlannerSection />
        <RiskSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
