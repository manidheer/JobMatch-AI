"use client";
import React from "react";
import { OptimizedResume, Resume } from "@/types";
import {
  Copy,
  CheckCheck,
  FileText,
  Edit3,
  RefreshCw,
  X,
  Plus,
  Check,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  downloadOptimizedDocx,
  downloadOptimizedPdf,
  getOptimizedResumeStatus,
  updateOptimizedResume,
} from "@/lib/api";
import toast from "react-hot-toast";

interface OptimizedResumeViewProps {
  optimized: OptimizedResume;
  resume?: Resume | null;
  templateType: string;
  onUpdate?: (updated: OptimizedResume) => void;
}

// ── Skill category helpers ────────────────────────────────────────────────────

interface SkillCategory {
  category: string;
  skills: string[];
}

/** Split "skill1, skill2, Foo (A, B), skill3" respecting parentheses. */
function splitSkillsString(s: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      const t = current.trim();
      if (t) result.push(t);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseSkillCategories(skills: string[]): SkillCategory[] {
  return (skills || []).map((s) => {
    const colonIdx = s.indexOf(": ");
    if (colonIdx === -1) return { category: s, skills: [] };
    const cat = s.slice(0, colonIdx);
    const rest = s.slice(colonIdx + 2);
    return { category: cat, skills: splitSkillsString(rest) };
  });
}

/** Render text that may contain **bold** markdown markers. */
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} style={{ fontWeight: 700 }}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function serializeSkillCategories(cats: SkillCategory[]): string[] {
  return cats
    .filter((c) => c.skills.length > 0)
    .map((c) => `${c.category}: ${c.skills.join(", ")}`);
}

// ── Mani base skills — hardcoded to match backend MANI_BASE_SKILLS exactly ───
// These are never "new" — only skills added from missing/recommended are green.
const MANI_BASE_SKILL_LINES = [
  "AI / Machine Learning: Python, PyTorch, LLMs, Generative AI (OpenAI, Anthropic, Gemini), RAG (LangChain, LlamaIndex), AI Agents (LangGraph, CrewAI), Prompt Engineering, DSPy, Embeddings, Semantic Search, MLflow",
  "Backend Development: C#, .NET 8, ASP.NET Core, FastAPI, Django, Node.js, REST APIs, GraphQL, Microservices, JWT/OAuth2 Auth",
  "Frontend Development: React, JavaScript, Next.js, TypeScript, Blazor WebAssembly, Tailwind CSS, Chart.js",
  "Databases & Data Systems: PostgreSQL (pgvector), SQL Server, MongoDB, Redis, Vector Databases (Pinecone, Chroma, FAISS), Entity Framework, SQLAlchemy",
  "Cloud & DevOps: AWS, Azure, Docker, Kubernetes, CI/CD, GitHub Actions, Terraform, Nginx",
  "Developer Tools: Git, Linux / Bash, Poetry, Pytest, LangSmith, Jupyter Notebook, TensorFlow",
];
const MANI_BASE_SKILL_SET = (() => {
  const set = new Set<string>();
  for (const line of MANI_BASE_SKILL_LINES) {
    const colonIdx = line.indexOf(": ");
    if (colonIdx !== -1) {
      for (const skill of splitSkillsString(line.slice(colonIdx + 2))) {
        set.add(skill.trim().toLowerCase());
      }
    }
  }
  return set;
})();

// ── Highlight colors ──────────────────────────────────────────────────────────
const NEW_SKILL_STYLE = {
  background: "rgba(34,197,94,0.15)",
  border: "1px solid rgba(34,197,94,0.4)",
  color: "#15803d",
} as const;

const NEW_BULLET_STYLE = {
  background: "rgba(34,197,94,0.08)",
  borderRadius: "4px",
  padding: "2px 4px",
} as const;

// ─────────────────────────────────────────────────────────────────────────────

export default function OptimizedResumeView({
  optimized,
  resume,
  templateType,
  onUpdate,
}: OptimizedResumeViewProps) {
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadingKind, setDownloadingKind] = useState<"docx" | "pdf" | null>(
    null,
  );
  const [isGeneratingFiles, setIsGeneratingFiles] = useState(
    !(optimized.docx_path && optimized.pdf_path),
  );

  // Mutable parsed data — updated by inline edits
  const [parsedData, setParsedData] = useState<any>(() => {
    try {
      return JSON.parse(optimized.optimized_text);
    } catch {
      return null;
    }
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Inline editing state
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [addingSkillCat, setAddingSkillCat] = useState<number | null>(null);
  const [newSkillText, setNewSkillText] = useState("");
  const newSkillInputRef = useRef<HTMLInputElement>(null);

  // Re-sync when the optimized prop changes (after a successful Regenerate)
  useEffect(() => {
    try {
      setParsedData(JSON.parse(optimized.optimized_text));
    } catch {}
    setHasChanges(false);
    setEditingSummary(false);
    setAddingSkillCat(null);
    setIsGeneratingFiles(!(optimized.docx_path && optimized.pdf_path));
  }, [optimized.optimized_text]);

  useEffect(() => {
    if (optimized.docx_path && optimized.pdf_path) {
      setIsGeneratingFiles(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60; // ~2 minutes at 2s interval

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const latest = await getOptimizedResumeStatus(optimized.id);
        const ready = Boolean(latest.docx_path && latest.pdf_path);
        setIsGeneratingFiles(!ready);
        if (ready) {
          onUpdate?.(latest);
          return;
        }
      } catch {
        // Keep silent and retry in case generation is still in progress.
      }
      if (attempts < maxAttempts && !cancelled) {
        setTimeout(poll, 2000);
      }
    };

    setIsGeneratingFiles(true);
    poll();

    return () => {
      cancelled = true;
    };
  }, [optimized.id, optimized.docx_path, optimized.pdf_path, onUpdate]);

  // Focus the add-skill input when it appears
  useEffect(() => {
    if (addingSkillCat !== null) {
      setTimeout(() => newSkillInputRef.current?.focus(), 50);
    }
  }, [addingSkillCat]);

  // ── Original data: prefer stored snapshot, fall back to resume prop ─────────
  const originalData = useMemo(() => {
    if (optimized.original_resume_text) {
      try {
        return JSON.parse(optimized.original_resume_text);
      } catch {}
    }
    if (resume) {
      return {
        summary: resume.summary,
        skills: resume.skills,
        experience: resume.experience,
        projects: resume.projects,
        education: resume.education,
      };
    }
    return null;
  }, [optimized.original_resume_text, resume]);

  // ── Build a Set of original skills (lowercase) for new-skill detection ───────
  const originalSkillSet = useMemo(() => {
    const skills: string[] = originalData?.skills || [];
    const flat: string[] = [];
    for (const s of skills) {
      if (typeof s === "string" && s.includes(": ")) {
        // Category string "AI/ML: Python, FastAPI" → extract individual items
        const rest = s.split(": ", 2)[1] ?? "";
        flat.push(
          ...rest
            .split(", ")
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean),
        );
      } else {
        flat.push(String(s).trim().toLowerCase());
      }
    }
    return new Set(flat);
  }, [originalData]);

  // For mani template, compare against hardcoded base skills (not original resume skills)
  const isNewSkill = (skill: string) => {
    if (templateType === "mani") {
      return !MANI_BASE_SKILL_SET.has(skill.trim().toLowerCase());
    }
    return !originalSkillSet.has(skill.trim().toLowerCase());
  };

  // ── Helpers to mutate parsedData and mark changes ──────────────────────────

  function applyUpdate(next: any) {
    setParsedData(next);
    setHasChanges(true);
  }

  const removeSkill = (catIdx: number, skillIdx: number) => {
    if (templateType === "mani") {
      const cats = parseSkillCategories(parsedData.skills ?? []);
      cats[catIdx].skills.splice(skillIdx, 1);
      applyUpdate({ ...parsedData, skills: serializeSkillCategories(cats) });
    } else {
      // Flat skill list for modern/classic
      const flat: string[] = (parsedData.skills ?? []).filter(
        (s: any) => typeof s === "string",
      );
      flat.splice(skillIdx, 1);
      applyUpdate({ ...parsedData, skills: flat });
    }
  };

  const removeExperienceBullet = (expIdx: number, bulletIdx: number) => {
    const exp = parsedData.experience.map((e: any, i: number) =>
      i === expIdx
        ? {
            ...e,
            bullets: e.bullets.filter(
              (_: string, j: number) => j !== bulletIdx,
            ),
          }
        : e,
    );
    applyUpdate({ ...parsedData, experience: exp });
  };

  // ── Skill add ─────────────────────────────────────────────────────────────

  const addSkill = (catIdx: number, skill: string) => {
    if (!skill.trim()) {
      setAddingSkillCat(null);
      setNewSkillText("");
      return;
    }
    if (templateType === "mani") {
      const cats = parseSkillCategories(parsedData.skills ?? []);
      cats[catIdx].skills.push(skill.trim());
      applyUpdate({ ...parsedData, skills: serializeSkillCategories(cats) });
    } else {
      // For modern/classic, catIdx is ignored; skill goes into flat list
      const flat: string[] = Array.isArray(parsedData.skills)
        ? (parsedData.skills as string[]).filter((s) => typeof s === "string")
        : [];
      flat.push(skill.trim());
      applyUpdate({ ...parsedData, skills: flat });
    }
    setAddingSkillCat(null);
    setNewSkillText("");
  };

  const keepOriginalExperience = (expIdx: number) => {
    const origBullets = originalData?.experience?.[expIdx]?.bullets;
    if (!origBullets?.length) return;
    const exp = parsedData.experience.map((e: any, i: number) =>
      i === expIdx ? { ...e, bullets: [...origBullets] } : e,
    );
    applyUpdate({ ...parsedData, experience: exp });
  };

  const keepOriginalProject = (projIdx: number) => {
    const origProj = originalData?.projects?.[projIdx];
    if (!origProj) return;
    const projects = parsedData.projects.map((p: any, i: number) =>
      i === projIdx ? { ...origProj } : p,
    );
    applyUpdate({ ...parsedData, projects });
  };

  // ── Save / Regenerate ──────────────────────────────────────────────────────

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const text = JSON.stringify(parsedData, null, 2);
      const updated = await updateOptimizedResume(
        optimized.id,
        text,
        templateType,
      );
      setHasChanges(false);
      toast.success("Resume regenerated successfully!");
      if (onUpdate) onUpdate(updated);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to regenerate resume");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(parsedData, null, 2));
    setCopied(true);
    toast.success("Resume data copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const skillCategories = parsedData
    ? parseSkillCategories(parsedData.skills ?? [])
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* ── Header + action buttons ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>
            ✨ Optimized Resume Preview
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: "0.125rem",
            }}
          >
            Remove unwanted skills or bullets with ×, then Regenerate before
            downloading.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="btn btn-ghost btn-sm"
          >
            {copied ? (
              <>
                <CheckCheck
                  size={14}
                  style={{ color: "var(--accent-green)" }}
                />
                Copied!
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy JSON
              </>
            )}
          </button>

          {/* Download DOCX — uses authenticated fetch, not a plain link */}
          <button
            type="button"
            disabled={
              hasChanges || isGeneratingFiles || downloadingKind !== null
            }
            title={
              hasChanges
                ? "Regenerate first to apply your edits"
                : isGeneratingFiles
                  ? "Preparing files..."
                  : "Download DOCX"
            }
            className="btn btn-secondary btn-sm"
            style={{
              opacity:
                hasChanges || isGeneratingFiles || downloadingKind ? 0.5 : 1,
              cursor:
                hasChanges || isGeneratingFiles || downloadingKind
                  ? "not-allowed"
                  : "pointer",
            }}
            onClick={async () => {
              setDownloadingKind("docx");
              try {
                await downloadOptimizedDocx(optimized.id);
              } catch {
                toast.error("DOCX download failed. Please try again.");
              } finally {
                setDownloadingKind(null);
              }
            }}
          >
            <FileText size={14} />
            {downloadingKind === "docx" ? "Downloading…" : "Download DOCX"}
          </button>

          <button
            type="button"
            disabled={
              hasChanges || isGeneratingFiles || downloadingKind !== null
            }
            title={
              hasChanges
                ? "Regenerate first to apply your edits"
                : isGeneratingFiles
                  ? "Preparing files..."
                  : "Download PDF"
            }
            className="btn btn-secondary btn-sm"
            style={{
              opacity:
                hasChanges || isGeneratingFiles || downloadingKind ? 0.5 : 1,
              cursor:
                hasChanges || isGeneratingFiles || downloadingKind
                  ? "not-allowed"
                  : "pointer",
            }}
            onClick={async () => {
              setDownloadingKind("pdf");
              try {
                await downloadOptimizedPdf(optimized.id);
              } catch {
                toast.error("PDF download failed. Please try again.");
              } finally {
                setDownloadingKind(null);
              }
            }}
          >
            <FileText size={14} />
            {downloadingKind === "pdf" ? "Downloading…" : "Download PDF"}
          </button>

          {isGeneratingFiles && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--accent-orange)",
                padding: "0.4rem 0.5rem",
              }}
            >
              Preparing DOCX/PDF in background...
            </span>
          )}
        </div>
      </div>

      {/* ── Changes-pending banner ── */}
      {hasChanges && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.625rem 1rem",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: "8px",
            fontSize: "0.8125rem",
            color: "#92400e",
            gap: "1rem",
          }}
        >
          <span>
            ⚠ Changes pending — regenerate to update the document before
            downloading.
          </span>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="btn btn-sm"
            style={{
              background: "#f59e0b",
              color: "#fff",
              border: "none",
              flexShrink: 0,
            }}
          >
            {isUpdating ? (
              <>
                <div
                  className="spinner"
                  style={{
                    width: "13px",
                    height: "13px",
                    borderTopColor: "#fff",
                  }}
                />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                Regenerate
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Comparison view ── */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--bg-border)",
          borderRadius: "12px",
          padding: "1.5rem",
          maxHeight: "700px",
          overflowY: "auto",
          color: "var(--text-primary)",
        }}
      >
        {parsedData ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2rem",
              fontSize: "0.9rem",
            }}
          >
            {/* 1. Summary */}
            <div>
              <h4
                style={{
                  margin: 0,
                  marginBottom: "0.75rem",
                  color: "var(--brand-600)",
                  fontSize: "1rem",
                }}
              >
                📝 1. Summary
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                  gap: "1rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--bg-body)",
                    borderRadius: "6px",
                    border: "1px solid var(--bg-border)",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Original
                  </strong>
                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.6,
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    {originalData?.summary ||
                      "(No summary captured — re-optimize to enable comparison)"}
                  </p>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(59,130,246,0.05)",
                    borderRadius: "6px",
                    border: "1px solid rgba(59,130,246,0.2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <strong style={{ color: "var(--brand-600)" }}>
                      Optimized
                    </strong>
                    {!editingSummary && (
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSummaryDraft(parsedData.summary);
                            setEditingSummary(true);
                          }}
                          className="btn btn-ghost btn-sm"
                          style={{
                            padding: "2px 6px",
                            fontSize: "0.75rem",
                            gap: "0.25rem",
                          }}
                          title="Edit summary"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        {originalData?.summary && (
                          <button
                            type="button"
                            onClick={() =>
                              applyUpdate({
                                ...parsedData,
                                summary: originalData.summary,
                              })
                            }
                            className="btn btn-ghost btn-sm"
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.75rem",
                              gap: "0.25rem",
                              color: "var(--text-muted)",
                            }}
                            title="Revert to original summary"
                          >
                            <RotateCcw size={12} /> Keep Original
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {editingSummary ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <textarea
                        autoFocus
                        className="input"
                        style={{
                          minHeight: "120px",
                          fontSize: "0.875rem",
                          lineHeight: 1.6,
                          resize: "vertical",
                        }}
                        value={summaryDraft}
                        onChange={(e) => setSummaryDraft(e.target.value)}
                        placeholder="Edit professional summary…"
                        title="Edit professional summary"
                      />
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            applyUpdate({
                              ...parsedData,
                              summary: summaryDraft,
                            });
                            setEditingSummary(false);
                          }}
                        >
                          <Check size={12} /> Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingSummary(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        lineHeight: 1.6,
                        fontSize: "0.875rem",
                      }}
                    >
                      {parsedData.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Skills */}
            <div>
              <h4
                style={{
                  margin: 0,
                  marginBottom: "0.75rem",
                  color: "var(--brand-600)",
                  fontSize: "1rem",
                }}
              >
                🎯 2. Skills
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                  gap: "1rem",
                }}
              >
                {/* Original skills */}
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--bg-body)",
                    borderRadius: "6px",
                    border: "1px solid var(--bg-border)",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Original
                  </strong>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {(originalData?.skills || []).length > 0 ? (
                      // Handle both flat list and category strings
                      (originalData.skills as string[])
                        .flatMap((s: string) => {
                          if (s.includes(": ")) {
                            return (
                              s
                                .split(": ", 2)[1]
                                ?.split(", ")
                                .map((x) => x.trim())
                                .filter(Boolean) ?? []
                            );
                          }
                          return [s];
                        })
                        .map((skill: string, i: number) => (
                          <span
                            key={i}
                            style={{
                              padding: "0.2rem 0.45rem",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--bg-border)",
                              borderRadius: "4px",
                              fontSize: "0.82rem",
                            }}
                          >
                            {skill}
                          </span>
                        ))
                    ) : (
                      <span
                        style={{
                          fontSize: "0.82rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        No skills captured
                      </span>
                    )}
                  </div>
                </div>

                {/* Optimized skills — grouped by category for Mani, flat for modern/classic */}
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(59,130,246,0.05)",
                    borderRadius: "6px",
                    border: "1px solid rgba(59,130,246,0.2)",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      color: "var(--brand-600)",
                    }}
                  >
                    Optimized{" "}
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      (× remove · + add ·{" "}
                      <span style={{ color: "#15803d" }}>green = new</span>)
                    </span>
                  </strong>

                  {templateType === "mani" ? (
                    /* Mani: category-based layout */
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                      }}
                    >
                      {skillCategories.map((cat, catIdx) => (
                        <div key={catIdx}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: "#1f4e79",
                              display: "block",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {cat.category}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.35rem",
                              alignItems: "center",
                            }}
                          >
                            {cat.skills.map((skill, skillIdx) => {
                              const isNew = isNewSkill(skill);
                              return (
                                <span
                                  key={skillIdx}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.2rem",
                                    padding: "0.2rem 0.45rem",
                                    ...(isNew
                                      ? NEW_SKILL_STYLE
                                      : {
                                          background: "rgba(59,130,246,0.1)",
                                          color: "var(--brand-700)",
                                          border:
                                            "1px solid rgba(59,130,246,0.25)",
                                        }),
                                    borderRadius: "4px",
                                    fontSize: "0.82rem",
                                  }}
                                >
                                  {skill}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSkill(catIdx, skillIdx)
                                    }
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: "0 1px",
                                      lineHeight: 1,
                                      color: "inherit",
                                      opacity: 0.6,
                                      fontSize: "0.75rem",
                                    }}
                                    title={`Remove "${skill}"`}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.opacity = "1")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.opacity = "0.6")
                                    }
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              );
                            })}

                            {/* Per-category add skill */}
                            {addingSkillCat === catIdx ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                <input
                                  ref={newSkillInputRef}
                                  type="text"
                                  className="input"
                                  placeholder="Skill name"
                                  title="New skill name"
                                  value={newSkillText}
                                  onChange={(e) =>
                                    setNewSkillText(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addSkill(catIdx, newSkillText);
                                    }
                                    if (e.key === "Escape") {
                                      setAddingSkillCat(null);
                                      setNewSkillText("");
                                    }
                                  }}
                                  style={{
                                    height: "26px",
                                    fontSize: "0.8rem",
                                    padding: "0 0.4rem",
                                    width: "110px",
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => addSkill(catIdx, newSkillText)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#15803d",
                                    padding: "2px",
                                  }}
                                  title="Confirm"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingSkillCat(null);
                                    setNewSkillText("");
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--text-muted)",
                                    padding: "2px",
                                  }}
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewSkillText("");
                                  setAddingSkillCat(catIdx);
                                }}
                                style={{
                                  background: "none",
                                  border: "1px dashed var(--bg-border)",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: "0.15rem 0.4rem",
                                  fontSize: "0.75rem",
                                  color: "var(--text-muted)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.2rem",
                                }}
                                title={`Add skill to ${cat.category}`}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color =
                                    "var(--brand-400)";
                                  e.currentTarget.style.borderColor =
                                    "var(--brand-400)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color =
                                    "var(--text-muted)";
                                  e.currentTarget.style.borderColor =
                                    "var(--bg-border)";
                                }}
                              >
                                <Plus size={10} /> Add
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Modern/Classic: flat skill list */
                    <div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {((parsedData.skills as string[]) || [])
                          .filter((s) => typeof s === "string")
                          .map((skill: string, skillIdx: number) => {
                            const isNew = isNewSkill(skill);
                            return (
                              <span
                                key={skillIdx}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.2rem",
                                  padding: "0.2rem 0.45rem",
                                  ...(isNew
                                    ? NEW_SKILL_STYLE
                                    : {
                                        background: "rgba(59,130,246,0.1)",
                                        color: "var(--brand-700)",
                                        border:
                                          "1px solid rgba(59,130,246,0.25)",
                                      }),
                                  borderRadius: "4px",
                                  fontSize: "0.82rem",
                                }}
                              >
                                {skill}
                                <button
                                  type="button"
                                  onClick={() => removeSkill(0, skillIdx)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "0 1px",
                                    lineHeight: 1,
                                    color: "inherit",
                                    opacity: 0.6,
                                    fontSize: "0.75rem",
                                  }}
                                  title={`Remove "${skill}"`}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.opacity = "1")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.opacity = "0.6")
                                  }
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            );
                          })}

                        {/* Single global add button for modern/classic */}
                        {addingSkillCat === 0 ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <input
                              ref={newSkillInputRef}
                              type="text"
                              className="input"
                              placeholder="Skill name"
                              title="New skill name"
                              value={newSkillText}
                              onChange={(e) => setNewSkillText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addSkill(0, newSkillText);
                                }
                                if (e.key === "Escape") {
                                  setAddingSkillCat(null);
                                  setNewSkillText("");
                                }
                              }}
                              style={{
                                height: "26px",
                                fontSize: "0.8rem",
                                padding: "0 0.4rem",
                                width: "110px",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => addSkill(0, newSkillText)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#15803d",
                                padding: "2px",
                              }}
                              title="Confirm"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingSkillCat(null);
                                setNewSkillText("");
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-muted)",
                                padding: "2px",
                              }}
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setNewSkillText("");
                              setAddingSkillCat(0);
                            }}
                            style={{
                              background: "none",
                              border: "1px dashed var(--bg-border)",
                              borderRadius: "4px",
                              cursor: "pointer",
                              padding: "0.15rem 0.4rem",
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                            title="Add skill"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "var(--brand-400)";
                              e.currentTarget.style.borderColor =
                                "var(--brand-400)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--text-muted)";
                              e.currentTarget.style.borderColor =
                                "var(--bg-border)";
                            }}
                          >
                            <Plus size={10} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Experience */}
            <div>
              <h4
                style={{
                  margin: 0,
                  marginBottom: "0.75rem",
                  color: "var(--brand-600)",
                  fontSize: "1rem",
                }}
              >
                💼 3. Experience
              </h4>
              {parsedData.experience?.map((exp: any, expIdx: number) => {
                const origExp = originalData?.experience?.[expIdx];
                return (
                  <div
                    key={expIdx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                      gap: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    {/* Original */}
                    <div
                      style={{
                        padding: "1rem",
                        background: "var(--bg-body)",
                        borderRadius: "6px",
                        border: "1px solid var(--bg-border)",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          marginBottom: "0.5rem",
                          color: "var(--text-secondary)",
                          fontSize: "0.875rem",
                        }}
                      >
                        {origExp?.title || exp.title} ·{" "}
                        {origExp?.company || exp.company}
                      </strong>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: "1.25rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.35rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {origExp?.bullets?.length > 0 ? (
                          origExp.bullets.map((b: string, j: number) => (
                            <li
                              key={j}
                              style={{ lineHeight: 1.5, fontSize: "0.875rem" }}
                            >
                              {b}
                            </li>
                          ))
                        ) : (
                          <li style={{ fontSize: "0.875rem" }}>
                            No original data captured
                          </li>
                        )}
                      </ul>
                    </div>
                    {/* Optimized — keep 4, add 2 new (indices 4,5 are green) */}
                    <div
                      style={{
                        padding: "1rem",
                        background: "rgba(59,130,246,0.05)",
                        borderRadius: "6px",
                        border: "1px solid rgba(59,130,246,0.2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <strong
                          style={{
                            color: "var(--brand-600)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {exp.title} · {exp.company}
                        </strong>
                        {origExp?.bullets?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => keepOriginalExperience(expIdx)}
                            className="btn btn-ghost btn-sm"
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.72rem",
                              gap: "0.2rem",
                              color: "var(--text-muted)",
                              flexShrink: 0,
                            }}
                            title="Revert to original bullets"
                          >
                            <RotateCcw size={11} /> Keep Original
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem",
                        }}
                      >
                        {exp.bullets?.map((b: string, bulletIdx: number) => {
                          // A bullet is "new" if it doesn't appear verbatim in the original bullets
                          const origBullets: string[] = origExp?.bullets ?? [];
                          const strippedB = b
                            .replace(/\*\*([^*]+)\*\*/g, "$1")
                            .trim();
                          const isNew =
                            origBullets.length === 0
                              ? bulletIdx >= 4
                              : !origBullets.some((ob) => {
                                  const obClean = ob.trim();
                                  return (
                                    obClean === strippedB ||
                                    (strippedB.length > 20 &&
                                      obClean.slice(0, 80) ===
                                        strippedB.slice(0, 80))
                                  );
                                });
                          return (
                            <div
                              key={bulletIdx}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "0.4rem",
                                ...(isNew
                                  ? { ...NEW_BULLET_STYLE, marginLeft: "-4px" }
                                  : {}),
                              }}
                            >
                              <span
                                style={{
                                  color: isNew ? "#15803d" : "var(--brand-500)",
                                  flexShrink: 0,
                                  marginTop: "2px",
                                }}
                              >
                                •
                              </span>
                              <span
                                style={{
                                  lineHeight: 1.5,
                                  flex: 1,
                                  fontSize: "0.875rem",
                                }}
                              >
                                {isNew ? renderBold(b) : b}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  removeExperienceBullet(expIdx, bulletIdx)
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "2px",
                                  flexShrink: 0,
                                  color: "var(--text-muted)",
                                  opacity: 0.5,
                                  marginTop: "2px",
                                }}
                                title="Remove this bullet"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = "1";
                                  e.currentTarget.style.color = "#ef4444";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = "0.5";
                                  e.currentTarget.style.color =
                                    "var(--text-muted)";
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4. Projects */}
            {parsedData.projects?.length > 0 && (
              <div>
                <h4
                  style={{
                    margin: 0,
                    marginBottom: "0.75rem",
                    color: "var(--brand-600)",
                    fontSize: "1rem",
                  }}
                >
                  🚀 4. Projects
                </h4>
                {parsedData.projects?.map((proj: any, projIdx: number) => {
                  const origProj = originalData?.projects?.[projIdx];
                  // Original description: prefer description field, fall back to joining bullets
                  const origDesc =
                    origProj?.description ||
                    (origProj?.bullets as string[] | undefined)?.join(" ") ||
                    "";
                  const isNewProj = projIdx === 1; // Project 2 is entirely replaced
                  return (
                    <div
                      key={projIdx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                        gap: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {/* Original */}
                      <div
                        style={{
                          padding: "1rem",
                          background: "var(--bg-body)",
                          borderRadius: "6px",
                          border: "1px solid var(--bg-border)",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            marginBottom: "0.4rem",
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {origProj?.name || proj.name}
                        </strong>
                        <p
                          style={{
                            margin: 0,
                            lineHeight: 1.6,
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {origDesc || "—"}
                        </p>
                      </div>
                      {/* Optimized — description paragraph, green border if new */}
                      <div
                        style={{
                          padding: "1rem",
                          borderRadius: "6px",
                          background: isNewProj
                            ? "rgba(34,197,94,0.06)"
                            : "rgba(59,130,246,0.05)",
                          border: isNewProj
                            ? "1px solid rgba(34,197,94,0.35)"
                            : "1px solid rgba(59,130,246,0.2)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "0.4rem",
                          }}
                        >
                          <strong
                            style={{
                              color: isNewProj ? "#15803d" : "var(--brand-600)",
                              fontSize: "0.875rem",
                            }}
                          >
                            {proj.name}
                            {isNewProj && (
                              <span
                                style={{
                                  marginLeft: "0.5rem",
                                  fontSize: "0.7rem",
                                  fontWeight: 500,
                                  background: "rgba(34,197,94,0.2)",
                                  color: "#15803d",
                                  padding: "1px 6px",
                                  borderRadius: "10px",
                                }}
                              >
                                new
                              </span>
                            )}
                          </strong>
                          {origProj && (
                            <button
                              type="button"
                              onClick={() => keepOriginalProject(projIdx)}
                              className="btn btn-ghost btn-sm"
                              style={{
                                padding: "2px 6px",
                                fontSize: "0.72rem",
                                gap: "0.2rem",
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                              title="Revert to original project"
                            >
                              <RotateCcw size={11} /> Keep Original
                            </button>
                          )}
                        </div>
                        <p
                          style={{
                            margin: 0,
                            lineHeight: 1.6,
                            fontSize: "0.875rem",
                            color: isNewProj ? "#166534" : "inherit",
                          }}
                        >
                          {isNewProj
                            ? renderBold(proj.description || "—")
                            : proj.description || "—"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 5. Education */}
            {parsedData.education?.length > 0 && (
              <div>
                <h4
                  style={{
                    margin: 0,
                    marginBottom: "0.5rem",
                    color: "var(--brand-600)",
                    fontSize: "1rem",
                  }}
                >
                  🎓 5. Education
                </h4>
                {parsedData.education?.map((edu: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.75rem",
                      background: "var(--bg-body)",
                      borderRadius: "6px",
                      border: "1px solid var(--bg-border)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <strong>
                      {edu.degree} {edu.field}
                    </strong>{" "}
                    · {edu.institution} ({edu.year})
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "monospace",
              fontSize: "0.8125rem",
              margin: 0,
            }}
          >
            {optimized.optimized_text}
          </pre>
        )}
      </div>
    </div>
  );
}
