"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { apiFetch } from "../../../lib/api";
import ConfirmModal from "../../../components/ConfirmModal";
import { Camera, Download, Trash2, Plus, AlertCircle, CheckCircle2, StopCircle, ArrowLeft, Clock, Calendar, ArrowUpDown, Search } from "lucide-react";

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id;
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualUsn, setManualUsn] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("time_desc");

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: "",
    title: "",
    message: "",
    confirmText: "Confirm",
    danger: true,
    targetData: null,
  });
  const [actionLoading, setActionLoading] = useState(false);

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
      toast.error(err.message || "Failed to load session details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && sessionId) {
      fetchDashboard();
    }
  }, [user, sessionId]);

  const requestEndSession = () => {
    setConfirmModal({
      isOpen: true,
      type: "end",
      title: "End Attendance Session",
      message: "Are you sure you want to end this attendance session? The live camera scanner will be closed.",
      confirmText: "End Session",
      danger: false,
      targetData: null,
    });
  };

  const requestDeleteSession = () => {
    setConfirmModal({
      isOpen: true,
      type: "delete",
      title: "Delete Attendance Session",
      message: `Are you sure you want to delete session "${dashboard?.subject_name}"? All its attendance records will be permanently removed.`,
      confirmText: "Delete Session",
      danger: true,
      targetData: null,
    });
  };

  const requestRemoveRecord = (usn) => {
    setConfirmModal({
      isOpen: true,
      type: "remove_record",
      title: "Remove Attendance Record",
      message: `Remove verified attendance record for student ${usn}?`,
      confirmText: "Remove Record",
      danger: true,
      targetData: usn,
    });
  };

  const handleModalConfirm = async () => {
    setActionLoading(true);
    try {
      if (confirmModal.type === "end") {
        await apiFetch(`/api/v1/sessions/${sessionId}/end`, { method: "POST" });
        toast.success("Session ended successfully.");
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        fetchDashboard();
      } else if (confirmModal.type === "delete") {
        await apiFetch(`/api/v1/sessions/${sessionId}`, { method: "DELETE" });
        toast.success("Session deleted successfully.");
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        router.push("/dashboard");
      } else if (confirmModal.type === "remove_record") {
        const usn = confirmModal.targetData;
        await apiFetch(`/api/v1/sessions/${sessionId}/records/${usn}`, {
          method: "DELETE",
        });
        toast.success(`Record for ${usn} removed.`);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        fetchDashboard();
      }
    } catch (err) {
      toast.error(err.message || "Action failed.");
    } finally {
      setActionLoading(false);
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
      toast.success("Attendance CSV exported successfully.");
    } catch (err) {
      toast.error(err.message || "Export failed.");
    }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!manualUsn) return;
    setSubmittingManual(true);

    try {
      await apiFetch(`/api/v1/sessions/${sessionId}/records`, {
        method: "POST",
        body: JSON.stringify({ usn: manualUsn.toUpperCase().trim() }),
      });
      toast.success(`Attendance marked manually for ${manualUsn.toUpperCase()}.`);
      setManualUsn("");
      fetchDashboard();
    } catch (err) {
      if (err.code === "ALREADY_MARKED") {
        toast.error("Attendance is already marked for this student.");
      } else if (err.code === "STUDENT_NOT_FOUND") {
        toast.error(`Student with USN ${manualUsn.toUpperCase()} was not found.`);
      } else {
        toast.error(err.message || "Failed to mark attendance.");
      }
    } finally {
      setSubmittingManual(false);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return null;
    }
  };

  const processedAttendees = useMemo(() => {
    if (!dashboard || !dashboard.attendees) return [];
    let list = [...dashboard.attendees];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => a.usn.toLowerCase().includes(q) || a.full_name.toLowerCase().includes(q));
    }

    if (sortBy === "usn_asc") {
      list.sort((a, b) => a.usn.localeCompare(b.usn));
    } else if (sortBy === "usn_desc") {
      list.sort((a, b) => b.usn.localeCompare(a.usn));
    } else if (sortBy === "name_asc") {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    } else if (sortBy === "time_asc") {
      list.sort((a, b) => new Date(a.marked_at).getTime() - new Date(b.marked_at).getTime());
    } else {
      list.sort((a, b) => new Date(b.marked_at).getTime() - new Date(a.marked_at).getTime());
    }

    return list;
  }, [dashboard, searchQuery, sortBy]);

  if (authLoading || !user) {
    return null;
  }

  const attendancePercent = dashboard && dashboard.total_enrolled > 0
    ? Math.round((dashboard.total_present / dashboard.total_enrolled) * 100)
    : 0;

  const isAdmin = user.role === "admin";

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link href="/dashboard" style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
          <ArrowLeft size={16} /> Back to Sessions
        </Link>
      </div>

      {loading || !dashboard ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>
          Loading session dashboard...
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                    {dashboard.subject_name}
                  </h1>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--text-secondary)", background: "var(--bg-tertiary)", padding: "4px 8px", borderRadius: "var(--radius-sm)" }}>
                    {dashboard.subject_code}
                  </span>
                  {dashboard.is_active ? (
                    <span className="status-badge status-active">
                      <CheckCircle2 size={12} />
                      Live Active
                    </span>
                  ) : (
                    <span className="status-badge status-ended">Completed</span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "20px", color: "var(--text-secondary)", fontSize: "0.9rem", flexWrap: "wrap", marginTop: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={15} style={{ color: "var(--accent-indigo)" }} />
                    <span>Date: <strong>{dashboard.session_date}</strong></span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={15} style={{ color: "var(--accent-cyan)" }} />
                    <span>Start: <strong>{formatTime(dashboard.started_at) || "Not set"}</strong></span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={15} style={{ color: dashboard.ended_at ? "var(--text-muted)" : "var(--accent-emerald)" }} />
                    <span>End: <strong>{dashboard.ended_at ? formatTime(dashboard.ended_at) : "In Progress"}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {dashboard.is_active && (
                  <>
                    <Link href={`/sessions/${sessionId}/scan`} className="btn btn-primary">
                      <Camera size={16} />
                      <span>Live Scanner</span>
                    </Link>
                    <button onClick={requestEndSession} className="btn btn-secondary">
                      <StopCircle size={16} />
                      <span>End Session</span>
                    </button>
                  </>
                )}
                <button onClick={handleExportCsv} className="btn btn-secondary">
                  <Download size={16} />
                  <span>Export CSV</span>
                </button>
                {isAdmin && (
                  <button onClick={requestDeleteSession} className="btn btn-danger" title="Delete this session">
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                )}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                  Session Attendees ({dashboard.attendees.length})
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "2px" }}>
                  Students verified present in this specific lecture
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ position: "relative", minWidth: "220px" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: "32px", paddingRight: "10px", fontSize: "0.85rem", height: "36px" }}
                    placeholder="Search USN or Name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <ArrowUpDown size={14} style={{ color: "var(--text-muted)" }} />
                  <select
                    className="form-input"
                    style={{ fontSize: "0.85rem", height: "36px", padding: "0 8px" }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="time_desc">Time (Latest First)</option>
                    <option value="time_asc">Time (Earliest First)</option>
                    <option value="usn_asc">USN (Ascending A-Z)</option>
                    <option value="usn_desc">USN (Descending Z-A)</option>
                    <option value="name_asc">Name (A-Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {dashboard.attendees.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}>
                No attendance records yet for this session. Launch the live scanner to capture student faces.
              </div>
            ) : processedAttendees.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-secondary)" }}>
                No attendees matching "{searchQuery}".
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Biometric</th>
                      <th
                        onClick={() => setSortBy(sortBy === "usn_asc" ? "usn_desc" : "usn_asc")}
                        style={{ cursor: "pointer" }}
                        title="Click to sort by USN"
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span>USN</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>
                      <th
                        onClick={() => setSortBy(sortBy === "name_asc" ? "time_desc" : "name_asc")}
                        style={{ cursor: "pointer" }}
                        title="Click to sort by Name"
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span>Full Name</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>
                      <th
                        onClick={() => setSortBy(sortBy === "time_desc" ? "time_asc" : "time_desc")}
                        style={{ cursor: "pointer" }}
                        title="Click to sort by Time"
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span>Capture Time</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>
                      <th>Method</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedAttendees.map((attendee) => (
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
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            <Clock size={13} style={{ color: "var(--accent-cyan)" }} />
                            <span>{formatTime(attendee.marked_at)}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${attendee.method === "face" ? "status-active" : "status-ended"}`}>
                            {attendee.method === "face" ? "Biometric Face" : "Manual Override"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => requestRemoveRecord(attendee.usn)}
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText="Cancel"
        danger={confirmModal.danger}
        loading={actionLoading}
        onConfirm={handleModalConfirm}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
