"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../lib/api";
import { Camera, Download, Trash2, Plus, AlertCircle, CheckCircle2, StopCircle, ArrowLeft } from "lucide-react";

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [manualUsn, setManualUsn] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/v1/sessions/${sessionId}/dashboard`);
      setDashboard(res);
    } catch (err) {
      setError(err.message || "Failed to load session details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && sessionId) {
      fetchDashboard();
    }
  }, [user, sessionId]);

  const handleEndSession = async () => {
    if (!confirm("Are you sure you want to end this attendance session? The live scanner will be closed.")) {
      return;
    }

    try {
      await apiFetch(`/api/v1/sessions/${sessionId}/end`, { method: "POST" });
      setSuccess("Session ended successfully.");
      fetchDashboard();
    } catch (err) {
      setError(err.message || "Failed to end session.");
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/export.csv`, {
        headers: { "X-Requested-With": "AttendX" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to export attendance CSV.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dashboard?.subject_code || "session"}_${dashboard?.session_date || "date"}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || "Export failed.");
    }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!manualUsn) return;
    setSubmittingManual(true);
    setError("");

    try {
      await apiFetch(`/api/v1/sessions/${sessionId}/records`, {
        method: "POST",
        body: JSON.stringify({ usn: manualUsn.toUpperCase().trim() }),
      });
      setSuccess(`Attendance marked manually for ${manualUsn.toUpperCase()}.`);
      setManualUsn("");
      fetchDashboard();
    } catch (err) {
      if (err.code === "ALREADY_MARKED") {
        setError("Attendance is already marked for this student.");
      } else if (err.code === "STUDENT_NOT_FOUND") {
        setError(`Student with USN ${manualUsn.toUpperCase()} was not found.`);
      } else {
        setError(err.message || "Failed to mark attendance.");
      }
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleRemoveRecord = async (targetUsn) => {
    if (!confirm(`Remove attendance record for ${targetUsn}?`)) return;

    try {
      await apiFetch(`/api/v1/sessions/${sessionId}/records/${targetUsn}`, {
        method: "DELETE",
      });
      setSuccess(`Record for ${targetUsn} removed.`);
      fetchDashboard();
    } catch (err) {
      setError(err.message || "Failed to remove record.");
    }
  };

  if (authLoading || !user) {
    return null;
  }

  const attendancePercent = dashboard && dashboard.total_enrolled > 0
    ? Math.round((dashboard.total_present / dashboard.total_enrolled) * 100)
    : 0;

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link href="/dashboard" style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
          <ArrowLeft size={16} /> Back to Sessions
        </Link>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      {loading || !dashboard ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>
          Loading session dashboard...
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                    {dashboard.subject_name}
                  </h1>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--text-secondary)", background: "var(--bg-tertiary)", padding: "4px 8px", borderRadius: "var(--radius-sm)" }}>
                    {dashboard.subject_code}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  <span>Session Date: <strong>{dashboard.session_date}</strong></span>
                  <span>
                    Status:{" "}
                    {dashboard.is_active ? (
                      <span className="status-badge status-active">Active</span>
                    ) : (
                      <span className="status-badge status-ended">Ended</span>
                    )}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {dashboard.is_active && (
                  <>
                    <Link href={`/sessions/${sessionId}/scan`} className="btn btn-primary">
                      <Camera size={16} />
                      <span>Live Scanner</span>
                    </Link>
                    <button onClick={handleEndSession} className="btn btn-secondary">
                      <StopCircle size={16} />
                      <span>End Session</span>
                    </button>
                  </>
                )}
                <button onClick={handleExportCsv} className="btn btn-secondary">
                  <Download size={16} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.9rem" }}>
                <span>Turnout Progress: <strong>{dashboard.total_present} / {dashboard.total_enrolled} Present</strong></span>
                <span style={{ fontWeight: 700, color: "var(--accent-indigo)" }}>{attendancePercent}%</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "var(--bg-tertiary)", borderRadius: "9999px", overflow: "hidden" }}>
                <div style={{ width: `${attendancePercent}%`, height: "100%", background: "linear-gradient(90deg, var(--accent-indigo), var(--accent-cyan))", transition: "width 0.3s ease" }} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "32px" }}>
            <div className="card-header">
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Manual Attendance Override</h2>
            </div>
            <form onSubmit={handleManualAdd} style={{ display: "flex", gap: "12px", maxWidth: "480px" }}>
              <input
                type="text"
                placeholder="Enter Student USN (e.g. 1MS21CS099)"
                className="form-input"
                style={{ textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
                value={manualUsn}
                onChange={(e) => setManualUsn(e.target.value.toUpperCase())}
                disabled={!dashboard.is_active || submittingManual}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!dashboard.is_active || submittingManual || !manualUsn}
              >
                <Plus size={16} />
                <span>Mark Present</span>
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                Present Attendees ({dashboard.attendees.length})
              </h2>
            </div>

            {dashboard.attendees.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}>
                No attendance records yet for this session. Launch the camera scanner to record attendance.
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Biometric</th>
                      <th>USN</th>
                      <th>Full Name</th>
                      <th>Recorded At</th>
                      <th>Method</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.attendees.map((attendee) => (
                      <tr key={attendee.usn}>
                        <td>
                          <img src={attendee.thumbnail} alt={attendee.full_name} className="avatar-sm" />
                        </td>
                        <td>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-indigo)" }}>
                            {attendee.usn}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{attendee.full_name}</td>
                        <td>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            {new Date(attendee.marked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${attendee.method === "face" ? "status-active" : "status-ended"}`}>
                            {attendee.method === "face" ? "Biometric Face" : "Manual Override"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => handleRemoveRecord(attendee.usn)}
                            className="btn btn-danger btn-sm"
                            title="Remove record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
