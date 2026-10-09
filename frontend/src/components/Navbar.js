"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { Camera, Users, Calendar, LogOut, Shield } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user && (pathname === "/login" || pathname === "/signup")) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "36px" }}>
          <Link href="/dashboard" className="brand">
            <div className="brand-icon">
              <Camera size={20} />
            </div>
            <span>AttendX</span>
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

        <div>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
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
            <div style={{ display: "flex", gap: "12px" }}>
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
