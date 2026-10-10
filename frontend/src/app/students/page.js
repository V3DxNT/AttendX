"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { Plus, Search, Trash2, Camera, AlertCircle, X, Check, RotateCcw } from "lucide-react";

export default function StudentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [usn, setUsn] = useState("");
  const [fullName, setFullName] = useState("");
  const [primaryImage, setPrimaryImage] = useState("");
  const [extraImages, setExtraImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiFetch(`/api/v1/students${query}`);
      setStudents(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        fetchStudents();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [user, search]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const attachVideo = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const startCamera = async () => {
    setCameraError("");
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCameraError("Unable to access camera. Please allow camera permissions in your browser.");
      setCameraActive(false);
    }
  };

  const capturePhoto = (isPrimary = true) => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) {
      setCameraError("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.92);

    if (isPrimary) {
      setPrimaryImage(b64);
      stopCamera();
    } else {
      if (extraImages.length < 2) {
        setExtraImages((prev) => [...prev, b64]);
      }
    }
    setCameraError("");
  };

  const openEnrollModal = () => {
    setShowModal(true);
    setError("");
    setSuccess("");
    setCameraError("");
    setUsn("");
    setFullName("");
    setPrimaryImage("");
    setExtraImages([]);
    startCamera();
  };

  const closeEnrollModal = () => {
    stopCamera();
    setShowModal(false);
    setCameraError("");
  };

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    if (!primaryImage) {
      setError("Please capture a primary face photo from the camera before submitting.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiFetch("/api/v1/students/register", {
        method: "POST",
        body: JSON.stringify({
          usn: usn.toUpperCase().trim(),
          full_name: fullName.trim(),
          image_base64: primaryImage,
          extra_images_base64: extraImages.length > 0 ? extraImages : null,
        }),
      });

      setSuccess(`Student ${usn.toUpperCase()} enrolled successfully!`);
      closeEnrollModal();
      fetchStudents();
    } catch (err) {
      if (err.code === "FACE_ALREADY_ENROLLED") {
        setError(`Face is already registered under USN: ${err.data?.usn || "another student"}`);
      } else if (err.code === "USN_EXISTS") {
        setError(`USN ${usn.toUpperCase()} is already registered.`);
      } else if (err.code === "NO_FACE_DETECTED") {
        setError("No face detected in photo. Please ensure face is clearly visible, well lit, and centered in camera.");
      } else if (err.code === "MULTIPLE_FACES_DETECTED") {
        setError("Multiple faces detected in photo. Only one person should be in view.");
      } else if (err.code === "FACE_TOO_SMALL") {
        setError("Face is too far from camera. Please move closer and retake photo.");
      } else if (err.code === "LOW_QUALITY_FACE") {
        setError("Face photo quality or lighting is too low. Please ensure direct lighting and retake.");
      } else {
        setError(err.message || "Failed to register student.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async (targetUsn) => {
    if (!confirm(`Are you sure you want to delete ${targetUsn}? This will remove all biometrics and attendance records.`)) {
      return;
    }

    try {
      await apiFetch(`/api/v1/students/${targetUsn}`, { method: "DELETE" });
      setSuccess(`Student ${targetUsn} deleted successfully.`);
      fetchStudents();
    } catch (err) {
      setError(err.message || "Failed to delete student.");
    }
  };

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "6px" }}>
            Student Enrollment Directory
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Total enrolled students: {total}
          </p>
        </div>

        <button onClick={openEnrollModal} className="btn btn-primary">
          <Plus size={18} />
          <span>Enroll Student</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <Check size={18} />
          <span>{success}</span>
        </div>
      )}

      <div style={{ marginBottom: "24px", position: "relative", maxWidth: "420px" }}>
        <Search size={18} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          type="text"
          className="form-input"
          style={{ paddingLeft: "42px" }}
          placeholder="Search by USN or student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>
          Loading students...
        </div>
      ) : students.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "64px 20px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>No students found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "20px" }}>
            {search ? "No matching students for your search query." : "Enroll your first student using live camera capture."}
          </p>
          <button onClick={openEnrollModal} className="btn btn-primary">
            <Plus size={16} />
            <span>Enroll Student</span>
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Biometric</th>
                <th>USN</th>
                <th>Full Name</th>
                {user.role === "admin" && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.usn}>
                  <td>
                    <img src={s.thumbnail} alt={s.full_name} className="avatar-sm" />
                  </td>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-indigo)" }}>
                      {s.usn}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                  {user.role === "admin" && (
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => handleDeleteStudent(s.usn)}
                        className="btn btn-danger btn-sm"
                        title="Delete student record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: "580px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Student Face Enrollment</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "2px" }}>
                  Live camera capture required for biometric registration
                </p>
              </div>
              <button
                type="button"
                onClick={closeEnrollModal}
                className="btn btn-sm"
                style={{ background: "transparent", color: "var(--text-secondary)", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {cameraError && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                <AlertCircle size={16} />
                <span>{cameraError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterStudent}>
              <div className="form-group">
                <label className="form-label">University Seat Number (USN)</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  style={{ textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
                  value={usn}
                  onChange={(e) => setUsn(e.target.value.toUpperCase())}
                  placeholder="1MS21CS099"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Vedant Sharma"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Primary Biometric Face Photo {primaryImage && <span style={{ color: "var(--accent-emerald)", fontWeight: 700 }}>(Captured)</span>}
                </label>

                {cameraActive ? (
                  <div style={{ background: "#0b0f19", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", textAlign: "center" }}>
                    <div style={{ position: "relative", width: "100%", maxHeight: "320px", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "#000" }}>
                      <video
                        ref={attachVideo}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: "15%",
                          border: "2px dashed rgba(255,255,255,0.45)",
                          borderRadius: "16px",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "14px" }}>
                      <button
                        type="button"
                        onClick={() => capturePhoto(true)}
                        className="btn btn-primary"
                      >
                        <Camera size={16} />
                        <span>Snap Primary Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="btn btn-secondary"
                      >
                        Close Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {primaryImage ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "20px",
                          padding: "16px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        <img
                          src={primaryImage}
                          alt="Captured Primary"
                          style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "var(--radius-md)",
                            objectFit: "cover",
                            border: "3px solid var(--accent-emerald)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        />
                        <div>
                          <div style={{ fontSize: "0.95rem", color: "var(--accent-emerald)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <Check size={16} /> Photo Captured
                          </div>
                          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", marginBottom: "12px" }}>
                            Live camera frame ready for facial feature extraction.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setPrimaryImage("");
                              startCamera();
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            <RotateCcw size={14} />
                            <span>Retake Photo</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="btn btn-primary"
                        style={{ width: "100%", justifyContent: "center", padding: "14px" }}
                      >
                        <Camera size={18} />
                        <span>Start Camera to Snap Face</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {primaryImage && (
                <div className="form-group" style={{ marginTop: "16px" }}>
                  <label className="form-label">
                    Optional Angle Photos ({extraImages.length}/2)
                  </label>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    {extraImages.map((img, idx) => (
                      <div key={idx} style={{ position: "relative" }}>
                        <img
                          src={img}
                          alt="Angle"
                          style={{ width: "72px", height: "72px", borderRadius: "var(--radius-sm)", objectFit: "cover", border: "1px solid var(--border-color)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setExtraImages(extraImages.filter((_, i) => i !== idx))}
                          style={{
                            position: "absolute",
                            top: "-6px",
                            right: "-6px",
                            background: "var(--accent-rose)",
                            color: "white",
                            borderRadius: "9999px",
                            border: "none",
                            width: "20px",
                            height: "20px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {extraImages.length < 2 && !cameraActive && (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="btn btn-secondary btn-sm"
                      >
                        <Camera size={14} />
                        <span>Snap Angle Photo</span>
                      </button>
                    )}
                    {extraImages.length < 2 && cameraActive && (
                      <button
                        type="button"
                        onClick={() => capturePhoto(false)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Camera size={14} />
                        <span>Capture Extra Angle</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "28px" }}>
                <button
                  type="button"
                  onClick={closeEnrollModal}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !primaryImage}
                >
                  {submitting ? "Extracting Embeddings..." : "Register Biometrics"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
