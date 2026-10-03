import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
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
  Edit2,
  Trash2,
  AlertTriangle,
  BookOpen,
  MapPin,
  User,
  Plus,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type TimetableEntry,
  formatTime12Hour,
} from "@/lib/timetable";

export interface CandidateTimetableEntry {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  subject: string;
  subjectCode: string;
  faculty: string;
  room: string;
  section: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  isUncertain: boolean;
  notes?: string | null;
  selected: boolean;
}

interface AiTimetableImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingTimetable: TimetableEntry[];
  onImportTimetable: (entries: TimetableEntry[]) => void;
}

export default function AiTimetableImportModal({
  isOpen,
  onClose,
  existingTimetable,
  onImportTimetable,
}: AiTimetableImportModalProps) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    mimeType: string;
    base64: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateTimetableEntry[]>([]);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep("input");
    setInputText("");
    setSelectedFile(null);
    setIsLoading(false);
    setErrorMessage(null);
    setCandidates([]);
    setEditingCandidateId(null);
    setImportMode("replace");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);

    const validMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!validMimes.includes(file.type.toLowerCase())) {
      setErrorMessage("Please upload a PDF, PNG, JPG, or WebP timetable document.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("File is too large. Maximum allowed size is 15MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSelectedFile({
        name: file.name,
        size: file.size,
        mimeType: file.type,
        base64,
      });
    };
    reader.onerror = () => {
      setErrorMessage("Failed to read file. Please try again or paste the text.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleExtract = async () => {
    if (!inputText.trim() && !selectedFile) {
      setErrorMessage("Please select a timetable file (PDF/Image) or paste the schedule text.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/extract-timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText.trim(),
          file: selectedFile
            ? {
                base64: selectedFile.base64,
                mimeType: selectedFile.mimeType,
                name: selectedFile.name,
              }
            : undefined,
        }),
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
        throw new Error(data?.error || `Server error (${response.status}) while analyzing timetable.`);
      }

      const extractedList: any[] = data.entries || [];
      if (extractedList.length === 0) {
        setErrorMessage("No clear class timetable entries were found in this document. Please verify the file or enter classes manually.");
        setIsLoading(false);
        return;
      }

      const mappedCandidates: CandidateTimetableEntry[] = extractedList.map((item) => ({
        id: `cand-tt-${nanoid(8)}`,
        day: (item.day as DayOfWeek) || "Monday",
        startTime: String(item.startTime || "09:00").trim(),
        endTime: String(item.endTime || "10:00").trim(),
        subject: String(item.subject || "Subject").trim(),
        subjectCode: String(item.subjectCode || "").trim(),
        faculty: String(item.faculty || "").trim(),
        room: String(item.room || "").trim(),
        section: String(item.section || "").trim(),
        confidenceLevel: item.confidenceLevel || "HIGH",
        isUncertain: Boolean(item.isUncertain),
        notes: item.notes || null,
        selected: true,
      }));

      setCandidates(mappedCandidates);
      setStep("review");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to analyze timetable with AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = (select: boolean) => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: select })));
  };

  const toggleCandidateSelect = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const updateCandidateField = (
    id: string,
    field: keyof CandidateTimetableEntry,
    value: any
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const removeCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  const handleConfirmSave = () => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      setErrorMessage("Please select at least one class to import.");
      return;
    }

    const newEntries: TimetableEntry[] = selected.map((c) => ({
      id: `entry-${nanoid(8)}`,
      subject: c.subject.trim() || "Subject",
      subjectCode: c.subjectCode.trim() || undefined,
      day: c.day,
      startTime: c.startTime || "09:00",
      endTime: c.endTime || "10:00",
      room: c.room.trim() || undefined,
      instructor: c.faculty.trim() || undefined,
    }));

    if (importMode === "replace") {
      onImportTimetable(newEntries);
    } else {
      onImportTimetable([...existingTimetable, ...newEntries]);
    }

    handleClose();
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  // Group candidates by day
  const daysWithEntries = DAYS_OF_WEEK.filter((d) =>
    candidates.some((c) => c.day === d)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Import Timetable with AI"
    >
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-3xl bg-surface-elevated border border-border rounded-3xl shadow-2xl z-10 overflow-hidden my-auto max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                  Import Timetable with AI
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  AI ASSISTED
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {step === "input"
                  ? "Upload your weekly class timetable (PDF or Image)"
                  : `Review and customize ${candidates.length} extracted classes`}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {step === "input" ? (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
                  selectedFile
                    ? "border-sky-500 bg-sky-500/5"
                    : "border-border hover:border-sky-500/60 bg-surface hover:bg-surface-subtle"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={handleFileInputChange}
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                      <FileText size={24} />
                    </div>
                    <div className="font-semibold text-sm text-text-primary truncate max-w-sm">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-text-muted font-mono">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · {selectedFile.mimeType}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="mt-2 text-xs text-rose-500 hover:underline cursor-pointer"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                      <Upload size={22} />
                    </div>
                    <div className="text-sm font-medium text-text-primary mt-1">
                      Drag & drop your Weekly Timetable (PDF or Image)
                    </div>
                    <div className="text-xs text-text-muted">
                      Supports PDF, JPG, JPEG, PNG, and WebP up to 15MB
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                      Browse File
                    </span>
                  </div>
                )}
              </div>

              {/* Or paste text */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary block">
                  Or paste timetable text / schedule
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste weekly timetable days, times, subjects, and rooms..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none font-mono"
                />
              </div>

              {/* Action */}
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary border border-border hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isLoading || (!inputText.trim() && !selectedFile)}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:brightness-105 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Extracting with AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Extract Classes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Review Header Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {selectedCount} of {candidates.length} classes selected
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Mode selector */}
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-text-muted text-[11px]">Mode:</span>
                    <button
                      type="button"
                      onClick={() => setImportMode("replace")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        importMode === "replace"
                          ? "bg-sky-500 text-white"
                          : "bg-surface text-text-secondary border border-border"
                      }`}
                    >
                      Replace All
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("merge")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        importMode === "merge"
                          ? "bg-sky-500 text-white"
                          : "bg-surface text-text-secondary border border-border"
                      }`}
                    >
                      Append
                    </button>
                  </div>

                  <span className="text-border">|</span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(true)}
                      className="text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(false)}
                      className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              </div>

              {/* Grouped Candidates by Day */}
              <div className="space-y-4">
                {daysWithEntries.map((dayName) => {
                  const dayEntries = candidates.filter((c) => c.day === dayName);

                  return (
                    <div key={dayName} className="space-y-2">
                      <div className="text-xs font-semibold font-mono text-sky-700 dark:text-sky-400 flex items-center gap-1.5 px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        <span>{dayName.toUpperCase()} ({dayEntries.length})</span>
                      </div>

                      <div className="space-y-2">
                        {dayEntries.map((cand) => {
                          const isEditing = editingCandidateId === cand.id;

                          return (
                            <div
                              key={cand.id}
                              className={`p-3.5 rounded-2xl border transition-all ${
                                cand.selected
                                  ? "border-sky-500/40 bg-sky-500/[0.03]"
                                  : "border-border bg-surface opacity-75"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={cand.selected}
                                  onChange={() => toggleCandidateSelect(cand.id)}
                                  className="mt-1 rounded text-sky-600 focus:ring-sky-500 cursor-pointer h-4 w-4"
                                />

                                <div className="flex-1 min-w-0">
                                  {isEditing ? (
                                    <div className="space-y-3 pt-1">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Subject Name
                                          </label>
                                          <input
                                            type="text"
                                            value={cand.subject}
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "subject", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Course Code
                                          </label>
                                          <input
                                            type="text"
                                            value={cand.subjectCode}
                                            placeholder="e.g. 18CS51"
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "subjectCode", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Day
                                          </label>
                                          <select
                                            value={cand.day}
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "day", e.target.value as DayOfWeek)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                          >
                                            {DAYS_OF_WEEK.map((d) => (
                                              <option key={d} value={d}>
                                                {d}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Start Time
                                          </label>
                                          <input
                                            type="time"
                                            value={cand.startTime}
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "startTime", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            End Time
                                          </label>
                                          <input
                                            type="time"
                                            value={cand.endTime}
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "endTime", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Room / Lab
                                          </label>
                                          <input
                                            type="text"
                                            value={cand.room}
                                            placeholder="e.g. Room 301, Lab 2"
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "room", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                            Instructor / Faculty
                                          </label>
                                          <input
                                            type="text"
                                            value={cand.faculty}
                                            placeholder="e.g. Dr. Ananya"
                                            onChange={(e) =>
                                              updateCandidateField(cand.id, "faculty", e.target.value)
                                            }
                                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
                                          />
                                        </div>
                                      </div>

                                      <div className="flex justify-end pt-1">
                                        <button
                                          type="button"
                                          onClick={() => setEditingCandidateId(null)}
                                          className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                          <Check size={12} />
                                          <span>Done Editing</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-sm font-semibold text-text-primary">
                                            {cand.subject}
                                          </h4>
                                          {cand.subjectCode && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border text-text-secondary">
                                              {cand.subjectCode}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setEditingCandidateId(cand.id)}
                                            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                                            title="Edit details"
                                          >
                                            <Edit2 size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => removeCandidate(cand.id)}
                                            className="p-1 rounded text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                            title="Remove candidate"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-text-secondary font-mono">
                                        <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300 font-medium">
                                          <Clock size={12} />
                                          <span>
                                            {formatTime12Hour(cand.startTime)} - {formatTime12Hour(cand.endTime)}
                                          </span>
                                        </span>

                                        {cand.room && (
                                          <span className="flex items-center gap-1">
                                            <MapPin size={12} className="text-text-muted" />
                                            <span>{cand.room}</span>
                                          </span>
                                        )}

                                        {cand.faculty && (
                                          <span className="flex items-center gap-1 text-text-muted font-sans text-[11px]">
                                            <User size={12} />
                                            <span>{cand.faculty}</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep("input")}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  ← Upload another document
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary border border-border hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={selectedCount === 0}
                    className="flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Check size={14} />
                    <span>Import {selectedCount} Class{selectedCount !== 1 ? "es" : ""}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
