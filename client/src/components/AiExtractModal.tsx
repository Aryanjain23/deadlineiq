import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import {
  X,
  Upload,
  FileText,
  Sparkles,
  Check,
  AlertCircle,
  Info,
  Calendar,
  Clock,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Edit3,
  Bot,
  Flame,
  FileCheck,
  Trash2,
} from "lucide-react";
import {
  getNextClassForSubject,
  type TimetableEntry,
  type NextClassResult,
} from "@/lib/timetable";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import { nanoid } from "nanoid";

interface AiExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  timetable?: TimetableEntry[];
  onAddDeadline?: (deadline: Deadline) => void;
  onOpenManualModal?: () => void;
}

export type DateSourceType = "ai-extracted" | "timetable-inferred" | "user-entered";

export interface CandidateDeadline {
  id: string;
  taskName: string;
  subject: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  importance: ImportanceLevel;
  description: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  geminiReasoning: string;
  dateSourceType: DateSourceType;
  timetableMatch?: NextClassResult;
  isSaved?: boolean;
}

const SAMPLE_NOTICES = [
  {
    label: "Physics: Next Class Notice",
    text: "Physics PHY101 Notice: Complete Chapter 4 numerical problems and error calculations. Submit in next class.",
  },
  {
    label: "Maths: Explicit Date Notice",
    text: "Mathematics MAT102: Tutorial Sheet 3 solutions must be submitted on October 8, 2026 before 17:00.",
  },
  {
    label: "Electronics: Next Lab Notice",
    text: "Electronics: Complete operational amplifier LTSpice simulation report and submit in next lab session.",
  },
  {
    label: "CAD: Next Class Notice",
    text: "CAD104: Complete 3D isometric view assembly and submit in next class.",
  },
];

export default function AiExtractModal({
  isOpen,
  onClose,
  timetable = [],
  onAddDeadline,
  onOpenManualModal,
}: AiExtractModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDeadline[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetAll = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setPastedText("");
    setIsDragging(false);
    setIsLoading(false);
    setErrorMessage(null);
    setValidationNotice(null);
    setCandidates([]);
    setSavedCount(0);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setCandidates([]);

    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(reader.result as string);
    };
    reader.onerror = () => {
      setErrorMessage("Failed to read the selected file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  /**
   * Resolves raw Gemini output into candidate deadlines using timetable context
   * without inventing dates if none was given.
   */
  const resolveCandidates = (rawItems: any[]): CandidateDeadline[] => {
    return rawItems.map((raw) => {
      const candidateId = `cand-${nanoid(6)}`;
      const subject = raw.subject || "General Academic";
      const importance: ImportanceLevel = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(raw.importance)
        ? raw.importance
        : "MEDIUM";

      let dateSourceType: DateSourceType = "user-entered";
      let dueDate = "";
      let dueTime = raw.dueTime || "23:59";
      let timetableMatch: NextClassResult | undefined;

      // 1. If explicit calendar date was detected in notice
      if (raw.hasExplicitDate && raw.explicitDueDate && raw.explicitDueDate !== "null") {
        dateSourceType = "ai-extracted";
        dueDate = raw.explicitDueDate;
        dueTime = raw.dueTime || "23:59";
      }
      // 2. If notice mentions "next class", "next lab", etc. or has no explicit date,
      // query the student's timetable for that subject!
      else if (raw.isRelativeClassMention || !raw.hasExplicitDate) {
        const nextClass = getNextClassForSubject(timetable, subject);
        if (nextClass) {
          dateSourceType = "timetable-inferred";
          dueDate = nextClass.dateStr;
          dueTime = nextClass.timeStr;
          timetableMatch = nextClass;
        } else {
          // If no matching class exists in timetable, DO NOT invent a date!
          dateSourceType = "user-entered";
          dueDate = ""; // Prompt user to enter date
        }
      }

      return {
        id: candidateId,
        taskName: raw.taskName || "Academic Assignment",
        subject,
        dueDate,
        dueTime,
        importance,
        description: raw.description || "",
        confidenceLevel: raw.confidenceLevel || "HIGH",
        geminiReasoning: raw.geminiReasoning || "Extracted from academic notice.",
        dateSourceType,
        timetableMatch,
        isSaved: false,
      };
    });
  };

  const handleExtractWithGemini = async () => {
    if (!selectedFile && !pastedText.trim()) {
      setErrorMessage("Please select a document/image or paste an announcement text.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setCandidates([]);
    setSavedCount(0);

    try {
      const payload: any = {
        currentDate: new Date().toISOString().split("T")[0],
      };

      if (pastedText.trim()) {
        payload.text = pastedText.trim();
      }

      if (selectedFile && fileBase64) {
        payload.file = {
          base64: fileBase64,
          mimeType: selectedFile.type,
          name: selectedFile.name,
        };
      }

      const response = await fetch("/api/extract-deadlines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to analyze notice with Gemini.");
      }

      if (!Array.isArray(data.deadlines) || data.deadlines.length === 0) {
        setErrorMessage(
          "Gemini could not find any active deadlines or task assignments in this notice. Please check the text or try manual entry."
        );
        return;
      }

      const resolved = resolveCandidates(data.deadlines);
      setCandidates(resolved);
    } catch (err: any) {
      console.error("Extraction error:", err);
      setErrorMessage(
        err.message || "An unexpected error occurred during AI analysis. You can try again or enter the deadline manually."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSingleCandidate = (candidate: CandidateDeadline) => {
    if (!onAddDeadline) return;

    // Validation: Ensure due date is specified
    if (!candidate.dueDate) {
      setValidationNotice(`Please select a due date for "${candidate.taskName}" before adding.`);
      return;
    }

    setValidationNotice(null);

    const newDeadline: Deadline = {
      id: `ai-${nanoid(8)}`,
      taskName: candidate.taskName.trim(),
      subject: candidate.subject.trim(),
      description: candidate.description.trim(),
      dueDate: candidate.dueDate,
      dueTime: candidate.dueTime || "23:59",
      importance: candidate.importance,
      completed: false,
      createdAt: new Date().toISOString(),
      source: "ai",
    };

    onAddDeadline(newDeadline);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, isSaved: true } : c))
    );
    setSavedCount((prev) => prev + 1);
  };

  const handleSaveAll = () => {
    const unsaved = candidates.filter((c) => !c.isSaved && c.dueDate);
    if (unsaved.length === 0) {
      setValidationNotice("All valid candidates have already been saved, or some are missing a due date.");
      return;
    }

    setValidationNotice(null);
    unsaved.forEach((c) => handleSaveSingleCandidate(c));
  };

  const handleUpdateCandidateField = (
    id: string,
    field: keyof CandidateDeadline,
    value: any
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        // If user manually edits date, reflect that it's now user-entered
        if (field === "dueDate") {
          updated.dateSourceType = "user-entered";
        }
        return updated;
      })
    );
  };

  const handleDiscardCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  const getDateBadge = (item: CandidateDeadline) => {
    switch (item.dateSourceType) {
      case "ai-extracted":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 flex items-center gap-1 font-medium">
            <FileText size={11} />
            Found in notice
          </span>
        );
      case "timetable-inferred":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 flex items-center gap-1 font-medium">
            <Calendar size={11} />
            Matched to next class
          </span>
        );
      case "user-entered":
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30 flex items-center gap-1 font-medium">
            <Edit3 size={11} />
            Date required
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Deep Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          resetAll();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl my-auto rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-[#fcfbf9] dark:bg-[#0c101a] p-6 sm:p-7 shadow-xl dark:shadow-2xl z-10 max-h-[92vh] overflow-y-auto transition-colors">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200/80 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-800 dark:text-slate-200 flex items-center justify-center shadow-xs">
              <Sparkles size={18} className={isLoading ? "animate-spin text-blue-600 dark:text-blue-400" : "text-blue-600 dark:text-blue-400"} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif] tracking-tight">
                Import from notice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload a document or paste announcement text to extract deadlines.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetAll();
              onClose();
            }}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>

        {/* ================================================== */}
        {/* INPUT STAGE: FILE DROPZONE & TEXT AREA             */}
        {/* ================================================== */}
        {candidates.length === 0 ? (
          <div className="space-y-5">
            {/* Error banner with fallback to manual entry */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs sm:text-sm flex flex-col gap-2.5 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={17} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{errorMessage}</span>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-200 dark:border-rose-500/20">
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                  {onOpenManualModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenManualModal();
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-white/10 hover:bg-slate-50 text-slate-900 dark:text-white font-medium transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-white/10 shadow-xs cursor-pointer"
                    >
                      <span>Switch to manual entry</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-7 rounded-xl border-2 border-dashed transition-all text-center cursor-pointer relative overflow-hidden group ${
                isDragging
                  ? "border-blue-500 bg-blue-500/5 scale-[1.005]"
                  : selectedFile
                  ? "border-emerald-500/60 bg-emerald-500/5"
                  : "border-slate-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/40 bg-white dark:bg-[#111726] hover:bg-slate-50/50 dark:hover:bg-[#131b2e]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/png,image/jpeg,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-11 h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#75d5b0] flex items-center justify-center shadow-xs">
                    <FileCheck size={22} />
                  </div>
                  <div className="text-slate-900 dark:text-white font-medium text-sm mt-1">{selectedFile.name}</div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Ready to extract
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setFileBase64(null);
                    }}
                    className="mt-2 text-xs text-rose-600 hover:underline font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Remove file</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                    <Upload size={20} />
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mt-1">
                    Upload circular, screenshot, or syllabus PDF
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Supports JPG, PNG & PDF up to 15MB
                  </p>
                </div>
              )}
            </div>

            {/* OR separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.06]" />
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">OR PASTE TEXT</span>
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.06]" />
            </div>

            {/* Paste Textarea */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Paste announcement or message text
              </label>
              <textarea
                rows={3}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="e.g. 'Physics PHY101: Submit Experiment 4 lab calculations in next class...'"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-sans resize-none shadow-xs"
              />
            </div>

            {/* Sample Notices (No Emojis) */}
            <div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-2">
                Sample notices:
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_NOTICES.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPastedText(sample.text);
                      setSelectedFile(null);
                      setFileBase64(null);
                      setErrorMessage(null);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/40 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-left cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <FileText size={12} className="text-slate-400" />
                    <span>{sample.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Button: Run Extraction */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Automatic deadline & subject extraction
              </span>

              <button
                type="button"
                onClick={handleExtractWithGemini}
                disabled={isLoading || (!selectedFile && !pastedText.trim())}
                className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
                  isLoading || (!selectedFile && !pastedText.trim())
                    ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-white/10"
                    : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Extract deadlines</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ================================================== */
          /* CONFIRMATION & REVIEW STAGE                         */
          /* ================================================== */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Review extracted deadlines ({candidates.length})
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Confirm or adjust details before adding to your deadlines.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCandidates([]);
                    setSavedCount(0);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
                >
                  Scan another
                </button>
                {candidates.filter((c) => !c.isSaved && c.dueDate).length > 1 && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>Add all ({candidates.filter((c) => !c.isSaved && c.dueDate).length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Validation Notice Banner */}
            {validationNotice && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span>{validationNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationNotice(null)}
                  className="text-amber-700 dark:text-amber-300 hover:underline text-xs cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* List of Extracted Candidates */}
            <div className="space-y-4">
              {candidates.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                    item.isSaved
                      ? "bg-emerald-500/5 border-emerald-500/30 opacity-80"
                      : "bg-white dark:bg-[#111726] border-slate-200 dark:border-white/10 hover:border-blue-400/60 dark:hover:border-blue-500/30 shadow-xs"
                  }`}
                >
                  {/* Top Status & Date Source Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                        #{idx + 1}
                      </span>
                      {getDateBadge(item)}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400">
                        Confidence: {item.confidenceLevel}
                      </span>
                    </div>

                    {item.isSaved ? (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check size={14} />
                        Added to deadlines
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDiscardCandidate(item.id)}
                        className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        title="Discard this candidate"
                      >
                        Discard
                      </button>
                    )}
                  </div>

                  {/* Editable Fields Grid */}
                  <div className="space-y-3">
                    {/* Task Name */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Task Name
                      </label>
                      <input
                        type="text"
                        disabled={item.isSaved}
                        value={item.taskName}
                        onChange={(e) =>
                          handleUpdateCandidateField(item.id, "taskName", e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Subject */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Subject / Course
                        </label>
                        <input
                          type="text"
                          disabled={item.isSaved}
                          value={item.subject}
                          onChange={(e) =>
                            handleUpdateCandidateField(item.id, "subject", e.target.value)
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>

                      {/* Importance / Priority */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Priority Level
                        </label>
                        <select
                          disabled={item.isSaved}
                          value={item.importance}
                          onChange={(e) =>
                            handleUpdateCandidateField(
                              item.id,
                              "importance",
                              e.target.value as ImportanceLevel
                            )
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm font-sans focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                        >
                          <option value="CRITICAL">Critical (Major Exams / High Stakes)</option>
                          <option value="HIGH">High (Lab Records / Graded Sets)</option>
                          <option value="MEDIUM">Medium (Regular Assignments)</option>
                          <option value="LOW">Low (Readings / Prep)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Due Date */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Due Date {item.dateSourceType === "user-entered" && !item.dueDate && "(Required)"}
                        </label>
                        <input
                          type="date"
                          disabled={item.isSaved}
                          value={item.dueDate}
                          onChange={(e) =>
                            handleUpdateCandidateField(item.id, "dueDate", e.target.value)
                          }
                          className={`w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all ${
                            !item.dueDate
                              ? "border-amber-400 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-500/10"
                              : "border-slate-200 dark:border-white/10"
                          }`}
                        />
                        {!item.dueDate && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1 mt-1">
                            <AlertCircle size={12} className="text-amber-600 dark:text-amber-400" />
                            <span>No date found in notice or timetable. Please select a date.</span>
                          </span>
                        )}
                      </div>

                      {/* Due Time */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Due Time
                        </label>
                        <input
                          type="time"
                          disabled={item.isSaved}
                          value={item.dueTime}
                          onChange={(e) =>
                            handleUpdateCandidateField(item.id, "dueTime", e.target.value)
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* Reasoning & Timetable Context */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#141b2d] border border-slate-200/80 dark:border-white/[0.06] text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                        <Sparkles size={12} className="text-blue-600 dark:text-blue-400" />
                        <span>Extraction note:</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.geminiReasoning}
                      </p>
                      {item.timetableMatch && (
                        <div className="pt-1.5 mt-1.5 border-t border-slate-200 dark:border-white/[0.06] text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
                          <Calendar size={12} />
                          <span>
                            Next class matched: {item.timetableMatch.dayOfWeek},{" "}
                            {item.timetableMatch.formattedDisplay} ({item.timetableMatch.entry.room || "Campus"})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Task instructions / description
                      </label>
                      <input
                        type="text"
                        disabled={item.isSaved}
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateCandidateField(item.id, "description", e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  {/* Save Button for this candidate */}
                  {!item.isSaved && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSingleCandidate(item)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <Check size={14} />
                        <span>Add to deadlines</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {savedCount > 0 ? `${savedCount} deadline${savedCount > 1 ? "s" : ""} added` : ""}
              </span>

              <button
                type="button"
                onClick={() => {
                  resetAll();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] border border-slate-200 dark:border-white/10 transition-all cursor-pointer shadow-xs"
              >
                {savedCount > 0 ? "Done" : "Close"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
