import { useState, useRef, type DragEvent, type ChangeEvent, type FormEvent } from "react";
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
  Edit2,
  Trash2,
  AlertTriangle,
  GraduationCap,
  Building,
  Plus,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  EXAM_TYPES,
  type Exam,
  type ExamType,
  formatTime12Hour,
  formatExamDateDisplay,
} from "@/lib/exams";

export interface CandidateExam {
  id: string;
  subject: string;
  subjectCode: string;
  examDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  examType: ExamType;
  room: string;
  semesterBranch: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  isDateAmbiguous: boolean;
  ambiguityNote?: string | null;
  notes?: string | null;
  selected: boolean;
}

interface AiExamImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingExams: Exam[];
  onImportExams: (exams: Exam[]) => void;
}

export default function AiExamImportModal({
  isOpen,
  onClose,
  existingExams,
  onImportExams,
}: AiExamImportModalProps) {
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
  const [candidates, setCandidates] = useState<CandidateExam[]>([]);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);

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
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelect = async (file: File) => {
    setErrorMessage(null);

    const validMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!validMimes.includes(file.type.toLowerCase()) && !file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Please upload a PDF, PNG, JPG, or WebP exam document.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("File is too large. Maximum allowed size is 15MB.");
      return;
    }

    try {
      const processed = await processFileForAi(file);
      setSelectedFile({
        name: file.name,
        size: file.size,
        mimeType: processed.mimeType,
        base64: processed.base64,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process file. Please try again or paste the text.");
    }
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
      setErrorMessage("Please select a timetable file (PDF/Image) or paste the exam details.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/extract-exams", {
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
          currentDate: new Date().toISOString().split("T")[0],
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
        throw new Error(data?.error || `Server error (${response.status}) while analyzing exams.`);
      }

      const extractedList: any[] = data.exams || [];
      if (extractedList.length === 0) {
        setErrorMessage("No clear examination schedule was found in this document. Please verify the file or enter exams manually.");
        setIsLoading(false);
        return;
      }

      const mappedCandidates: CandidateExam[] = extractedList.map((item) => ({
        id: `cand-exam-${nanoid(8)}`,
        subject: String(item.subject || "Exam Subject").trim(),
        subjectCode: String(item.subjectCode || "").trim(),
        examDate: String(item.examDate || "").trim(),
        startTime: String(item.startTime || "09:30").trim(),
        endTime: String(item.endTime || "12:30").trim(),
        examType: (item.examType as ExamType) || "Internal",
        room: String(item.room || "").trim(),
        semesterBranch: String(item.semesterBranch || "").trim(),
        confidenceLevel: item.confidenceLevel || "HIGH",
        isDateAmbiguous: Boolean(item.isDateAmbiguous),
        ambiguityNote: item.ambiguityNote || null,
        notes: item.notes || null,
        selected: true,
      }));

      setCandidates(mappedCandidates);
      setStep("review");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to analyze document with AI.");
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
    field: keyof CandidateExam,
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
      setErrorMessage("Please select at least one exam to import.");
      return;
    }

    // Convert candidates into real Exam objects
    const newExams: Exam[] = selected.map((c) => ({
      id: `exam-${nanoid(8)}`,
      subject: c.subject.trim() || "Exam",
      subjectCode: c.subjectCode.trim() || undefined,
      examDate: c.examDate || new Date().toISOString().split("T")[0],
      startTime: c.startTime || "09:30",
      endTime: c.endTime.trim() || undefined,
      examType: c.examType,
      room: c.room.trim() || undefined,
      notes: [c.semesterBranch, c.notes].filter(Boolean).join(" · ") || undefined,
      createdAt: new Date().toISOString(),
    }));

    onImportExams([...existingExams, ...newExams]);
    handleClose();
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Import Exams with AI"
    >
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-3xl bg-surface-elevated border border-border rounded-3xl shadow-2xl z-10 overflow-hidden my-auto max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                  Import Exams with AI
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  AI ASSISTED
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {step === "input"
                  ? "Upload exam date sheets, PDFs, or photos of notices"
                  : `Review and customize ${candidates.length} extracted exam candidates`}
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
                    ? "border-amber-500 bg-amber-500/5"
                    : "border-border hover:border-amber-500/60 bg-surface hover:bg-surface-subtle"
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
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
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
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Upload size={22} />
                    </div>
                    <div className="text-sm font-medium text-text-primary mt-1">
                      Drag & drop your Exam Timetable (PDF or Image)
                    </div>
                    <div className="text-xs text-text-muted">
                      Supports PDF, JPG, JPEG, PNG, and WebP up to 15MB
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Browse File
                    </span>
                  </div>
                )}
              </div>

              {/* Or paste text */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary block">
                  Or paste exam notice / circular text
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste exam schedule text, dates, timings, and rooms..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none font-mono"
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
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:brightness-105 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Extracting with AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Extract Exams</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Review Header Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {selectedCount} of {candidates.length} selected
                  </span>
                  <span className="text-xs text-text-muted">· Edit before saving</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline cursor-pointer font-medium"
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

              {/* Candidate Cards */}
              <div className="space-y-3">
                {candidates.map((cand) => {
                  const isEditing = editingCandidateId === cand.id;

                  return (
                    <div
                      key={cand.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        cand.selected
                          ? "border-amber-500/50 bg-amber-500/[0.03]"
                          : "border-border bg-surface opacity-75"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={cand.selected}
                          onChange={() => toggleCandidateSelect(cand.id)}
                          className="mt-1 rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4"
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
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                    Course Code
                                  </label>
                                  <input
                                    type="text"
                                    value={cand.subjectCode}
                                    placeholder="Enter course code (optional)"
                                    onChange={(e) =>
                                      updateCandidateField(cand.id, "subjectCode", e.target.value)
                                    }
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                    Exam Date
                                  </label>
                                  <input
                                    type="date"
                                    value={cand.examDate}
                                    onChange={(e) =>
                                      updateCandidateField(cand.id, "examDate", e.target.value)
                                    }
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                  />
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
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
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
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                    Exam Type
                                  </label>
                                  <select
                                    value={cand.examType}
                                    onChange={(e) =>
                                      updateCandidateField(
                                        cand.id,
                                        "examType",
                                        e.target.value as ExamType
                                      )
                                    }
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  >
                                    {EXAM_TYPES.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                    Exam Hall / Room
                                  </label>
                                  <input
                                    type="text"
                                    value={cand.room}
                                    placeholder="Enter hall or room (optional)"
                                    onChange={(e) =>
                                      updateCandidateField(cand.id, "room", e.target.value)
                                    }
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                                    Branch / Semester
                                  </label>
                                  <input
                                    type="text"
                                    value={cand.semesterBranch}
                                    placeholder="Enter branch or semester (optional)"
                                    onChange={(e) =>
                                      updateCandidateField(
                                        cand.id,
                                        "semesterBranch",
                                        e.target.value
                                      )
                                    }
                                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingCandidateId(null)}
                                  className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer flex items-center gap-1"
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
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                    {cand.examType}
                                  </span>
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

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-text-secondary font-mono">
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} className="text-amber-500" />
                                  <span>
                                    {cand.examDate
                                      ? formatExamDateDisplay(cand.examDate).fullDate
                                      : "Date not specified"}
                                  </span>
                                </span>

                                <span className="flex items-center gap-1">
                                  <Clock size={12} className="text-amber-500" />
                                  <span>
                                    {formatTime12Hour(cand.startTime)}
                                    {cand.endTime ? ` - ${formatTime12Hour(cand.endTime)}` : ""}
                                  </span>
                                </span>

                                {cand.room && (
                                  <span className="flex items-center gap-1">
                                    <Building size={12} className="text-text-muted" />
                                    <span>{cand.room}</span>
                                  </span>
                                )}

                                {cand.semesterBranch && (
                                  <span className="text-text-muted font-sans text-[11px]">
                                    ({cand.semesterBranch})
                                  </span>
                                )}
                              </div>

                              {cand.isDateAmbiguous && (
                                <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-300 flex items-center gap-1">
                                  <AlertTriangle size={12} />
                                  <span>{cand.ambiguityNote || "Please verify exam date"}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
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
                    className="flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Check size={14} />
                    <span>Import {selectedCount} Exam{selectedCount !== 1 ? "s" : ""}</span>
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
