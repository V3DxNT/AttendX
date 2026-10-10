"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { apiFetch } from "../../lib/api";
import ConfirmModal from "../../components/ConfirmModal";
import { Plus, Camera, BarChart3, AlertCircle, X, CheckCircle2, Calendar, Clock, Trash2 } from "lucide-react";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/v1/sessions?limit=100");
      setSessions(res.items || []);
    } catch (err) {
      toast.error(err.message || "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setCreating(true);
    setModalError("");

    try {
      const res = await apiFetch("/api/v1/sessions/create", {
        method: "POST",
        body: JSON.stringify({
          subject_name: subjectName,
          subject_code: subjectCode,
        }),
      });
      setShowModal(false);
      setSubjectName("");
      setSubjectCode("");
      toast.success("Session created! Launching scanner...");
      router.push(`/sessions/${res.session_id}/scan`);
    } catch (err) {
      setModalError(err.message || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      await apiFetch(`/api/v1/sessions/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`Session "${deleteTarget.subject}" deleted successfully.`);
      setDeleteTarget(null);
      fetchSessions();
    } catch (err) {
      toast.error(err.message || "Failed to delete session.");
    } finally {
      setDeleting(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return sessions.filter((s) => {
      const sDate = s.session_date || (s.started_at ? s.started_at.slice(0, 10) : "");
      if (activeFilter === "today") return sDate === todayStr;
      if (activeFilter === "week") {
        const sTime = s.started_at ? new Date(s.started_at) : new Date(sDate);
        return sTime >= oneWeekAgo;
      }
      if (activeFilter === "older") {
        const sTime = s.started_at ? new Date(s.started_at) : new Date(sDate);
        return sTime < oneWeekAgo;
      }
      if (activeFilter === "active") return s.is_active;
      if (activeFilter === "ended") return !s.is_active;
      return true;
    });
  }, [sessions, activeFilter]);

  const groupedSessions = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const groups = {};
    filteredSessions.forEach((s) => {
      const d = s.session_date || (s.started_at ? s.started_at.slice(0, 10) : "Other");
      let label = d;
      if (d === todayStr) label = "Today (" + d + ")";
      else if (d === yesterday) label = "Yesterday (" + d + ")";
      else label = "Date: " + d;

      if (!groups[label]) groups[label] = [];
      groups[label].push(s);
    });

    return Object.entries(groups).map(([label, items]) => ({ label, items }));
  }, [filteredSessions]);

  const formatTime = (ts) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return null;
    }
  };

  if (authLoading || !user) {
    return null;
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "6px" }}>
            Attendance Sessions
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Manage lecture sessions, launch facial recognition scanners, and review attendance records.
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus size={18} />
          <span>New Session</span>
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "28px", flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveFilter("all")}
          className={`btn btn-sm ${activeFilter === "all" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "all" ? "var(--border-strong)" : "transparent" }}
        >
          All ({sessions.length})
        </button>
        <button
          onClick={() => setActiveFilter("today")}
          className={`btn btn-sm ${activeFilter === "today" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "today" ? "var(--border-strong)" : "transparent" }}
        >
          Today
        </button>
        <button
          onClick={() => setActiveFilter("week")}
          className={`btn btn-sm ${activeFilter === "week" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "week" ? "var(--border-strong)" : "transparent" }}
        >
          Past 7 Days
        </button>
        <button
          onClick={() => setActiveFilter("active")}
          className={`btn btn-sm ${activeFilter === "active" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "active" ? "var(--border-strong)" : "transparent" }}
        >
          Active ({sessions.filter((s) => s.is_active).length})
        </button>
        <button
          onClick={() => setActiveFilter("ended")}
          className={`btn btn-sm ${activeFilter === "ended" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "ended" ? "var(--border-strong)" : "transparent" }}
        >
          Completed ({sessions.filter((s) => !s.is_active).length})
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>
          Loading sessions...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "64px 20px" }}>
          <div className="brand-icon" style={{ margin: "0 auto 16px auto", width: "48px", height: "48px", opacity: 0.8 }}>
            <Calendar size={24} />
          </div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>No sessions found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto 20px auto" }}>
            Create your first attendance session to begin scanning student faces.
          </p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus size={16} />
            <span>Create Session</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {groupedSessions.map(({ label, items }) => (
            <div key={label}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: 700 }}>
                <Calendar size={16} style={{ color: "var(--accent-indigo)" }} />
                <span>{label}</span>
                <span style={{ fontSize: "0.8rem", background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: "9999px" }}>
                  {items.length} {items.length === 1 ? "session" : "sessions"}
                </span>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Code</th>
                      <th>Timeline & Schedule</th>
                      <th>Status</th>
                      <th>Turnout</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((session) => (
                      <tr key={session.id}>
                        <td style={{ fontWeight: 600 }}>
                          <Link href={`/sessions/${session.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                            {session.subject_name}
                          </Link>
                        </td>
                        <td>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            {session.subject_code}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
                              <Clock size={13} />
                              <span>Start: {formatTime(session.started_at) || "Not set"}</span>
                              {session.ended_at && <span>• End: {formatTime(session.ended_at)}</span>}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Date: {session.session_date}
                            </span>
                          </div>
                        </td>
                        <td>
                          {session.is_active ? (
                            <span className="status-badge status-active">
                              <CheckCircle2 size={12} />
                              Active
                            </span>
                          ) : (
                            <span className="status-badge status-ended">Ended</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--accent-indigo)" }}>
                            {session.total_present} Present
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                            {session.is_active && (
                              <Link href={`/sessions/${session.id}/scan`} className="btn btn-primary btn-sm">
                                <Camera size={14} />
                                <span>Scan</span>
                              </Link>
                            )}
                            <Link href={`/sessions/${session.id}`} className="btn btn-secondary btn-sm">
                              <BarChart3 size={14} />
                              <span>Dashboard</span>
                            </Link>
                            {isAdmin && (
                              <button
                                onClick={() => setDeleteTarget({ id: session.id, subject: session.subject_name })}
                                className="btn btn-danger btn-sm"
                                title="Delete session"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Create Attendance Session</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm"
                style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
              >
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label className="form-label">Subject Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Computer Networks"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject Code</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  style={{ textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                  placeholder="CS501"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "28px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Creating..." : "Start & Open Scanner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Attendance Session"
        message={`Are you sure you want to delete "${deleteTarget?.subject}"? All recorded attendance data for this session will be permanently deleted.`}
        confirmText="Delete Session"
        cancelText="Cancel"
        loading={deleting}
        onConfirm={confirmDeleteSession}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
