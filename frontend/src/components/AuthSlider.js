"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { Camera, AlertCircle, ArrowRight, UserPlus, LogIn, Sparkles, ShieldCheck } from "lucide-react";
import { CapDoodle, StarDoodle, SparkleDoodle, NotebookDoodle } from "./DoodleIcons";

export default function AuthSlider({ initialMode = "login" }) {
  const { login, signup } = useAuth();
  const router = useRouter();

  const [isSignUp, setIsSignUp] = useState(initialMode === "signup");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupInviteCode, setSignupInviteCode] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      await login(loginEmail, loginPassword);
      router.push("/dashboard");
    } catch (err) {
      if (err.code === "INVALID_CREDENTIALS") {
        setLoginError("Invalid email or password.");
      } else if (err.code === "TOO_MANY_ATTEMPTS") {
        setLoginError("Too many attempts. Account locked for 15 minutes.");
      } else if (err.code === "ACCOUNT_DISABLED") {
        setLoginError("Account inactive. Please contact your administrator.");
      } else {
        setLoginError(err.message || "Failed to log in.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError("");
    setSignupLoading(true);

    try {
      await signup(signupEmail, signupFullName, signupPassword, signupInviteCode);
      router.push("/dashboard");
    } catch (err) {
      if (err.code === "INVALID_INVITE_CODE") {
        setSignupError("Invalid registration invite code.");
      } else if (err.code === "EMAIL_EXISTS") {
        setSignupError("An account with this email already exists.");
      } else {
        setSignupError(err.message || "Failed to register.");
      }
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="auth-slider-wrapper">
      <div className={`auth-slider-box ${isSignUp ? "mode-signup" : "mode-login"}`}>
        <div className="auth-mobile-switch" style={{ width: "100%", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={`btn btn-sm ${!isSignUp ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1, borderRadius: "9999px" }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={`btn btn-sm ${isSignUp ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1, borderRadius: "9999px" }}
          >
            Register
          </button>
        </div>

        <div
          className="auth-form-container"
          style={{
            opacity: isSignUp ? 0 : 1,
            pointerEvents: isSignUp ? "none" : "auto",
            display: isSignUp ? "none" : "flex",
          }}
        >
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span className="doodle-badge">
                <CapDoodle size={16} /> Student & Faculty Portal
              </span>
              <span className="doodle-tag">✦ welcome</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Sign In to AttendX
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
              Enter your credentials to access live facial scanner & sessions.
            </p>
          </div>

          {loginError && (
            <div className="alert alert-error">
              <AlertCircle size={18} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label">Campus Email</label>
              <input
                type="email"
                required
                className="form-input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="faculty@university.edu"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                className="form-input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "8px", padding: "12px" }}
            >
              {loginLoading ? "Authenticating..." : "Sign In to Portal"}
              {!loginLoading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <div
          className="auth-form-container"
          style={{
            marginLeft: "auto",
            opacity: !isSignUp ? 0 : 1,
            pointerEvents: !isSignUp ? "none" : "auto",
            display: !isSignUp ? "none" : "flex",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span className="doodle-badge">
                <NotebookDoodle size={16} /> New Registration
              </span>
              <span className="doodle-tag">✦ join us</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Create Account
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
              Register with your faculty invite code to manage attendance.
            </p>
          </div>

          {signupError && (
            <div className="alert alert-error">
              <AlertCircle size={18} />
              <span>{signupError}</span>
            </div>
          )}

          <form onSubmit={handleSignupSubmit}>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label">Full Name</label>
              <input
                type="text"
                required
                className="form-input"
                value={signupFullName}
                onChange={(e) => setSignupFullName(e.target.value)}
                placeholder="Prof. Alan Turing"
              />
            </div>

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label">Campus Email</label>
              <input
                type="email"
                required
                className="form-input"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="alan@university.edu"
              />
            </div>

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                className="form-input"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label className="form-label">Invite Code</label>
              <input
                type="text"
                required
                className="form-input"
                value={signupInviteCode}
                onChange={(e) => setSignupInviteCode(e.target.value)}
                placeholder="ATTENDX-FACULTY-XXXX"
              />
            </div>

            <button
              type="submit"
              disabled={signupLoading}
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px" }}
            >
              {signupLoading ? "Registering..." : "Create Account"}
              {!signupLoading && <UserPlus size={16} />}
            </button>
          </form>
        </div>

        <div className="auth-slider-overlay">
          {!isSignUp ? (
            <div>
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "18px" }}>
                <CapDoodle size={36} color="#ffffff" />
                <StarDoodle size={28} color="#fde047" />
              </div>
              <h2 style={{ fontSize: "1.85rem", fontWeight: 800, marginBottom: "12px", letterSpacing: "-0.02em" }}>
                Welcome, Scholar!
              </h2>
              <p style={{ opacity: 0.92, fontSize: "0.95rem", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto" }}>
                Don't have an AttendX account yet? Request an invite code from your institution and join the biometric roster.
              </p>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="auth-slider-toggle-btn"
              >
                Create Account <ArrowRight size={16} style={{ display: "inline", verticalAlign: "middle" }} />
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "18px" }}>
                <NotebookDoodle size={34} color="#ffffff" />
                <SparkleDoodle size={26} color="#67e8f9" />
              </div>
              <h2 style={{ fontSize: "1.85rem", fontWeight: 800, marginBottom: "12px", letterSpacing: "-0.02em" }}>
                Already Enrolled?
              </h2>
              <p style={{ opacity: 0.92, fontSize: "0.95rem", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto" }}>
                Sign in with your registered credentials to start scanning lecture turnouts and export CSV reports.
              </p>
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="auth-slider-toggle-btn"
              >
                Sign In Now <LogIn size={16} style={{ display: "inline", verticalAlign: "middle" }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
