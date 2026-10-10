import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { SparkleDoodle, CapDoodle } from "./DoodleIcons";

export default function Footer() {
  return (
    <footer className="liquid-footer">
      <div className="liquid-footer-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src="/graduated.png"
            alt="AttendX"
            style={{ width: "22px", height: "22px", objectFit: "contain" }}
          />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
            AttendX
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Biometric Facial Attendance System
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <a
            href="https://www.vedx.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="creator-footer-link"
          >
            <span>Created by Ved</span>
            <span style={{ opacity: 0.65, fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
              vedx.dev
            </span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </footer>
  );
}
