import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Send,
  User,
  Stethoscope,
  Pencil,
  MessageCircle,
  ShieldCheck,
  Users,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  Info,
  Link2,
  BarChart2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  History,

} from "lucide-react";
import { Header } from "../components/Header";
import { AppLayout } from "../layouts/AppLayout";
import {
  getRagResponse,
  getChatSession,
  ChatSessionDetail,
  ChatSessionSummary,
  RagResponse,
  getDrugProfile,
  DrugProfileResponse,
  getContextStatus,
  rolloverSession,
  RagSource,
} from "../data/ragService";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { ConversationHistory } from "../components/ConversationHistory";

const NO_INFO = "No verified information available in the current knowledge base.";
const DISCLAIMER =
  "This information is from official medical sources and is not a substitute for professional medical advice.";

function buildSuggestedQuestions(drug: string): string[] {
  return [
    `What is ${drug} used for?`,
    `What is the recommended dosage?`,
    `What are the common side effects?`,
    `Can I take ${drug.toLowerCase()} with ibuprofen?`,
    `What precautions should I know?`,
    `I accidentally took twice my prescribed dose. What should I do?`,
  ];
}

interface TurnItem {
  id: string;
  question: string;
  timestamp: string;
  isFetching: boolean;
  answerState: "typing" | "revealed";
  ragData: RagResponse | null;
  isEscalated?: boolean;
}

function hydrateSessionTurns(
  session: ChatSessionDetail,
  mode: "patient" | "professional"
): TurnItem[] {
  const restored: TurnItem[] = [];
  const messages = session.messages || [];
  const fallbackTimestamp = session.updated_at
    ? new Date(session.updated_at * 1000).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role !== "human" && message.role !== "user") continue;

    const answer = messages[i + 1];
    if (!answer || (answer.role !== "ai" && answer.role !== "assistant")) continue;

    restored.push({
      id: String(message.id),
      question: message.content,
      timestamp: fallbackTimestamp,
      isFetching: false,
      answerState: "revealed",
      ragData: {
        question: message.content,
        medication: session.drug_name || "",
        mode,
        risk_level: "normal",
        answerLead: answer.content,
        bulletPoints: [],
        answerFollowUp: "",
        disclaimer: DISCLAIMER,
        confidence: "Medium",
        confidenceDetail: "Restored from your saved conversation history.",
        sources: [],
        requestId: null,
      },
    });
  }

  return restored;
}
const CHAT_STORAGE_PREFIX = "drugdoc_chat_turns";

function getChatStorageKey(drug: string, mode: string, sessionId: string | null): string {
  return CHAT_STORAGE_PREFIX + ":" + (sessionId || "no-session") + ":" + drug.toLowerCase() + ":" + mode;
}
// ── Typing dots animation component ──────────────────────────────────────────
const TypingDots: React.FC = () => (
  <span className="f03-typing-dots" aria-label="DrugDoc AI is thinking">
    <span className="dot" />
    <span className="dot" />
    <span className="dot" />
  </span>
);

// ── Bot avatar ────────────────────────────────────────────────────────────────
const BotAvatar: React.FC = () => (
  <div className="f03-bot-avatar" aria-hidden="true">
    <div className="bot-avatar-inner">
      <div className="bot-pill bot-pill-a" />
      <div className="bot-pill bot-pill-b" />
    </div>
  </div>
);

// ── Main Page (Handles Multi-turn Chat, F-03 Greeting, F-04 Answer, F-06 High-Risk & F-07 Low-Confidence) ───
export const AskQuestion: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const sessionId = searchParams.get("session");
  const [sessionDrug, setSessionDrug] = useState("");
  const drug = searchParams.get("drug") || sessionDrug;
  const mode = (searchParams.get("mode") || (user?.role === "doctor" ? "professional" : "patient")) as "patient" | "professional";

  const [drugProfile, setDrugProfile] = useState<DrugProfileResponse | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDrugProfile(drug)
      .then((data) => {
        if (!cancelled) setDrugProfile(data);
      })
      .catch(() => {
        if (!cancelled) setDrugProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [drug]);

  useEffect(() => {
    if (!sessionId) {
      navigate("/select", { replace: true });
      return;
    }

    let cancelled = false;
    setSessionLoadError(null);
    setTurns([]);

    getChatSession(sessionId)
      .then((session) => {
        if (cancelled) return;

        const loadedDrug = session.drug_name || "";
        setSessionDrug(loadedDrug);

        const next = new URLSearchParams(searchParams);
        if (loadedDrug && next.get("drug") !== loadedDrug) {
          next.set("drug", loadedDrug);
          setSearchParams(next, { replace: true });
        }

        const cacheKey = getChatStorageKey(
          loadedDrug || next.get("drug") || "your-medication",
          next.get("mode") || mode,
          sessionId
        );
        let restoredFromCache: TurnItem[] = [];

        try {
          const cached = sessionStorage.getItem(cacheKey);
          const parsed = cached ? JSON.parse(cached) : null;
          if (Array.isArray(parsed)) restoredFromCache = parsed;
        } catch {
          restoredFromCache = [];
        }

        if (!cancelled) {
          setTurns(
            restoredFromCache.length > 0
              ? restoredFromCache
              : hydrateSessionTurns(session, mode)
          );
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setSessionLoadError(
          error instanceof Error
            ? error.message
            : "Could not load this conversation."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, sessionId, mode, setSearchParams]);



  const suggestedQuestions = buildSuggestedQuestions(drug || "your medication");

  // Conversation history turns
  const [turns, setTurns] = useState<TurnItem[]>(() => {
  try {
    const key = getChatStorageKey(drug, mode, sessionId);
    const stored = sessionStorage.getItem(key);

    if (!stored) return [];

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});
useEffect(() => {
  try {
    const key = getChatStorageKey(drug, mode, sessionId);
    if (sessionId) sessionStorage.setItem(key, JSON.stringify(turns));
  } catch {
    // Ignore storage failures.
  }
}, [turns, drug, mode, sessionId]);
  const [nearLimit, setNearLimit] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [rolloverNotice, setRolloverNotice] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourcesCardRef = useRef<HTMLDivElement>(null);
  const [highlightSources, setHighlightSources] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // F-03 Greeting state (triggers typing dots on initial load)
  const [greetingState, setGreetingState] = useState<"typing" | "revealed">("typing");
  useEffect(() => {
    if (turns.length === 0) {
      setGreetingState("typing");
      const t = setTimeout(() => setGreetingState("revealed"), 1200);
      return () => clearTimeout(t);
    }
  }, [turns.length, drug]);

  // Clean transient question-state params without dropping the active session URL.
  useEffect(() => {
    if (searchParams.get("q") || searchParams.get("risk") || searchParams.get("confidence")) {
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      next.delete("risk");
      next.delete("confidence");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-scroll chat window to bottom when new turns arrive or finishes loading
  useEffect(() => {
    if (turns.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns]);

  // Submit question -> appends to turns
  const handleAskQuestion = useCallback(
    (q: string) => {
      const cleanQ = q.trim();
      if (!cleanQ) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const turnId = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

      const newTurn: TurnItem = {
        id: turnId,
        question: cleanQ,
        timestamp: timeStr,
        isFetching: true,
        answerState: "typing",
        ragData: null,
      };

      setTurns((prev) => [...prev, newTurn]);
      setInputValue("");

      if (!sessionId) return;

      getRagResponse(cleanQ, drug, mode, sessionId)
        .then(async (data) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? { ...t, isFetching: false, answerState: "revealed", ragData: data }
                : t
            )
          );
          // Check context status after answer is returned
          const status = await getContextStatus(sessionId);
          if (status && status.near_limit) {
            setNearLimit(true);
          }
        })
        .catch(() => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    isFetching: false,
                    answerState: "revealed",
                    ragData: {
                      question: cleanQ,
                      medication: drug,
                      mode,
                      risk_level: "normal",
                      answerLead: "Something went wrong reaching DrugDoc AI's backend.",
                      bulletPoints: [],
                      answerFollowUp: "Please check your connection and try again.",
                      disclaimer: DISCLAIMER,
                      confidence: "Low",
                      confidenceDetail: "Backend request failed.",
                      sources: [],
                    },
                  }
                : t
            )
          );
        });
    },
    [drug, mode, sessionId]
  );

  const handleSend = () => {
    if (!inputValue.trim()) return;
    handleAskQuestion(inputValue);
  };

  const handleSuggestedClick = (q: string) => {
    handleAskQuestion(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSourcesClick = () => {
    setHighlightSources(true);
    sourcesCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => setHighlightSources(false), 2000);
  };

  const handleEscalateTurn = (turnId: string) => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, isEscalated: true } : t))
    );
  };

  const handleViewDocs = () => {
    navigate(`/sources?drug=${encodeURIComponent(drug)}&mode=${mode}`);
  };

  const handleOpenSession = (session: ChatSessionSummary) => {
    const nextMode = mode;
    navigate(
      `/results?session=${encodeURIComponent(session.session_id)}&drug=${encodeURIComponent(session.drug_name || "")}&mode=${nextMode}`
    );
    setShowHistory(false);
  };

  const handleNewChat = () => {
    setShowHistory(false);
    navigate("/select");
  };

  const handleDeletedActive = () => {
    setShowHistory(false);
    navigate("/select");
  };

  const handleRollover = async () => {
    if (!sessionId) return;
    setIsRollingOver(true);
    const res = await rolloverSession(sessionId);
    setIsRollingOver(false);
    if (res) {
      const next = new URLSearchParams(searchParams);
      next.set("session", res.new_session_id);
      if (drug) next.set("drug", drug);
      next.set("mode", mode);
      setSearchParams(next, { replace: true });
      setNearLimit(false);
      setRolloverNotice("Session context limit reached. Rolled over to a new session with retained context summary.");
      setTimeout(() => setRolloverNotice(null), 8000);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [inputValue]);

  // Aggregate or latest active sources for right column
  const activeSources: RagSource[] = React.useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].ragData?.sources && turns[i].ragData!.sources.length > 0) {
        return turns[i].ragData!.sources;
      }
    }
    return [];
  }, [turns]);

  const modeLabel = mode === "patient" ? "Patient / Caregiver" : "Healthcare Professional";
  const modeDesc =
    mode === "patient"
      ? "Simple, easy-to-understand information."
      : "Detailed, technical information with clinical context.";
  const ModeIcon = mode === "patient" ? User : Stethoscope;

  return (
    <AppLayout className="f03-page f04-page">
      <Header showAvatar={true} />

      <section className="f03-container container">
        {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
        <div className="f03-left-col">
          <div className="f02-step-indicator">
            <span className="step-label">STEP 2 OF 2</span>
            <div className="step-bar">
              <span className="step-segment step-active" />
              <span className="step-segment step-active" />
            </div>
          </div>

          <h1 className="f02-heading">
            Ask with<br />confidence.
          </h1>

          <p className="f02-subtext">
            Get clear, evidence-based answers about your medication from trusted medical sources.
          </p>

          <div className="f02-benefits-list">
            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <MessageCircle size={17} />
              </div>
              <div>
                <strong>Reliable information</strong>
                <span>Based on official medical sources.</span>
              </div>
            </div>

            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>Ask anything</strong>
                <span>Side effects, interactions, dosage and more.</span>
              </div>
            </div>

            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <Users size={17} />
              </div>
              <div>
                <strong>Tailored to your role</strong>
                <span>Answers that match your needs.</span>
              </div>
            </div>
          </div>

          {/* Decorative pill art */}
          <div className="f03-left-art" aria-hidden="true">
            <div className="f03-art-blister">
              <div className="f03-art-pill f03-art-pill-lg f03-art-pill-red" />
              <div className="f03-art-pill f03-art-pill-lg f03-art-pill-teal" />
              <div className="f03-art-pill f03-art-pill-sm f03-art-pill-orange" />
              <div className="f03-art-pill f03-art-pill-sm f03-art-pill-orange" />
              <div className="f03-art-pill f03-art-pill-sm f03-art-pill-orange" />
              <div className="f03-art-circle" />
            </div>
          </div>
        </div>

        {/* ── CENTER COLUMN ─────────────────────────────────────────────── */}
        <div className="f03-center-col">
          <div className="f03-chat-card f04-card-main">
            {sessionLoadError && (
              <div role="alert" style={{ padding: "12px 20px", color: "var(--orange-700, #b45309)" }}>
                {sessionLoadError}
              </div>
            )}
            {/* 1. Selected medication + mode bar */}
            <div className="f03-selection-bar">
              <div className="f03-sel-drug">
                <div className="f03-sel-pill-icon" aria-hidden="true">
                  <div className="sel-pill sel-pill-top" />
                  <div className="sel-pill sel-pill-bottom" />
                </div>
                <div className="f03-sel-drug-info">
                  <span className="f03-sel-label">Selected Medication</span>
                  <span className="f03-sel-drug-name">{drug}</span>
                  <span className="f03-sel-drug-desc">Selected medication</span>
                </div>
              </div>

              <div className="f03-sel-divider" />

              <div className="f03-sel-mode">
                <div className={`f03-sel-mode-icon ${mode === "patient" ? "f03-mode-blush" : "f03-mode-green"}`}>
                  <ModeIcon size={18} />
                </div>
                <div className="f03-sel-mode-info">
                  <span className="f03-sel-mode-name">{modeLabel}</span>
                  <span className="f03-sel-mode-desc">{modeDesc}</span>
                </div>
              </div>

              <button
                className="f03-history-btn"
                onClick={() => setShowHistory(true)}
                aria-label="Open previous conversations"
              >
                <History size={13} />
                History
              </button>

              <button
                className="f03-change-btn"
                onClick={() => navigate("/select")}
                aria-label="Change medication or mode"
              >
                <Pencil size={13} />
                Change
              </button>
            </div>

            {/* 2. CHAT STREAM / CONTENT */}
            {turns.length === 0 ? (
              /* ── F-03 GREETING & SUGGESTIONS VIEW ── */
              <>
                <div className="f03-chat-area">
                  <div className="f03-message f03-message-bot">
                    <BotAvatar />
                    <div className="f03-message-bubble">
                      {greetingState === "typing" ? (
                        <TypingDots />
                      ) : (
                        <>
                          <p className="f03-greeting-title">Hello! I'm DrugDoc AI.</p>
                          <p className="f03-greeting-body">
                            Ask me anything about {drug}. I'll provide clear, evidence-based information from trusted medical sources.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="f03-suggested-section">
                  <div className="f03-suggested-header">
                    <Lightbulb size={16} className="f03-suggested-icon" />
                    <span className="f03-suggested-title">Suggested Questions</span>
                  </div>
                  <div className="f03-questions-grid">
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        className="f03-question-chip"
                        onClick={() => handleSuggestedClick(q)}
                      >
                        <span>{q}</span>
                        <ArrowRight size={14} className="f03-chip-arrow" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input area for F-03 */}
                <div className="f03-input-wrapper f04-input-container">
                  <textarea
                    ref={textareaRef}
                    className="f03-textarea"
                    placeholder="Type your question here..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    aria-label="Ask a question about this medication"
                  />
                  <div className="f03-input-actions">
                    <button
                      className={`f03-send-btn ${inputValue.trim() ? "f03-send-btn--active" : ""}`}
                      onClick={handleSend}
                      aria-label="Send question"
                      type="button"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
                <p className="f03-input-hint">
                  Press Enter to send&nbsp;&nbsp;•&nbsp;&nbsp;Shift + Enter for a new line
                </p>
              </>
            ) : (
              /* ── MULTI-TURN CONVERSATION STREAM VIEW ── */
              <div style={{ padding: "16px 20px" }}>
                <div className="f04-chat-area" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {turns.map((turn) => {
                    const isHighRisk = turn.ragData?.risk_level === "high";
                    const isLowConfidence =
                      !isHighRisk &&
                      (turn.ragData?.confidence === "Low" || turn.ragData?.confidence === "low");

                    if (isHighRisk) {
                      return (
                        <div key={turn.id} className="f06-container" style={{ width: "100%", margin: 0, padding: 0 }}>
                          <div className="f06-high-risk-card">
                            <div className="f06-warning-header">
                              <AlertTriangle size={34} className="f06-warning-icon" />
                              <div>
                                <h3 className="f06-warning-title">HIGH-RISK QUESTION</h3>
                                <p className="f06-warning-sub">
                                  This question may require individual medical evaluation.
                                </p>
                              </div>
                            </div>

                            <div className="f06-user-container">
                              <div className="f04-user-row" style={{ margin: "0 0 2px auto", maxWidth: "100%" }}>
                                <div className="f04-user-avatar" aria-hidden="true">
                                  <span>{user.avatarInitial}</span>
                                </div>
                                <div className="f04-user-bubble">
                                  <p className="f04-user-text">{turn.question}</p>
                                </div>
                              </div>
                              <div className="f04-user-meta">
                                <span className="f04-timestamp">{turn.timestamp}</span>
                              </div>
                            </div>

                            <div className="f06-paragraphs">
                              <p>{turn.ragData?.answerLead}</p>
                              <p>{turn.ragData?.answerFollowUp}</p>
                            </div>

                            <div className="f06-actions-list">
                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={() => handleEscalateTurn(turn.id)}
                                >
                                  <div className="f06-action-btn-left">
                                    <User size={18} />
                                    <span>Escalate to Human Expert</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  Get in touch with a qualified healthcare professional.
                                </span>
                              </div>

                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={handleViewDocs}
                                >
                                  <div className="f06-action-btn-left">
                                    <FileText size={18} />
                                    <span>View Relevant Documentation</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  See official safety information from trusted medical sources.
                                </span>
                              </div>

                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={() => textareaRef.current?.focus()}
                                >
                                  <div className="f06-action-btn-left">
                                    <MessageCircle size={18} />
                                    <span>Ask Another Question</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  Ask a follow-up question below.
                                </span>
                              </div>
                            </div>

                            {turn.isEscalated && (
                              <div className="f06-escalation-alert">
                                <CheckCircle2 size={18} color="var(--teal-700)" />
                                <span>
                                  Escalation initiated. A qualified clinical pharmacist has been notified.
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (isLowConfidence) {
                      return (
                        <div key={turn.id} className="f06-container f07-container" style={{ width: "100%", margin: 0, padding: 0 }}>
                          <div className="f07-low-conf-card">
                            <div className="f07-warning-header">
                              <AlertTriangle size={34} className="f07-warning-icon" />
                              <div>
                                <h3 className="f07-warning-title">LOW CONFIDENCE ANSWER</h3>
                                <p className="f07-warning-sub">
                                  We're not fully confident about this answer.
                                </p>
                              </div>
                            </div>

                            <div className="f06-user-container">
                              <div className="f04-user-row" style={{ margin: "0 0 2px auto", maxWidth: "100%" }}>
                                <div className="f04-user-avatar" aria-hidden="true">
                                  <span>{user.avatarInitial}</span>
                                </div>
                                <div className="f04-user-bubble">
                                  <p className="f04-user-text">{turn.question}</p>
                                </div>
                              </div>
                              <div className="f04-user-meta">
                                <span className="f04-timestamp">{turn.timestamp}</span>
                              </div>
                            </div>

                            <div className="f06-paragraphs">
                              <p>{turn.ragData?.answerLead}</p>
                              <p>{turn.ragData?.answerFollowUp}</p>
                            </div>

                            <div className="f06-actions-list">
                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={() => handleEscalateTurn(turn.id)}
                                >
                                  <div className="f06-action-btn-left">
                                    <User size={18} />
                                    <span>Escalate to Human Expert</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  Get in touch with a qualified healthcare professional.
                                </span>
                              </div>

                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={handleViewDocs}
                                >
                                  <div className="f06-action-btn-left">
                                    <FileText size={18} />
                                    <span>View Related Documentation</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  See available information from trusted medical sources.
                                </span>
                              </div>

                              <div className="f06-action-item">
                                <button
                                  type="button"
                                  className="f06-action-btn"
                                  onClick={() => textareaRef.current?.focus()}
                                >
                                  <div className="f06-action-btn-left">
                                    <MessageCircle size={18} />
                                    <span>Try a Different Question</span>
                                  </div>
                                  <ArrowRight size={18} />
                                </button>
                                <span className="f06-action-subtext">
                                  Rephrase or ask a more specific question below.
                                </span>
                              </div>
                            </div>

                            {turn.isEscalated && (
                              <div className="f06-escalation-alert">
                                <CheckCircle2 size={18} color="var(--teal-700)" />
                                <span>
                                  Escalation initiated. A qualified clinical pharmacist has been notified.
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Normal Turn (F-04)
                    return (
                      <div key={turn.id} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {/* User Question */}
                        <div className="f04-user-row">
                          <div className="f04-user-avatar" aria-hidden="true">
                            <span>{user.avatarInitial}</span>
                          </div>
                          <div className="f04-user-bubble">
                            <p className="f04-user-text">{turn.question}</p>
                          </div>
                        </div>
                        <div className="f04-user-meta">
                          <span className="f04-timestamp">{turn.timestamp}</span>
                        </div>

                        {/* DrugDoc AI Response */}
                        <div className="f04-bot-row">
                          <BotAvatar />
                          <div className="f04-bot-bubble">
                            {turn.answerState === "typing" ? (
                              <div className="f04-typing-wrapper">
                                <TypingDots />
                              </div>
                            ) : (
                              turn.ragData && (
                                <div className="f04-answer-content">
                                  <p className="f04-answer-lead" style={{ whiteSpace: "pre-wrap" }}>
                                    {turn.ragData.answerLead}
                                  </p>

                                  {turn.ragData.bulletPoints && turn.ragData.bulletPoints.length > 0 && (
                                    <ul className="f04-side-effects-list">
                                      {turn.ragData.bulletPoints.map((bp, idx) => (
                                        <li key={idx}>
                                          {bp.label && <strong>{bp.label} </strong>}
                                          {bp.text}
                                        </li>
                                      ))}
                                    </ul>
                                  )}

                                  {turn.ragData.answerFollowUp && (
                                    <p className="f04-answer-sub">
                                      {turn.ragData.answerFollowUp}
                                    </p>
                                  )}

                                  {/* Embedded Medical Disclaimer */}
                                  <div className="f04-answer-disclaimer">
                                    <div className="f04-disclaimer-icon-wrap" aria-hidden="true">
                                      <Info size={16} />
                                    </div>
                                    <p className="f04-disclaimer-text">{turn.ragData.disclaimer}</p>
                                  </div>

                                  {/* Answer Metadata Bar */}
                                  <div className="f04-meta-bar">
                                    <div className="f04-meta-confidence">
                                      <div className="f04-confidence-header">
                                        <div className="f04-conf-icon" aria-hidden="true">
                                          <BarChart2 size={16} />
                                        </div>
                                        <span className="f04-conf-badge">
                                          Confidence: {turn.ragData.confidence}
                                        </span>
                                        <Info size={13} className="f04-info-hint" />
                                      </div>
                                      <span className="f04-meta-sub">{turn.ragData.confidenceDetail}</span>
                                    </div>

                                    {turn.ragData.qualityMetrics && (
                                      <div className="f04-quality-metrics" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                                        {([
                                          ["Retrieval Precision", turn.ragData.qualityMetrics.retrieval_precision],
                                          ["Answer Correctness", turn.ragData.qualityMetrics.answer_correctness],
                                          ["Citation Accuracy", turn.ragData.qualityMetrics.citation_accuracy],
                                        ] as const).map(([label, value]) => value != null && (
                                          <span key={label} className="f04-meta-sub" title={turn.ragData?.qualityMetrics?.methodology || "Live grounding estimate"}>
                                            {label}: <strong>{Math.round(value * 100)}%</strong>
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    <div className="f04-meta-divider" />

                                    <button
                                      type="button"
                                      className="f04-meta-sources"
                                      onClick={handleSourcesClick}
                                      aria-label="View sources in sidebar"
                                    >
                                      <div className="f04-sources-header">
                                        <FileText size={15} className="f04-sources-icon" />
                                        <span className="f04-sources-title">
                                          Sources: {turn.ragData.sources.length}
                                        </span>
                                        <ArrowRight size={14} className="f04-sources-arrow" />
                                      </div>
                                      <span className="f04-meta-sub">View sources in the sidebar</span>
                                    </button>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                        {turn.answerState === "revealed" && (
                          <div className="f04-bot-meta">
                            <span className="f04-timestamp">{turn.timestamp}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div ref={chatEndRef} />
                </div>

                {/* Non-blocking Rollover prompt banner */}
                {nearLimit && (
                  <div
                    style={{
                      marginTop: "16px",
                      marginBottom: "8px",
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#92400e" }}>
                      <AlertTriangle size={18} />
                      <span>This chat session is near its memory limit. Continue in a new session with retained summary?</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRollover}
                      disabled={isRollingOver}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: "var(--teal-700, #0d9488)",
                        color: "#fff",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isRollingOver ? "Rolling over..." : "Continue in New Session"}
                    </button>
                  </div>
                )}

                {/* Rollover confirmation notification */}
                {rolloverNotice && (
                  <div
                    style={{
                      marginTop: "16px",
                      marginBottom: "8px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#065f46",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{rolloverNotice}</span>
                  </div>
                )}

                {/* Input area for continuous chat stream */}
                <div className="f03-input-wrapper f04-input-container" style={{ marginTop: "16px" }}>
                  <textarea
                    ref={textareaRef}
                    className="f03-textarea"
                    placeholder="Ask a follow-up question..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    aria-label="Ask a question about this medication"
                  />
                  <div className="f03-input-actions">
                    <button
                      className={`f03-send-btn ${inputValue.trim() ? "f03-send-btn--active" : ""}`}
                      onClick={handleSend}
                      aria-label="Send question"
                      type="button"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
                <p className="f03-input-hint">
                  Press Enter to send&nbsp;&nbsp;•&nbsp;&nbsp;Shift + Enter for a new line
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
        <div className="f03-right-col">
          {turns.length > 0 && (
            <>
              {/* About [Medication] */}
              <div className="f03-info-card">
                <div className="f03-info-card-header">
                  <div className="guidance-icon-badge">
                    <FileText size={15} />
                  </div>
                  <h4 className="f03-info-card-title">About {drug}</h4>
                </div>

                <p className="f03-info-card-sub">
                  Quick facts from official sources.
                </p>

                <div className="f03-drug-facts">
                  <div className="f03-fact-row">
                    <span className="f03-fact-label">Drug class</span>
                    <span className="f03-fact-value">
                      {drugProfile?.class || NO_INFO}
                    </span>
                  </div>

                  <div className="f03-fact-row">
                    <span className="f03-fact-label">Available as</span>
                    <span className="f03-fact-value">
                      {drugProfile?.forms && drugProfile.forms.length > 0
                        ? drugProfile.forms.join(", ")
                        : NO_INFO}
                    </span>
                  </div>

                  <div className="f03-fact-row">
                    <span className="f03-fact-label">Common brands</span>
                    <span className="f03-fact-value">{NO_INFO}</span>
                  </div>
                </div>

                <button
                  className="f03-info-link"
                  type="button"
                  onClick={() =>
                    navigate(
                      `/medication-info?drug=${encodeURIComponent(drug)}&mode=${mode}`
                    )
                  }
                >
                  View full drug information <ArrowRight size={13} />
                </button>
              </div>

              {/* Sources */}
              <div
                ref={sourcesCardRef}
                className={`f03-info-card f04-sources-card ${
                  highlightSources ? "f04-sources-card--highlight" : ""
                }`}
              >
                <div className="f03-info-card-header">
                  <div
                    className="guidance-icon-badge"
                    style={{
                      background: "rgba(30,138,142,0.12)",
                      color: "var(--teal-700)",
                    }}
                  >
                    <Link2 size={15} />
                  </div>
                  <h4 className="f03-info-card-title">Sources</h4>
                </div>

                <p className="f03-info-card-sub">
                  Information from trusted medical sources.
                </p>

                <div className="f04-sources-list">
                  {activeSources.map((src) => (
                    <div key={src.id} className="f04-source-item">
                      <span className="f04-source-number">{src.id}</span>

                      <div className="f04-source-details">
                        <strong className="f04-source-name">{src.name}</strong>

                        <button
                          className="f04-source-link"
                          type="button"
                          onClick={() =>
                            navigate(
                              `/sources?drug=${encodeURIComponent(drug)}&mode=${mode}`
                            )
                          }
                        >
                          Access data <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="f03-info-link"
                  type="button"
                  style={{ marginTop: "12px" }}
                  onClick={() =>
                    navigate(
                      `/sources?drug=${encodeURIComponent(drug)}&mode=${mode}`
                    )
                  }
                >
                  View all sources <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}

          {/* Tip */}
          {turns.length === 0 && (
            <div className="f03-info-card">
              <div className="f03-info-card-header">
                <div
                  className="guidance-icon-badge"
                  style={{
                    background: "rgba(217,127,108,0.12)",
                    color: "var(--clay-dark)",
                  }}
                >
                  <Lightbulb size={15} />
                </div>

                <h4 className="f03-info-card-title">Tip</h4>
              </div>

              <p className="f03-info-card-body">
                Be specific in your questions to get more relevant answers.
              </p>
            </div>
          )}
        </div>
      </section>
      {/* Minimal footer: copyright only */}
      <footer className="f03-footer">
        <span>© 2026 DrugDoc AI</span>
      </footer>
      <ConversationHistory
        open={showHistory}
        activeSessionId={sessionId}
        mode={mode}
        onClose={() => setShowHistory(false)}
        onNewChat={handleNewChat}
        onOpenSession={handleOpenSession}
        onDeletedActive={handleDeletedActive}
      />

    </AppLayout>
  );
};
