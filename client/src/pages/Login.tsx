import { useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  LayoutGrid,
  Sparkles,
  Target,
} from "lucide-react";
import { Link } from "wouter";
import "./login.css";

function LoginBrand() {
  return (
    <Link className="login-brand" href="/" aria-label="DeadlineIQ home">
      <span className="login-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M7 7.5h8.5a8.5 8.5 0 1 1 0 17H7v-17Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 12h4a4 4 0 1 1 0 8h-4v-8Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="24.5" cy="8" r="2.1" fill="#86dcff" />
        </svg>
      </span>
      <span className="login-brand-name">Deadline<span>IQ</span></span>
    </Link>
  );
}

function DashboardPreview() {
  return (
    <aside className="login-preview" aria-label="Decorative DeadlineIQ dashboard preview">
      <div className="preview-glow preview-glow-one" />
      <div className="preview-glow preview-glow-two" />
      <div className="preview-kicker"><span className="login-eyebrow-dot" /> YOUR SEMESTER, IN FOCUS</div>
      <div className="preview-window">
        <div className="preview-topbar">
          <span className="preview-mini-mark">D</span>
          <span className="preview-title">deadline<span>IQ</span></span>
          <span className="preview-breadcrumb">Workspace <ArrowRight size={10} /> Semester 04</span>
          <span className="preview-avatar">R</span>
        </div>
        <div className="preview-layout">
          <div className="preview-sidebar">
            <span className="preview-side-label">WORKSPACE</span>
            <div className="preview-side-item active"><LayoutGrid size={12} /> Overview</div>
            <div className="preview-side-item"><CalendarDays size={12} /> My timeline</div>
            <div className="preview-side-item"><BookOpen size={12} /> Courses</div>
            <div className="preview-side-item"><Target size={12} /> Focus mode</div>
            <div className="preview-user"><span>R</span> Riya Sharma</div>
          </div>
          <div className="preview-main">
            <div className="preview-date">MONDAY, SEPTEMBER 28</div>
            <div className="preview-heading-row"><h2>Your week, in focus<span>.</span></h2><span className="preview-week-pill">This week <ArrowRight size={10} /></span></div>
            <div className="preview-stats">
              <div><small>COMING UP</small><b>08 <i>items</i></b></div>
              <div><small>FOCUS TIME</small><b>6.5 <i>hrs</i></b></div>
              <div><small>ON TRACK</small><b className="preview-green">82<i>%</i></b></div>
            </div>
            <div className="preview-columns">
              <div className="preview-agenda">
                <div className="preview-section-label">UP NEXT <span>View all <ArrowUpRight size={9} /></span></div>
                <div className="preview-deadline"><span className="preview-priority-dot high" /><span><b>Physics lab record</b><small>PHY 204 · Today, 5:00 PM</small></span><i className="preview-tag tag-high">HIGH</i></div>
                <div className="preview-deadline"><span className="preview-priority-dot medium" /><span><b>Mathematics set 04</b><small>MAT 201 · Oct 1, 11:59 PM</small></span><i className="preview-tag tag-medium">MED</i></div>
                <div className="preview-deadline"><span className="preview-priority-dot low" /><span><b>Electronics revision</b><small>ECE 210 · Oct 4, 9:00 AM</small></span><i className="preview-tag tag-low">PLAN</i></div>
              </div>
              <div className="preview-calendar">
                <div className="preview-section-label">SEPTEMBER <span>WEEK 40</span></div>
                <div className="preview-days"><span>MON<b>28</b></span><span>TUE<b>29</b></span><span>WED<b>30</b></span><span>THU<b>01</b></span><span>FRI<b>02</b></span></div>
                <div className="preview-events"><i /><i /><i /></div>
                <div className="preview-event-block block-cyan">Lab record</div>
                <div className="preview-event-block block-violet">Maths set</div>
              </div>
            </div>
            <div className="preview-recommendation">
              <span className="preview-ai-icon"><Sparkles size={13} /></span>
              <span><b>One clear next step</b><small>Start Physics now. You’ll need about 45 min.</small></span>
              <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </div>
      <div className="preview-float preview-float-notice"><span><FileText size={14} /></span><span><b>Notice scanned</b><small>3 deadlines found</small></span><Check size={13} /></div>
      <div className="preview-float preview-float-focus"><span><Clock3 size={13} /></span><span>Due in <b>18 hours</b></span><Bell size={12} /></div>
      <div className="preview-caption"><span className="login-eyebrow-dot" /> A LITTLE MORE ROOM TO THINK</div>
      <div className="preview-edge-arrow"><ArrowDownRight size={16} /></div>
    </aside>
  );
}

export default function Login() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();

  return (
    <main className="login-shell">
      <div className="login-backdrop" aria-hidden="true" />
      <header className="login-topbar"><LoginBrand /><span className="login-top-note"><span className="login-eyebrow-dot" /> ACADEMIC PLANNING, INTELLIGENTLY</span></header>
      <div className="login-main">
        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-card-orb" aria-hidden="true"><span /><span /></div>
          <div className="login-card-content">
            <span className="login-eyebrow"><i /> YOUR SEMESTER, IN SYNC</span>
            <h1 id="login-heading">Welcome back<span>.</span></h1>
            <p className="login-subheading">Your academic command center is ready.</p>
            <form className="login-form" onSubmit={handleSubmit}>
              <label className="login-field-label" htmlFor="usn">USN</label>
              <div className="login-input-wrap">
                <span className="login-input-index">01</span>
                <input id="usn" name="usn" type="text" placeholder="Enter your university seat number" autoComplete="username" required />
                <span className="login-field-indicator" aria-hidden="true" />
              </div>
              <label className="login-field-label password-label" htmlFor="password">PASSWORD</label>
              <div className="login-input-wrap">
                <span className="login-input-index">02</span>
                <input id="password" name="password" type={passwordVisible ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" required />
                <button className="password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible}>
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button className="login-submit" type="submit"><span>Enter DeadlineIQ</span><ArrowRight size={16} strokeWidth={1.8} /><i className="login-submit-glint" /></button>
            </form>
            <div className="login-demo-note"><span className="login-demo-icon"><Sparkles size={13} /></span><span>Demo account available for the hackathon</span></div>
            <div className="login-card-divider"><span /><i>OR</i><span /></div>
            <Link className="login-back-link" href="/"><ArrowLeft size={14} /> Back to DeadlineIQ</Link>
            <div className="login-card-foot"><span>SECURE STUDENT ACCESS</span><span><i /> ENCRYPTED SESSION</span></div>
          </div>
        </section>
        <DashboardPreview />
      </div>
      <footer className="login-footer"><span>© 2026 DeadlineIQ · Built for students.</span><span>LESS SCRAMBLING. MORE SEMESTER.</span></footer>
    </main>
  );
}
