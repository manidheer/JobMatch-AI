"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Zap,
  LogOut,
} from "lucide-react";
import { checkHealth } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/jobs", label: "Find Jobs", icon: Briefcase },
  { href: "/tracking", label: "Tracking", icon: Zap },
];

type HealthStatus = "checking" | "online" | "offline";

export default function Navbar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthStatus>("checking");
  const { user, logout } = useAuth();

  const authRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ];
  const isAuthPage = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  useEffect(() => {
    let mounted = true;
    async function ping() {
      try {
        await checkHealth();
        if (mounted) setHealth("online");
      } catch {
        if (mounted) setHealth("offline");
      }
    }
    ping();
    // Re-check every 60 seconds
    const interval = setInterval(ping, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const healthLabel =
    health === "online"
      ? "API Online"
      : health === "offline"
        ? "API Offline"
        : "Checking…";

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link
          href="/"
          className="navbar-logo"
          style={{ textDecoration: "none" }}
        >
          <div className="navbar-logo-icon">
            <span style={{ fontSize: "0.9rem" }}>🎯</span>
          </div>
          <span>JobMatch AI</span>
        </Link>

        <ul className="navbar-links">
          {!isAuthPage &&
            navItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href ||
                (href === "/jobs" && pathname.startsWith("/jobs"));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`navbar-link ${isActive ? "active" : ""}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                </li>
              );
            })}
        </ul>

        {/* API Health indicator */}
        {!isAuthPage && (
          <div className="tooltip-wrapper" style={{ marginLeft: "0.75rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "99px",
                background:
                  health === "online"
                    ? "rgba(16,185,129,0.08)"
                    : health === "offline"
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(245,158,11,0.08)",
                border: `1px solid ${
                  health === "online"
                    ? "rgba(16,185,129,0.2)"
                    : health === "offline"
                      ? "rgba(239,68,68,0.2)"
                      : "rgba(245,158,11,0.2)"
                }`,
                transition: "all 0.4s ease",
              }}
            >
              <span className={`status-dot ${health}`} />
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                {health === "online"
                  ? "Live"
                  : health === "offline"
                    ? "Down"
                    : "…"}
              </span>
            </div>
            <div
              className="tooltip-content"
              style={{
                top: "calc(100% + 8px)",
                bottom: "auto",
                right: 0,
                left: "auto",
                transform: "none",
              }}
            >
              {healthLabel}
            </div>
          </div>
        )}

        {/* User info + logout */}
        {user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginLeft: "0.75rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                maxWidth: "140px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.3rem 0.5rem",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.72rem",
                fontWeight: 600,
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(239,68,68,0.4)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--text-muted)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border)";
              }}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        ) : !isAuthPage ? (
          <Link
            href="/login"
            className="btn btn-primary"
            style={{
              marginLeft: "0.75rem",
              padding: "0.35rem 0.9rem",
              fontSize: "0.8rem",
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
