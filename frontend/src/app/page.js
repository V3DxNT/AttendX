"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "20px" }}>
      <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "36px", display: "flex", flexDirection: "column", gap: "18px", alignItems: "center" }}>
        <div className="skeleton skeleton-avatar" style={{ width: "56px", height: "56px" }} />
        <div className="skeleton skeleton-text" style={{ width: "180px", height: "18px" }} />
        <div className="skeleton skeleton-text" style={{ width: "240px", height: "12px" }} />
        <div className="skeleton" style={{ width: "100%", height: "42px", borderRadius: "8px", marginTop: "10px" }} />
      </div>
    </div>
  );
}
