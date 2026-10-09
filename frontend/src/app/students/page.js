"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { Plus, Search, Trash2, Camera, Upload, AlertCircle, X, Check, RefreshCw } from "lucide-react";

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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setError("Unable to access camera. Please allow camera permissions or upload an image file.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.85);

    if (!primaryImage) {
      setPrimaryImage(b64);
    } else if (extraImages.length < 2) {
      setExtraImages([...extraImages, b64]);
    }
    stopCamera();
  };

  const handleFileUpload = (e, isPrimary = true) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result;
      if (isPrimary) {
        setPrimaryImage(b64);
      } else if (extraImages.length < 2) {
        setExtraImages([...extraImages, b64]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    if (!primaryImage) {
      setError("A primary face photo is required for enrollment.");
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
      setShowModal(false);
      setUsn("");
      setFullName("");
      setPrimaryImage("");
      setExtraImages([]);
      fetchStudents();
    } catch (err) {
      if (err.code === "FACE_ALREADY_ENROLLED") {
        setError(`Face is already registered under USN: ${err.data?.usn || "another student"}`);
      } else if (err.code === "USN_EXISTS") {
        setError(`USN ${usn.toUpperCase()} is already registered.`);
      } else if (err.code === "NO_FACE_DETECTED") {
        setError("No face detected in photo. Please ensure your face is well lit and centered.");
      } else if (err.code === "MULTIPLE_FACES_DETECTED") {
        setError("Multiple faces detected in photo. Only one face is permitted.");
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

        <button
          onClick={() => {
            setShowModal(true);
            setError("");
            setSuccess("");
          }}
          className="btn btn-primary"
        >
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
            {search ? "No matching students for your search query." : "Enroll your first student using facial biometrics."}
          </p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
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
          <div className="modal" style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Student Face Enrollment</h2>
              <button
                onClick={() => {
                  stopCamera();
                  setShowModal(false);
                }}
                className="btn btn-sm"
                style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
              >
                <X size={20} />
              </button>
            </div>

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
                <label className="form-label">Primary Biometric Face Photo</label>

                {cameraActive ? (
                  <div style={{ textAlign: "center", marginBottom: "16px" }}>
                    <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: "var(--radius-md)", background: "#000" }} />
                    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "12px" }}>
                      <button type="button" onClick={capturePhoto} className="btn btn-primary">
                        <Camera size={16} />
                        <span>Snap Photo</span>
                      </button>
                      <button type="button" onClick={stopCamera} className="btn btn-secondary">
                        Cancel Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {primaryImage ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
                        <img src={primaryImage} alt="Captured" style={{ width: "96px", height: "96px", borderRadius: "var(--radius-md)", objectFit: "cover", border: "2px solid var(--accent-indigo)" }} />
                        <div>
                          <div style={{ fontSize: "0.85rem", color: "var(--accent-emerald)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                            <Check size={14} /> Primary Face Captured
                          </div>
                          <button
                            type="button"
                            onClick={() => setPrimaryImage("")}
                            className="btn btn-secondary btn-sm"
                            style={{ marginTop: "8px" }}
                          >
                            Retake Photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "12px" }}>
                        <button type="button" onClick={startCamera} className="btn btn-secondary" style={{ flex: 1 }}>
                          <Camera size={16} />
                          <span>Use Camera</span>
                        </button>
                        <label className="btn btn-secondary" style={{ flex: 1, cursor: "pointer" }}>
                          <Upload size={16} />
                          <span>Upload File</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFileUpload(e, true)} style={{ display: "none" }} />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {primaryImage && (
                <div className="form-group">
                  <label className="form-label">Optional Angle / Lighting Photos ({extraImages.length}/2)</label>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    {extraImages.map((img, idx) => (
                      <div key={idx} style={{ position: "relative" }}>
                        <img src={img} alt="Extra" style={{ width: "64px", height: "64px", borderRadius: "var(--radius-sm)", objectFit: "cover" }} />
                        <button
                          type="button"
                          onClick={() => setExtraImages(extraImages.filter((_, i) => i !== idx))}
                          style={{ position: "absolute", top: "-6px", right: "-6px", background: "var(--accent-rose)", color: "white", borderRadius: "9999px", border: "none", width: "18px", height: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {extraImages.length < 2 && !cameraActive && (
                      <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                        <Plus size={14} /> Add Angle Photo
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFileUpload(e, false)} style={{ display: "none" }} />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setShowModal(false);
                  }}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !primaryImage}>
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
