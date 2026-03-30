"use client";
import { useEffect, useState } from "react";
import { AnalysisResult, LearningResource } from "@/types";
import { useAuth } from "@/lib/auth";
import MatchScoreRing from "./MatchScoreRing";
import {
  CheckCircle,
  XCircle,
  Lightbulb,
  BookOpen,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  FileText,
  Zap,
  TrendingUp,
  Award,
  Star,
  Target,
  Shield,
  Activity,
  Layers,
} from "lucide-react";

interface AnalysisResultsProps {
  result: AnalysisResult;
  onOptimize: (templateType: string) => void;
  onCoverLetter: () => void;
  isOptimizing: boolean;
  isGeneratingCL: boolean;
}

function SkillSection({
  title,
  skills,
  chipClass,
  icon: Icon,
  iconColor,
}: {
  title: string;
  skills: string[];
  chipClass: string;
  icon: any;
  iconColor: string;
}) {
  if (!skills.length) return null;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.625rem",
        }}
      >
        <Icon size={14} style={{ color: iconColor }} />
        <span
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          {title}
        </span>
        <span
          className="badge badge-blue"
          style={{ fontSize: "0.6875rem", padding: "0.125rem 0.5rem" }}
        >
          {skills.length}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        {skills.map((s) => (
          <span key={s} className={`skill-chip ${chipClass}`}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function LearningSection({
  resources,
}: {
  resources: Record<string, LearningResource[]>;
}) {
  const entries = Object.entries(resources);
  if (!entries.length) return null;

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <BookOpen size={16} style={{ color: "var(--accent-purple)" }} />
        <h4 style={{ fontSize: "0.9375rem", margin: 0 }}>
          Skill Learning Resources
        </h4>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {entries.map(([skill, links]) => (
          <div key={skill} className="card" style={{ padding: "1rem" }}>
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                color: "var(--accent-purple)",
                marginBottom: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              <Sparkles size={12} /> Learn {skill}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.8125rem",
                    color: "var(--brand-400)",
                    textDecoration: "none",
                    padding: "0.375rem 0.5rem",
                    borderRadius: "6px",
                    background: "var(--bg-elevated)",
                  }}
                >
                  <ExternalLink size={11} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {link.title}
                  </span>
                  <span
                    className="badge badge-blue"
                    style={{
                      fontSize: "0.625rem",
                      marginLeft: "auto",
                      flexShrink: 0,
                    }}
                  >
                    {link.type}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Score breakdown pill
function ScorePill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.75rem 1rem",
        background: "var(--bg-elevated)",
        borderRadius: "12px",
        border: "1px solid var(--bg-border)",
        width: "90px",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: "1.125rem", fontWeight: 800, color }}>
        {value}
      </span>
      <span
        style={{
          fontSize: "0.625rem",
          color: "var(--text-muted)",
          textAlign: "center",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function AnalysisResults({
  result,
  onOptimize,
  onCoverLetter,
  isOptimizing,
  isGeneratingCL,
}: AnalysisResultsProps) {
  const { user } = useAuth();
  const [showGaps, setShowGaps] = useState(true);
  const [templateType, setTemplateType] = useState("mani");
  const [showRawBreakdown, setShowRawBreakdown] = useState(false);

  const allowedTemplates =
    user?.allowed_templates && user.allowed_templates.length
      ? user.allowed_templates
      : ["mani", "modern", "classic"];

  useEffect(() => {
    if (!allowedTemplates.includes(templateType)) {
      setTemplateType(allowedTemplates[0]);
    }
  }, [allowedTemplates, templateType]);

  const templateLabel: Record<string, string> = {
    mani: "Mani Template",
    modern: "Modern Template",
    classic: "Classic Template",
  };

  const score = Math.round(result.match_score);
  const scoreColor =
    score >= 75
      ? "var(--accent-green)"
      : score >= 50
        ? "var(--accent-orange)"
        : "var(--accent-red)";
  const scoreLabel =
    score >= 75
      ? "Strong Match"
      : score >= 50
        ? "Moderate Match"
        : "Weak Match";

  // Extract extra fields that come from raw AI analysis (not all are in the AnalysisResult type)
  const raw = result as any;
  const strengths: string[] = raw.strengths || [];
  const quickWins: string[] = raw.quick_wins || [];
  const eligibilityFlags: string[] = raw.eligibility_flags || [];
  const pythonStats = raw.python_match_stats || null;
  const semanticBoost = result.semantic_boost;
  const matchLabel: string = raw.match_label || scoreLabel;

  const matchedCount = result.matched_skills.length;
  const missingCount = result.missing_skills.length;
  const totalRequired = matchedCount + missingCount;
  const coveragePercent =
    totalRequired > 0 ? Math.round((matchedCount / totalRequired) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── Score Hero Row ────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          background:
            "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "1.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Score Ring & Stats */}
          <div
            style={{
              position: "relative",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
              alignSelf: "flex-start",
              marginTop: "-0.25rem",
            }}
          >
            <MatchScoreRing score={score} size={135} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.3rem 0.75rem",
                  background: "rgba(16,185,129,0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(16,185,129,0.15)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--accent-green)",
                  }}
                >
                  Matched
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "var(--accent-green)",
                  }}
                >
                  {matchedCount}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.3rem 0.75rem",
                  background: "rgba(239,68,68,0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(239,68,68,0.15)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--accent-red)",
                  }}
                >
                  Missing
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "var(--accent-red)",
                  }}
                >
                  {missingCount}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.3rem 0.75rem",
                  background: "rgba(96,165,250,0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(96,165,250,0.15)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--brand-400)",
                  }}
                >
                  Recom'd
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "var(--brand-400)",
                  }}
                >
                  {result.recommended_skills?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Score details */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.625rem",
                  fontWeight: 800,
                  marginBottom: "0.25rem",
                  color: scoreColor,
                }}
              >
                {matchLabel}
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {result.job_title}
                {result.company ? ` · ${result.company}` : ""}
              </div>
            </div>

            {/* Score breakdown pills */}
            <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
              <ScorePill
                label="Overall"
                value={`${score}%`}
                color={scoreColor}
              />
              <ScorePill
                label="Required"
                value={`${matchedCount}/${totalRequired}`}
                color="var(--brand-400)"
              />
              <ScorePill
                label="Coverage"
                value={`${coveragePercent}%`}
                color={
                  coveragePercent >= 70
                    ? "var(--accent-green)"
                    : "var(--accent-orange)"
                }
              />
              <ScorePill
                label="Semantic"
                value={
                  semanticBoost !== undefined && semanticBoost !== null
                    ? `${Math.round(semanticBoost * 100)}%`
                    : "--"
                }
                color="var(--accent-purple)"
              />
            </div>

            {/* Coverage progress bar */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.375rem",
                  fontWeight: 600,
                }}
              >
                <span>REQUIRED SKILL COVERAGE</span>
                <span>
                  {matchedCount} of {totalRequired} matched
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${coveragePercent}%`,
                    background:
                      coveragePercent >= 70
                        ? "linear-gradient(90deg, #10b981, #34d399)"
                        : coveragePercent >= 50
                          ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                          : "linear-gradient(90deg, #ef4444, #f87171)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
              minWidth: "180px",
            }}
          >
            <select
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
              className="input"
              style={{
                fontSize: "0.8125rem",
                padding: "0.5rem 0.875rem",
                height: "38px",
              }}
            >
              {allowedTemplates.map((t) => (
                <option key={t} value={t}>
                  {templateLabel[t] || `${t} Template`}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => onOptimize(templateType)}
              disabled={isOptimizing || !result.id}
              id="optimize-resume-btn"
              style={{
                width: "100%",
                height: "44px",
                opacity: result.id ? 1 : 0.6,
              }}
            >
              {isOptimizing ? (
                <>
                  <div className="spinner" style={{ borderTopColor: "#fff" }} />
                  Optimizing…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Optimize Resume
                </>
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={onCoverLetter}
              disabled={isGeneratingCL || !result.id}
              id="cover-letter-btn"
              style={{
                width: "100%",
                height: "40px",
                opacity: result.id ? 1 : 0.6,
              }}
            >
              {isGeneratingCL ? (
                <>
                  <div
                    className="spinner"
                    style={{ borderTopColor: "var(--brand-400)" }}
                  />
                  Generating…
                </>
              ) : (
                <>
                  <FileText size={15} />
                  Cover Letter
                </>
              )}
            </button>
            {result.job_url && (
              <a
                href={result.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{
                  width: "100%",
                  height: "38px",
                  textDecoration: "none",
                  justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <ExternalLink size={14} /> Apply Now
              </a>
            )}
            {!result.id && (
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <AlertCircle size={12} /> Track job to unlock optimization
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Reasoning ─────────────────────────────────────────────── */}
      {result.reasoning && (
        <div
          className="card"
          style={{
            padding: "1.5rem",
            background: "rgba(59,130,246,0.04)",
            border: "1px solid rgba(59,130,246,0.12)",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: "var(--brand-400)",
              marginBottom: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <Sparkles size={14} /> AI Match Analysis
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.9375rem",
              lineHeight: 1.75,
              color: "var(--text-primary)",
            }}
          >
            {result.reasoning}
          </p>
        </div>
      )}

      {/* ── Strengths + Quick Wins ────────────────────────────────────── */}
      {(strengths.length > 0 || quickWins.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          {strengths.length > 0 && (
            <div
              className="card"
              style={{
                padding: "1.25rem",
                background: "rgba(16,185,129,0.04)",
                border: "1px solid rgba(16,185,129,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.875rem",
                }}
              >
                <Award size={15} style={{ color: "var(--accent-green)" }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    color: "var(--accent-green)",
                  }}
                >
                  Your Strengths
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {strengths.slice(0, 4).map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      alignItems: "flex-start",
                    }}
                  >
                    <Star
                      size={12}
                      style={{
                        color: "var(--accent-green)",
                        marginTop: "3px",
                        flexShrink: 0,
                      }}
                    />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}
          {quickWins.length > 0 && (
            <div
              className="card"
              style={{
                padding: "1.25rem",
                background: "rgba(139,92,246,0.04)",
                border: "1px solid rgba(139,92,246,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.875rem",
                }}
              >
                <Zap size={15} style={{ color: "var(--accent-purple)" }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    color: "var(--accent-purple)",
                  }}
                >
                  Quick Wins
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {quickWins.slice(0, 4).map((w, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      alignItems: "flex-start",
                    }}
                  >
                    <TrendingUp
                      size={12}
                      style={{
                        color: "var(--accent-purple)",
                        marginTop: "3px",
                        flexShrink: 0,
                      }}
                    />
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Skills Grid ──────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1.25rem",
        }}
      >
        <SkillSection
          title="Matched Skills"
          skills={result.matched_skills}
          chipClass="skill-matched"
          icon={CheckCircle}
          iconColor="var(--accent-green)"
        />
        <SkillSection
          title="Missing Skills"
          skills={result.missing_skills}
          chipClass="skill-missing"
          icon={XCircle}
          iconColor="var(--accent-red)"
        />
        <SkillSection
          title="Recommended"
          skills={result.recommended_skills}
          chipClass="skill-recommended"
          icon={Lightbulb}
          iconColor="var(--brand-400)"
        />
      </div>

      {/* ── Experience Gaps ───────────────────────────────────────────── */}
      {result.experience_gaps.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowGaps(!showGaps)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "none",
              border: "none",
              color: "var(--text-primary)",
              cursor: "pointer",
              width: "100%",
              padding: 0,
              fontSize: "0.9375rem",
              fontWeight: 600,
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
          >
            <Activity size={16} style={{ color: "var(--accent-orange)" }} />
            Experience Gaps
            <span
              className="badge badge-orange"
              style={{ fontSize: "0.6875rem" }}
            >
              {result.experience_gaps.length}
            </span>
            <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
              {showGaps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>
          {showGaps && (
            <div
              style={{
                marginTop: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {result.experience_gaps.map((gap, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "0.625rem",
                    padding: "0.625rem 0.875rem",
                    background: "rgba(245,158,11,0.06)",
                    borderRadius: "8px",
                    border: "1px solid rgba(245,158,11,0.12)",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{ color: "var(--accent-orange)", marginTop: "1px" }}
                  >
                    ▸
                  </span>
                  {gap}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Eligibility Flags ─────────────────────────────────────────── */}
      {eligibilityFlags.length > 0 && (
        <div
          className="card"
          style={{
            background: "rgba(239,68,68,0.04)",
            border: "1px solid rgba(239,68,68,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <Shield size={15} style={{ color: "var(--accent-red)" }} />
            <span
              style={{
                fontWeight: 700,
                fontSize: "0.875rem",
                color: "var(--accent-red)",
              }}
            >
              Eligibility Flags
            </span>
            <span className="badge badge-red" style={{ fontSize: "0.6875rem" }}>
              {eligibilityFlags.length}
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {eligibilityFlags.map((flag, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "0.625rem",
                  alignItems: "flex-start",
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                }}
              >
                <AlertCircle
                  size={13}
                  style={{
                    color: "var(--accent-red)",
                    marginTop: "2px",
                    flexShrink: 0,
                  }}
                />
                {flag}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Score Breakdown (collapsible) ─────────────────────────────── */}
      {pythonStats && (
        <div className="card" style={{ padding: "1rem 1.25rem" }}>
          <button
            onClick={() => setShowRawBreakdown(!showRawBreakdown)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              width: "100%",
              padding: 0,
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
          >
            <Layers size={14} />
            Score Breakdown
            <span style={{ marginLeft: "auto" }}>
              {showRawBreakdown ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </span>
          </button>
          {showRawBreakdown && (
            <div
              style={{
                marginTop: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    Python base score:
                  </span>{" "}
                  <strong>{pythonStats.base_score}%</strong>
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    LLM clamped to:
                  </span>{" "}
                  <strong>{pythonStats.score_range}%</strong>
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    Skills evaluated:
                  </span>{" "}
                  <strong>
                    {pythonStats.matched_count}/{pythonStats.total_required}{" "}
                    required
                  </strong>
                </div>
                {semanticBoost !== undefined && semanticBoost !== null && (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      Semantic context:
                    </span>{" "}
                    <strong style={{ color: "var(--accent-purple)" }}>
                      {Math.round(semanticBoost * 100)}%
                    </strong>
                  </div>
                )}
              </div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  margin: "0.25rem 0 0",
                }}
              >
                Base score uses Python matching (70% required + 30% preferred).
                LLM holistic analysis adjusts final score within ±10 points of
                the base.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Learning Resources ────────────────────────────────────────── */}
      {Object.keys(result.learning_resources || {}).length > 0 && (
        <div className="card">
          <LearningSection resources={result.learning_resources} />
        </div>
      )}
    </div>
  );
}
