"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { Plus, Camera, BarChart3, AlertCircle, X, CheckCircle2 } from "lucide-react";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/v1/sessions?limit=50");
      setSessions(res.items || []);
    } catch (err) {
      setError(err.message || "Failed to load sessions.");
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
    setError("");

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
      router.push(`/sessions/${res.session_id}/scan`);
    } catch (err) {
      setError(err.message || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (activeFilter === "active") return s.is_active;
    if (activeFilter === "ended") return !s.is_active;
    return true;
  });

  if (authLoading || !user) {
    return null;
  }

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

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <button
          onClick={() => setActiveFilter("all")}
          className={`btn btn-sm ${activeFilter === "all" ? "btn-secondary" : ""}`}
          style={{ background: activeFilter === "all" ? "var(--border-strong)" : "transparent" }}
        >
          All ({sessions.length})
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
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Code</th>
                <th>Date</th>
                <th>Status</th>
                <th>Present</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => (
                <tr key={session.id}>
                  <td style={{ fontWeight: 600 }}>{session.subject_name}</td>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {session.subject_code}
                    </span>
                  </td>
                  <td>{session.session_date}</td>
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
                    <span style={{ fontWeight: 700, fontSize: "1rem" }}>{session.total_present}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "8px" }}>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Create New Session</h2>
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-sm"
                style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label className="form-label">Subject Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Distributed Systems"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject Code</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  placeholder="CS601"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Creating..." : "Start Session & Open Scanner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
