"use client";

import { useState } from "react";
import { X, ZoomIn, Calendar, Clock, CheckCircle2, UserCheck } from "lucide-react";

export default function ImageModal({
  isOpen,
  onClose,
  title,
  subtitle,
  tag,
  imageUrl,
  secondaryImageUrl,
  secondaryLabel,
  metadata = [],
}) {
  const [activeTab, setActiveTab] = useState("primary");

  if (!isOpen || !imageUrl) return null;

  const currentImg = activeTab === "secondary" && secondaryImageUrl ? secondaryImageUrl : imageUrl;
  const currentTag = activeTab === "secondary" && secondaryLabel ? secondaryLabel : tag;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        style={{ maxWidth: "480px", padding: "24px", position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span className="doodle-tag" style={{ background: "rgba(99, 102, 241, 0.12)", color: "var(--accent-indigo)" }}>
                {currentTag || "Biometric Photo"}
              </span>
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "2px 0 0 0", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm"
            style={{
              background: "rgba(0,0,0,0.04)",
              border: "1px solid var(--border-color)",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "9999px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {secondaryImageUrl && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", background: "rgba(241, 245, 249, 0.8)", padding: "4px", borderRadius: "var(--radius-sm)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("primary")}
              className={`btn btn-sm ${activeTab === "primary" ? "btn-primary" : "btn-secondary"}`}
              style={{ flex: 1, fontSize: "0.8rem", padding: "6px" }}
            >
              {tag || "Live Captured"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("secondary")}
              className={`btn btn-sm ${activeTab === "secondary" ? "btn-primary" : "btn-secondary"}`}
              style={{ flex: 1, fontSize: "0.8rem", padding: "6px" }}
            >
              {secondaryLabel || "Registered Photo"}
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "#080c14",
            padding: "16px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-color)",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.4)",
            marginBottom: "16px",
          }}
        >
          <img
            src={currentImg}
            alt={title}
            style={{
              maxWidth: "280px",
              maxHeight: "280px",
              width: "100%",
              height: "auto",
              aspectRatio: "1 / 1",
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
              border: "2px solid rgba(255,255,255,0.1)",
              imageRendering: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        {metadata.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: metadata.length > 2 ? "repeat(2, 1fr)" : "1fr",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.7)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              marginBottom: "16px",
              fontSize: "0.85rem",
            }}
          >
            {metadata.map((item, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
                  {item.label}
                </span>
                <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: "8px 20px", fontSize: "0.85rem" }}
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
