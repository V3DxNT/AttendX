"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../lib/api";
import { ArrowLeft, CheckCircle2, AlertTriangle, UserCheck, VideoOff, Users, Scan } from "lucide-react";

export default function LiveScannerPage() {
  const params = useParams();
  const sessionId = params.id;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef(null);

  const [session, setSession] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [scanStatus, setScanStatus] = useState({
    state: "idle",
    message: "Point camera at one student at a time",
    student: null,
    distance: null,
  });
  const [recentScans, setRecentScans] = useState([]);
  const [totalMarked, setTotalMarked] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadSession() {
      try {
        const data = await apiFetch(`/api/v1/sessions/${sessionId}/dashboard`);
        if (!data.is_active) {
          router.replace(`/sessions/${sessionId}`);
          return;
        }
        setSession(data);
        setTotalMarked(data.total_present || 0);
      } catch (err) {
        setCameraError(err.message || "Failed to load session details.");
      }
    }
    if (sessionId && user) {
      loadSession();
    }
  }, [sessionId, user, router]);

  const attachVideo = (node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraError("");
    } catch (err) {
      setCameraError("Camera access denied or device not found. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    const v = videoRef.current;
    const originalWidth = v.videoWidth || 640;
    const originalHeight = v.videoHeight || 480;

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    if (originalWidth > 640) {
      const scale = 640 / originalWidth;
      targetWidth = 640;
      targetHeight = Math.round(originalHeight * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const sendScan = async () => {
    if (inFlightRef.current || !streamRef.current) return;
    const frameBase64 = captureFrame();
    if (!frameBase64) return;

    inFlightRef.current = true;

    try {
      const res = await apiFetch(`/api/v1/sessions/${sessionId}/mark`, {
        method: "POST",
        body: JSON.stringify({ image_base64: frameBase64 }),
      });

      setScanStatus({
        state: "success",
        message: `Marked Present: ${res.student.full_name}`,
        student: res.student,
        distance: res.distance,
      });

      setTotalMarked((prev) => prev + 1);
      setRecentScans((prev) => [
        {
          ...res.student,
          distance: res.distance,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
    } catch (err) {
      if (err.code === "ALREADY_MARKED") {
        setScanStatus({
          state: "warning",
          message: `Already Marked: ${err.data?.student?.full_name || "Student"}`,
          student: err.data?.student,
          distance: null,
        });
      } else if (err.code === "UNKNOWN_FACE") {
        setScanStatus({
          state: "error",
          message: "Unrecognized face. Not found in enrolled database.",
          student: null,
          distance: null,
        });
      } else if (err.code === "NO_FACE_DETECTED") {
        setScanStatus({
          state: "idle",
          message: "Position face inside the reticle",
          student: null,
          distance: null,
        });
      } else if (err.code === "MULTIPLE_FACES_DETECTED") {
        setScanStatus({
          state: "error",
          message: "Multiple faces detected. Scan one student at a time.",
          student: null,
          distance: null,
        });
      } else if (err.code === "FACE_TOO_SMALL") {
        setScanStatus({
          state: "warning",
          message: "Move closer to camera",
          student: null,
          distance: null,
        });
      } else if (err.code === "LOW_QUALITY_FACE") {
        setScanStatus({
          state: "warning",
          message: "Ensure adequate lighting and face camera directly",
          student: null,
          distance: null,
        });
      } else if (err.code === "SESSION_ENDED") {
        setScanStatus({
          state: "error",
          message: "Session has been ended by faculty.",
          student: null,
          distance: null,
        });
        stopCamera();
      } else {
        setScanStatus({
          state: "error",
          message: err.message || "Scan failed.",
          student: null,
          distance: null,
        });
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (session) {
      startCamera();
      timerRef.current = setInterval(sendScan, 1500);
    }
    return () => {
      stopCamera();
    };
  }, [session]);

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="container" style={{ padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <Link href={`/sessions/${sessionId}`} style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
          <ArrowLeft size={16} /> Exit Scanner
        </Link>
        {session && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              {session.subject_name} ({session.subject_code})
            </span>
            <div className="status-badge status-active">
              <Scan size={14} /> Live Scanner
            </div>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-emerald)" }}>
              {totalMarked} Marked Present
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", alignItems: "start" }}>
        <div>
          <div className="scanner-viewport">
            {cameraError ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-secondary)", padding: "20px", textAlign: "center" }}>
                <VideoOff size={48} style={{ color: "var(--accent-rose)", marginBottom: "12px" }} />
                <p style={{ maxWidth: "320px", fontSize: "0.9rem" }}>{cameraError}</p>
                <button onClick={startCamera} className="btn btn-primary btn-sm" style={{ marginTop: "16px" }}>
                  Retry Camera
                </button>
              </div>
            ) : (
              <>
                <video ref={attachVideo} autoPlay playsInline muted className="scanner-video" />
                <div className={`scanner-reticle ${scanStatus.state === "success" ? "success" : scanStatus.state === "error" ? "error" : ""}`} />
                <div className="scanner-overlay">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                      FPS: ~0.7 (1.5s interval)
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem" }}>
                      Threshold: 0.40
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            className="card"
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              borderColor:
                scanStatus.state === "success"
                  ? "var(--accent-emerald)"
                  : scanStatus.state === "error"
                  ? "var(--accent-rose)"
                  : scanStatus.state === "warning"
                  ? "var(--accent-amber)"
                  : "var(--border-subtle)",
              background:
                scanStatus.state === "success"
                  ? "rgba(16, 185, 129, 0.08)"
                  : scanStatus.state === "error"
                  ? "rgba(244, 63, 94, 0.08)"
                  : "var(--bg-card)",
            }}
          >
            {scanStatus.student?.thumbnail ? (
              <img
                src={scanStatus.student.thumbnail}
                alt={scanStatus.student.full_name}
                className="avatar-sm"
                style={{ width: "54px", height: "54px" }}
              />
            ) : (
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "9999px",
                  background: "var(--bg-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {scanStatus.state === "success" ? (
                  <CheckCircle2 size={24} style={{ color: "var(--accent-emerald)" }} />
                ) : scanStatus.state === "warning" ? (
                  <AlertTriangle size={24} style={{ color: "var(--accent-amber)" }} />
                ) : (
                  <UserCheck size={24} style={{ color: "var(--text-muted)" }} />
                )}
              </div>
            )}

            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "2px" }}>
                {scanStatus.message}
              </div>
              {scanStatus.student && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", gap: "12px" }}>
                  <span>USN: <strong style={{ color: "var(--text-primary)" }}>{scanStatus.student.usn}</strong></span>
                  {scanStatus.distance !== null && (
                    <span>Distance: <strong style={{ color: "var(--accent-emerald)" }}>{scanStatus.distance}</strong></span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ height: "100%", maxHeight: "560px", overflowY: "auto" }}>
          <div className="card-header" style={{ marginBottom: "16px" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={16} /> Recent Scans ({recentScans.length})
            </h3>
          </div>

          {recentScans.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Identified student faces will appear here live.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {recentScans.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <img src={s.thumbnail} alt={s.full_name} className="avatar-sm" style={{ width: "36px", height: "36px" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.full_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {s.usn}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--accent-emerald)", fontWeight: 600 }}>
                    {s.timestamp}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
