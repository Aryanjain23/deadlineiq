import { useState, useRef, useEffect, useCallback, useMemo, type DragEvent, type ChangeEvent } from "react";
import { processFileForAi } from "@/lib/fileProcessing";
import {
  X,
  Upload,
  FileText,
  Sparkles,
  Check,
  AlertCircle,
  Calendar,
  Clock,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Edit3,
  FileCheck,
  Trash2,
  AlertTriangle,
  Layers,
  HelpCircle,
} from "lucide-react";
import {
  getNextClassForSubject,
  type TimetableEntry,
  type NextClassResult,
} from "@/lib/timetable";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import { nanoid } from "nanoid";

export type DateSourceType = "ai-extracted" | "timetable-inferred" | "user-entered";

export interface DuplicateInfo {
  existing: Deadline;
  reason: string;
}

export interface CandidateDeadline {
  id: string;
  taskName: string;
  subject: string;
  dueDate: string; // YYYY-MM-DD (empty if missing)
  dueTime: string; // HH:mm
  importance: ImportanceLevel;
  description: string;
  sourceType: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  geminiReasoning: string;
  notes?: string | null;
  dateSourceType: DateSourceType;
  isDateMissing: boolean;
  isDateAmbiguous: boolean;
  ambiguityNote?: string | null;
  timetableMatch?: NextClassResult;
  duplicateMatch?: DuplicateInfo | null;
  selected: boolean;
  isSaved?: boolean;
}

interface AiExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  timetable?: TimetableEntry[];
  existingDeadlines?: Deadline[];
  onAddDeadline?: (deadline: Deadline) => void;
  onOpenManualModal?: () => void;
}

// Helper: Normalize strings for duplicate comparison
function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
  "due", "deadline", "assignment", "submission", "submit", "task", "homework",
  "problem", "set", "sheet", "record", "report", "lab", "experiment", "project",
  "notice", "class", "lecture", "tutorial"
]);

function getKeywordTokens(text: string): Set<string> {
  const words = normalizeText(text).split(" ");
  return new Set(words.filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

function calculateSimilarity(strA: string, strB: string): number {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  const tokensA = getKeywordTokens(strA);
  const tokensB = getKeywordTokens(strB);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return normA === normB ? 1.0 : 0.0;
  }

  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection++;
  });

  const unionSet = new Set<string>();
  tokensA.forEach((t) => unionSet.add(t));
  tokensB.forEach((t) => unionSet.add(t));
  const union = unionSet.size;
  return union > 0 ? intersection / union : 0;
}

function detectDuplicate(
  candidate: { taskName: string; subject: string; dueDate: string },
  existingDeadlines: Deadline[]
): DuplicateInfo | null {
  if (!existingDeadlines || existingDeadlines.length === 0) return null;

  for (const existing of existingDeadlines) {
    const titleSim = calculateSimilarity(candidate.taskName, existing.taskName);
    const normCandSubj = normalizeText(candidate.subject);
    const normExistSubj = normalizeText(existing.subject);
    const sameSubject =
      normCandSubj &&
      normExistSubj &&
      (normCandSubj === normExistSubj ||
        normCandSubj.includes(normExistSubj) ||
        normExistSubj.includes(normCandSubj));

    const sameDate = Boolean(
      candidate.dueDate && existing.dueDate && candidate.dueDate === existing.dueDate
    );

    // Exact or near-identical title + same due date
    if (titleSim >= 0.7 && sameDate) {
      return {
        existing,
        reason: `Matches existing "${existing.taskName}" on ${existing.dueDate}`,
      };
    }

    // High title similarity + same subject
    if (titleSim >= 0.75 && sameSubject) {
      return {
        existing,
        reason: `Matches existing "${existing.taskName}" in ${existing.subject}`,
      };
    }

    // Moderate title similarity + same subject + same date
    if (titleSim >= 0.45 && sameSubject && sameDate) {
      return {
        existing,
        reason: `Matches existing "${existing.taskName}" (${existing.subject}, due ${existing.dueDate})`,
      };
    }
  }

  return null;
}

const LOADING_STEPS = [
  "Reading your notice...",
  "Finding deadlines...",
  "Preparing your review...",
];

export default function AiExtractModal({
  isOpen,
  onClose,
  timetable = [],
  existingDeadlines = [],
  onAddDeadline,
  onOpenManualModal,
}: AiExtractModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDeadline[]>([]);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progressive loading steps during extraction
  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1600);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Global clipboard paste listener (Ctrl+V / Cmd+V) to capture screenshots or pasted text
  useEffect(() => {
    if (!isOpen || candidates.length > 0) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return; // Don't intercept regular typing in inputs
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            return;
          }
        }
      }

      const text = e.clipboardData?.getData("text");
      if (text && text.trim()) {
        setPastedText(text.trim());
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, candidates.length]);

  if (!isOpen) return null;

  const resetAll = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setPastedText("");
    setIsDragging(false);
    setIsLoading(false);
    setLoadingStepIndex(0);
    setErrorMessage(null);
    setValidationNotice(null);
    setSaveSuccessMessage(null);
    setCandidates([]);
    setIsSaving(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setValidationNotice(null);
    setSaveSuccessMessage(null);

    // Validate file type
    const validMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
    ];
    const isPdfByName = file.name.toLowerCase().endsWith(".pdf");
    const isImageByName = /\.(png|jpe?g|webp|heic)$/i.test(file.name);

    if (!validMimes.includes(file.type.toLowerCase()) && !isPdfByName && !isImageByName) {
      setErrorMessage("Unsupported file type. Please upload a PDF document or an image (PNG, JPG, WebP).");
      return;
    }

    // Validate size (15MB maximum)
    const MAX_SIZE_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage("The selected file is too large (maximum size is 15MB). Please upload a smaller file or paste the text directly.");
      return;
    }

    setSelectedFile(file);
    setCandidates([]);

    try {
      const processed = await processFileForAi(file);
      setFileBase64(processed.base64);
    } catch (err: any) {
      setErrorMessage(err.message || "The selected file could not be processed. Please try selecting another file.");
      setSelectedFile(null);
      setFileBase64(null);
    }
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
   * Resolves raw extracted deadlines into candidate records:
   * - Never invents dates if none was given.
   * - Flags ambiguous or missing dates.
   * - Queries student's timetable for relative phrases ("next class", "next lab").
   * - Checks against existingDeadlines for duplicates.
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
      let isDateMissing = true;
      let isDateAmbiguous = Boolean(raw.isDateAmbiguous);
      let ambiguityNote = raw.ambiguityNote || null;
      let timetableMatch: NextClassResult | undefined;

      // 1. Explicit calendar date found in notice
      if (raw.hasExplicitDate && raw.explicitDueDate && raw.explicitDueDate !== "null") {
        dateSourceType = "ai-extracted";
        dueDate = raw.explicitDueDate;
        dueTime = raw.dueTime || "23:59";
        isDateMissing = false;
      }
      // 2. Relative class mention (e.g. "next class", "next lab")
      else if (raw.isRelativeClassMention) {
        const nextClass = getNextClassForSubject(timetable, subject);
        if (nextClass) {
          dateSourceType = "timetable-inferred";
          dueDate = nextClass.dateStr;
          dueTime = nextClass.timeStr;
          timetableMatch = nextClass;
          isDateMissing = false;
          isDateAmbiguous = true;
          ambiguityNote = `Relative notice ("next class") matched to your weekly schedule: ${nextClass.dayOfWeek}, ${nextClass.formattedDisplay}.`;
        } else {
          // If no matching class exists in timetable, NEVER invent a date!
          dateSourceType = "user-entered";
          dueDate = "";
          isDateMissing = true;
          isDateAmbiguous = true;
          ambiguityNote = `Mentions submitting in "next class", but no ${subject} class was found in your timetable.`;
        }
      } else {
        // No date mentioned at all
        dateSourceType = "user-entered";
        dueDate = "";
        isDateMissing = true;
        isDateAmbiguous = true;
        ambiguityNote = ambiguityNote || "No submission date was found in this notice.";
      }

      // Check for duplicate against user's existing deadlines
      const duplicateMatch = detectDuplicate(
        { taskName: raw.taskName || "Academic Assignment", subject, dueDate },
        existingDeadlines
      );

      return {
        id: candidateId,
        taskName: raw.taskName || "Academic Assignment",
        subject,
        dueDate,
        dueTime,
        importance,
        description: raw.description || "",
        sourceType: raw.sourceType || "CLASS_NOTICE",
        confidenceLevel: raw.confidenceLevel || "HIGH",
        geminiReasoning: raw.geminiReasoning || "Extracted from academic notice.",
        notes: raw.notes || null,
        dateSourceType,
        isDateMissing,
        isDateAmbiguous,
        ambiguityNote,
        timetableMatch,
        duplicateMatch,
        // If it's a potential duplicate, uncheck by default so user doesn't accidentally save twice
        selected: !duplicateMatch,
        isSaved: false,
      };
    });
  };

  const handleExtractDeadlines = async () => {
    if (!selectedFile && !pastedText.trim()) {
      setErrorMessage("Please select a document/image or paste announcement text.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setValidationNotice(null);
    setSaveSuccessMessage(null);
    setCandidates([]);

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
          mimeType: selectedFile.type || (selectedFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
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

      let data: any = null;
      try {
        const rawText = await response.text();
        if (rawText && rawText.trim().startsWith("{")) {
          data = JSON.parse(rawText);
        } else if (rawText) {
          data = { success: false, error: rawText };
        }
      } catch {
        data = null;
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Server error (${response.status}) while analyzing notice.`);
      }

      if (!Array.isArray(data.deadlines) || data.deadlines.length === 0) {
        setErrorMessage(
          "No academic deadlines or task submissions were detected in this notice. You can edit the text, try another file, or switch to manual entry."
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

  const handleUpdateCandidateField = (
    id: string,
    field: keyof CandidateDeadline,
    value: any
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };

        // Re-evaluate date flags if user edits due date
        if (field === "dueDate") {
          const newDate = String(value).trim();
          updated.dueDate = newDate;
          updated.isDateMissing = !newDate;
          if (newDate) {
            updated.dateSourceType = "user-entered";
            updated.isDateAmbiguous = false;
          }
          // Re-evaluate duplicate check with new date
          updated.duplicateMatch = detectDuplicate(
            { taskName: updated.taskName, subject: updated.subject, dueDate: newDate },
            existingDeadlines
          );
        }

        // Re-evaluate duplicate check if taskName or subject changes
        if (field === "taskName" || field === "subject") {
          updated.duplicateMatch = detectDuplicate(
            { taskName: updated.taskName, subject: updated.subject, dueDate: updated.dueDate },
            existingDeadlines
          );
        }

        return updated;
      })
    );
  };

  const handleToggleSelectCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleToggleSelectAll = () => {
    const unsaved = candidates.filter((c) => !c.isSaved);
    const allSelected = unsaved.every((c) => c.selected);
    setCandidates((prev) =>
      prev.map((c) => (c.isSaved ? c : { ...c, selected: !allSelected }))
    );
  };

  const handleDiscardCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  /**
   * Explicit User Confirmation:
   * Only write to Firestore when the user explicitly clicks "Add to DeadlineIQ".
   */
  const handleSaveSelected = async () => {
    if (!onAddDeadline) return;

    const selectedToSave = candidates.filter((c) => c.selected && !c.isSaved);

    if (selectedToSave.length === 0) {
      setValidationNotice("Please select at least one deadline to add.");
      return;
    }

    // Verify all selected candidates have a valid due date
    const missingDateCandidate = selectedToSave.find((c) => !c.dueDate);
    if (missingDateCandidate) {
      setValidationNotice(
        `Please specify a due date for "${missingDateCandidate.taskName}" before adding.`
      );
      // Scroll to that candidate element
      const el = document.getElementById(`candidate-${missingDateCandidate.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setValidationNotice(null);
    setIsSaving(true);

    try {
      for (const candidate of selectedToSave) {
        const newDeadline: Deadline = {
          id: `ai-${nanoid(8)}`,
          taskName: candidate.taskName.trim(),
          subject: candidate.subject.trim(),
          description: candidate.description.trim() || undefined,
          dueDate: candidate.dueDate,
          dueTime: candidate.dueTime || "23:59",
          importance: candidate.importance,
          completed: false,
          createdAt: new Date().toISOString(),
          source: "ai",
          sourceType: "ai",
          dateSource: candidate.dateSourceType,
          confidence: candidate.confidenceLevel,
        };

        // Write to Firestore via provided callback
        await onAddDeadline(newDeadline);

        // Mark as saved in candidate list
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidate.id ? { ...c, isSaved: true, selected: false } : c))
        );
      }

      const count = selectedToSave.length;
      setSaveSuccessMessage(
        `Successfully added ${count} deadline${count > 1 ? "s" : ""} to DeadlineIQ.`
      );
    } catch (err: any) {
      console.error("Save error:", err);
      setValidationNotice("An error occurred while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = candidates.filter((c) => c.selected && !c.isSaved).length;
  const unsavedCount = candidates.filter((c) => !c.isSaved).length;
  const savedCount = candidates.filter((c) => c.isSaved).length;

  const getDateBadge = (item: CandidateDeadline) => {
    if (item.isDateMissing) {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 flex items-center gap-1 font-semibold">
          <AlertCircle size={11} />
          Date missing
        </span>
      );
    }

    if (item.isDateAmbiguous) {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30 flex items-center gap-1 font-semibold">
          <AlertTriangle size={11} />
          {item.dateSourceType === "timetable-inferred" ? "Inferred from timetable" : "Requires confirmation"}
        </span>
      );
    }

    return (
      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 flex items-center gap-1 font-semibold">
        <CheckCircle2 size={11} />
        Found in notice
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Deep Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isLoading && !isSaving) {
            resetAll();
            onClose();
          }
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl my-auto rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-[#fcfbf9] dark:bg-[#0c101a] p-5 sm:p-7 shadow-xl dark:shadow-2xl z-10 max-h-[92vh] overflow-y-auto transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200/80 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-800 dark:text-slate-200 flex items-center justify-center shadow-xs">
              <Sparkles
                size={18}
                className={isLoading ? "animate-spin text-blue-600 dark:text-blue-400" : "text-blue-600 dark:text-blue-400"}
              />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif] tracking-tight">
                {candidates.length > 0 ? "Review candidate deadlines" : "Capture deadlines from notice"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {candidates.length > 0
                  ? "Verify and edit detected items before adding them to your schedule."
                  : "Upload a document, screenshot, or paste circular text to extract deadlines."}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetAll();
              onClose();
            }}
            disabled={isLoading || isSaving}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>

        {/* ================================================== */}
        {/* LOADING STATE DISPLAY                               */}
        {/* ================================================== */}
        {isLoading ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm animate-pulse">
                <RefreshCw size={26} className="animate-spin" />
              </div>
            </div>

            <div className="space-y-2 max-w-sm">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white font-['Space_Grotesk',sans-serif]">
                {LOADING_STEPS[loadingStepIndex]}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Analyzing course context, identifying submission dates, and checking against your timetable.
              </p>
            </div>

            {/* Stepper indicator */}
            <div className="flex items-center gap-2 pt-2">
              {LOADING_STEPS.map((step, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === loadingStepIndex
                      ? "w-8 bg-blue-600 dark:bg-blue-400"
                      : idx < loadingStepIndex
                      ? "w-3 bg-emerald-500"
                      : "w-3 bg-slate-200 dark:bg-white/10"
                  }`}
                  title={step}
                />
              ))}
            </div>
          </div>
        ) : candidates.length === 0 ? (
          /* ================================================== */
          /* INPUT STAGE: FILE DROPZONE & TEXT AREA             */
          /* ================================================== */
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
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
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
                    className="mt-2 text-xs text-rose-600 dark:text-rose-400 hover:underline font-mono flex items-center gap-1 cursor-pointer"
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
                    Supports JPG, PNG, WebP & PDF up to 15MB (or press Ctrl+V to paste screenshot)
                  </p>
                </div>
              )}
            </div>

            {/* OR separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.06]" />
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                OR PASTE NOTICE TEXT
              </span>
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.06]" />
            </div>

            {/* Paste Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Announcement or message text
                </label>
                {pastedText.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPastedText("")}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Clear text
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="e.g. 'Physics PHY101: Submit Experiment 4 lab calculations by October 14, 2026 before 17:00...'"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-sans resize-none shadow-xs"
              />
            </div>

            {/* Action Button: Run Extraction */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Multi-provider extraction with duplicate detection
              </span>

              <button
                type="button"
                onClick={handleExtractDeadlines}
                disabled={isLoading || (!selectedFile && !pastedText.trim())}
                className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
                  isLoading || (!selectedFile && !pastedText.trim())
                    ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-white/10"
                    : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
                }`}
              >
                <Sparkles size={14} />
                <span>Extract deadlines</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================================================== */
          /* CONFIRMATION & REVIEW STAGE                         */
          /* ================================================== */
          <div className="space-y-5">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Proposed deadlines ({candidates.length})
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 font-semibold">
                    {selectedCount} selected
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Confirm or correct details below. Deadlines will only be saved when you click &quot;Add to DeadlineIQ&quot;.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {unsavedCount > 1 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
                  >
                    {candidates.filter((c) => !c.isSaved).every((c) => c.selected)
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCandidates([]);
                    setValidationNotice(null);
                    setSaveSuccessMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
                >
                  Scan another
                </button>
              </div>
            </div>

            {/* Validation Notice Banner */}
            {validationNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="font-medium">{validationNotice}</span>
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

            {/* Success Banner */}
            {saveSuccessMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span className="font-medium">{saveSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveSuccessMessage(null)}
                  className="text-emerald-700 dark:text-emerald-300 hover:underline text-xs cursor-pointer"
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
                  id={`candidate-${item.id}`}
                  className={`p-4 sm:p-5 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                    item.isSaved
                      ? "bg-emerald-500/5 border-emerald-500/30 opacity-75"
                      : item.selected
                      ? "bg-white dark:bg-[#111726] border-blue-400/80 dark:border-blue-500/40 shadow-sm"
                      : "bg-white/60 dark:bg-[#111726]/60 border-slate-200 dark:border-white/10 opacity-80"
                  }`}
                >
                  {/* Top Status & Date Source Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {!item.isSaved && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleSelectCandidate(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                            #{idx + 1}
                          </span>
                        </label>
                      )}

                      {item.isSaved && (
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                          #{idx + 1}
                        </span>
                      )}

                      {getDateBadge(item)}

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400">
                        Confidence: {item.confidenceLevel}
                      </span>

                      {item.sourceType && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400">
                          {item.sourceType}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {item.isSaved ? (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check size={14} />
                          Added to DeadlineIQ
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDiscardCandidate(item.id)}
                          className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1"
                          title="Discard this candidate"
                        >
                          <Trash2 size={12} />
                          <span>Discard</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Duplicate Alert Banner */}
                  {item.duplicateMatch && !item.isSaved && (
                    <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <div className="font-semibold flex items-center gap-1">
                          <span>Likely duplicate detected</span>
                        </div>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                          {item.duplicateMatch.reason}. You can still add it if this is a separate task.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ambiguity or Missing Date Alert Banner */}
                  {(item.isDateMissing || item.isDateAmbiguous) && !item.isSaved && (
                    <div
                      className={`mb-3 p-3 rounded-lg border text-xs flex items-start gap-2 ${
                        item.isDateMissing
                          ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200"
                          : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200"
                      }`}
                    >
                      <HelpCircle
                        size={15}
                        className={`flex-shrink-0 mt-0.5 ${
                          item.isDateMissing ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                        }`}
                      />
                      <div className="flex-1">
                        <span className="font-semibold block">
                          {item.isDateMissing ? "Date required before saving" : "Ambiguous date in source"}
                        </span>
                        <p className="text-[11px] mt-0.5 opacity-90">
                          {item.ambiguityNote || "Please confirm or choose an explicit calendar due date."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Editable Fields Grid */}
                  <div className="space-y-3">
                    {/* Task Title */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Task Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        disabled={item.isSaved}
                        value={item.taskName}
                        onChange={(e) =>
                          handleUpdateCandidateField(item.id, "taskName", e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
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
                          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
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
                          <option value="LOW">Low (Readings / Preparation)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Due Date */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Due Date <span className="text-rose-500">*</span>
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
                              ? "border-rose-400 bg-rose-50/50 dark:border-rose-500 dark:bg-rose-500/10 font-semibold"
                              : "border-slate-200 dark:border-white/10"
                          }`}
                        />
                      </div>

                      {/* Due Time */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Due Time (24h)
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

                    {/* Reasoning & Notes */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#141b2d] border border-slate-200/80 dark:border-white/[0.06] text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                        <Sparkles size={12} className="text-blue-600 dark:text-blue-400" />
                        <span>AI Extraction Note:</span>
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

                    {/* Description / Instructions */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Task Instructions / Description
                      </label>
                      <input
                        type="text"
                        disabled={item.isSaved}
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateCandidateField(item.id, "description", e.target.value)
                        }
                        placeholder="Optional submission details or instructions"
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#182033] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                {savedCount > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {savedCount} added to schedule
                  </span>
                )}
                {unsavedCount > 0 && (
                  <span>
                    {selectedCount} of {unsavedCount} selected to add
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    resetAll();
                    onClose();
                  }}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-[#141b2d] border border-slate-200 dark:border-white/10 transition-all cursor-pointer shadow-xs text-center"
                >
                  {savedCount > 0 && unsavedCount === 0 ? "Done" : "Cancel"}
                </button>

                {unsavedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={isSaving || selectedCount === 0}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
                      isSaving || selectedCount === 0
                        ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-white/10"
                        : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        <span>
                          {selectedCount > 1
                            ? `Add ${selectedCount} Deadlines to DeadlineIQ`
                            : "Add to DeadlineIQ"}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
