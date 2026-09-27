import React, { useCallback, useEffect, useState } from "react";
import { Clock3, MessageSquare, Plus, Trash2, X } from "lucide-react";
import {
  ChatSessionSummary,
  deleteChatSession,
  listChatSessions,
} from "../data/ragService";

interface ConversationHistoryProps {
  open: boolean;
  activeSessionId: string | null;
  mode: "patient" | "professional";
  onClose: () => void;
  onNewChat: () => void;
  onOpenSession: (session: ChatSessionSummary) => void;
  onDeletedActive: () => void;
}

function formatUpdatedAt(timestamp: number): string {
  if (!timestamp) return "No activity";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  open,
  activeSessionId,
  mode,
  onClose,
  onNewChat,
  onOpenSession,
  onDeletedActive,
}) => {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listChatSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load conversations.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadSessions();
    }
  }, [open, loadSessions]);

  const handleDelete = async (session: ChatSessionSummary) => {
    if (!window.confirm(`Delete the conversation “${session.title || session.drug_name || "Untitled"}”? This cannot be undone.`)) {
      return;
    }

    setDeletingId(session.session_id);
    setError(null);

    try {
      await deleteChatSession(session.session_id);
      setSessions((prev) => prev.filter((item) => item.session_id !== session.session_id));

      if (session.session_id === activeSessionId) {
        onDeletedActive();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversation.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <button className="conversation-history-backdrop" aria-label="Close conversation history" onClick={onClose} />
      <aside className="conversation-history-drawer" aria-label="Previous conversations">
        <div className="conversation-history-header">
          <div>
            <span className="conversation-history-eyebrow">CHAT HISTORY</span>
            <h2>Previous Conversations</h2>
            <p>
              {mode === "professional"
                ? "Your saved professional conversations."
                : "Your saved patient conversations."}
            </p>
          </div>
          <button className="conversation-history-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <button className="conversation-history-new" onClick={onNewChat}>
          <Plus size={16} />
          New Chat
        </button>

        <div className="conversation-history-list">
          {isLoading && <div className="conversation-history-empty">Loading conversations…</div>}

          {!isLoading && error && (
            <div className="conversation-history-error" role="alert">
              {error}
            </div>
          )}

          {!isLoading && !error && sessions.length === 0 && (
            <div className="conversation-history-empty">
              <MessageSquare size={22} />
              <strong>No previous conversations</strong>
              <span>Your new chats will appear here.</span>
            </div>
          )}

          {!isLoading && !error && sessions.map((session) => {
            const isActive = session.session_id === activeSessionId;
            return (
              <div
                key={session.session_id}
                className={`conversation-history-item${isActive ? " conversation-history-item--active" : ""}`}
              >
                <button
                  className="conversation-history-open"
                  onClick={() => onOpenSession(session)}
                  title={session.title || session.drug_name || "Conversation"}
                >
                  <div className="conversation-history-item-top">
                    <strong>{session.title || session.drug_name || "Untitled conversation"}</strong>
                    {isActive && <span className="conversation-history-active">Active</span>}
                  </div>

                  <div className="conversation-history-meta">
                    <span>{session.drug_name || "Medication not set"}</span>
                    <span><Clock3 size={12} /> {formatUpdatedAt(session.updated_at)}</span>
                    <span><MessageSquare size={12} /> {session.message_count} messages</span>
                  </div>
                </button>

                <button
                  className="conversation-history-delete"
                  onClick={() => handleDelete(session)}
                  disabled={deletingId === session.session_id}
                  aria-label={`Delete ${session.title || session.drug_name || "conversation"}`}
                  title="Delete conversation"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};
