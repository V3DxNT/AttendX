"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Scan, Users, BarChart3, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";
import { CapDoodle, StarDoodle, SparkleDoodle, NotebookDoodle } from "../components/DoodleIcons";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  return (
    <div style={{ padding: "48px 24px", maxWidth: "1080px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <span className="doodle-badge" style={{ padding: "8px 18px", fontSize: "0.9rem" }}>
            <CapDoodle size={18} /> Student & Faculty Biometric Portal
          </span>
          <span className="doodle-tag" style={{ fontSize: "1.35rem" }}>✦ attendx live</span>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.9)",
              border: "1.5px solid rgba(255, 255, 255, 0.95)",
              boxShadow: "0 12px 30px rgba(79, 70, 229, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/graduated.png"
              alt="AttendX"
              style={{ width: "48px", height: "48px", objectFit: "contain" }}
            />
          </div>
        </div>

        <h1
          style={{
            fontSize: "2.6rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            lineHeight: 1.2,
            maxWidth: "760px",
            margin: "0 auto 18px auto",
          }}
        >
          Computer Vision Attendance System for Smart Campuses
        </h1>

        <p
          style={{
            fontSize: "1.1rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            maxWidth: "640px",
            margin: "0 auto 32px auto",
          }}
        >
          AttendX turns any webcam into an instantaneous biometric attendance scanner using real-time 128-D facial embeddings and automated lecture turnout records.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
          {user ? (
            <Link href="/dashboard" className="btn btn-primary" style={{ padding: "14px 28px", fontSize: "1rem" }}>
              <span>Go to Sessions Dashboard</span>
              <ArrowRight size={18} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-primary" style={{ padding: "14px 28px", fontSize: "1rem" }}>
                <span>Launch Portal</span>
                <ArrowRight size={18} />
              </Link>
              <Link href="/signup" className="btn btn-secondary" style={{ padding: "14px 24px", fontSize: "1rem" }}>
                <span>Faculty Registration</span>
              </Link>
            </>
          )}

          <a
            href="https://www.vedx.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="creator-navbar-badge"
            style={{ padding: "12px 20px", fontSize: "0.95rem" }}
          >
            <span>Created by Ved</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
        <div className="card" style={{ padding: "30px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <div className="brand-icon" style={{ width: "42px", height: "42px" }}>
              <Scan size={20} />
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Live Face Scanner</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.925rem", lineHeight: 1.6 }}>
            Scan students in real time via live browser camera feeds. 128-dimensional vector embeddings matched instantly via pgvector cosine distance.
          </p>
        </div>

        <div className="card" style={{ padding: "30px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <div className="brand-icon" style={{ width: "42px", height: "42px" }}>
              <Users size={20} />
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Student Directory</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.925rem", lineHeight: 1.6 }}>
            Direct enrollment via camera snapshots with multi-angle facial sample captures. USN and name searches with instant profile records.
          </p>
        </div>

        <div className="card" style={{ padding: "30px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <div className="brand-icon" style={{ width: "42px", height: "42px" }}>
              <BarChart3 size={20} />
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Dynamic Turnouts</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.925rem", lineHeight: 1.6 }}>
            Per-session analytics dashboard with turnout metrics, chronological timeline grouping, student sorting, and one-click CSV export.
          </p>
        </div>
      </div>
    </div>
  );
}
