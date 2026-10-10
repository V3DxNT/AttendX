"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { Users, Calendar, LogOut, Shield, ExternalLink } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user && (pathname === "/login" || pathname === "/signup")) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <Link href="/dashboard" className="brand">
            <div className="brand-icon">
              <img
                src="/graduated.png"
                alt="AttendX"
                style={{ width: "24px", height: "24px", objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span>AttendX</span>
              <span className="doodle-tag" style={{ fontSize: "1.05rem", color: "var(--accent-indigo)" }}>portal</span>
            </div>
          </Link>

          {user && (
            <div className="nav-links">
              <Link
                href="/dashboard"
                className={`nav-link ${pathname.startsWith("/dashboard") || pathname.startsWith("/sessions") ? "active" : ""}`}
              >
                <Calendar size={18} />
                <span>Sessions</span>
              </Link>
              <Link
                href="/students"
                className={`nav-link ${pathname.startsWith("/students") ? "active" : ""}`}
              >
                <Users size={18} />
                <span>Students</span>
              </Link>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <a
            href="https://www.vedx.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="creator-navbar-badge"
            title="Portfolio of Ved"
          >
            <span>by Ved</span>
            <ExternalLink size={12} />
          </a>

          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="user-badge">
                <span style={{ fontWeight: 600 }}>{user.full_name}</span>
                <span className={`role-tag ${user.role}`}>
                  {user.role === "admin" && <Shield size={12} style={{ display: "inline", marginRight: "4px" }} />}
                  {user.role}
                </span>
              </div>
              <button onClick={logout} className="btn btn-secondary btn-sm" title="Log out">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px" }}>
              <Link href="/login" className="btn btn-secondary btn-sm">
                Log In
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
