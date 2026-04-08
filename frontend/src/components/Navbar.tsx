"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Zap,
  LogOut,
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const authRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ];
  const isAuthPage = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    if (mobileOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

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
    <>
      <nav className="navbar" ref={menuRef}>
        <div className="navbar-inner">
          {/* Logo */}
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

          {/* Desktop nav links */}
          <ul className="navbar-links navbar-links-desktop">
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

          {/* Right side: health + user (desktop) */}
          <div className="navbar-right-desktop" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* API Health indicator */}
            {!isAuthPage && (
              <div className="tooltip-wrapper">
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
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
                  padding: "0.35rem 0.9rem",
                  fontSize: "0.8rem",
                  textDecoration: "none",
                }}
              >
                Sign in
              </Link>
            ) : null}
          </div>

          {/* Mobile: health dot + hamburger */}
          {!isAuthPage && (
            <div className="navbar-mobile-right" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {/* Small status dot on mobile */}
              <span className={`status-dot ${health}`} title={healthLabel} />
              <button
                type="button"
                className="navbar-hamburger"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle menu"
                style={{
                  background: "none",
                  border: "1px solid var(--bg-border)",
                  borderRadius: "8px",
                  padding: "0.4rem",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {mobileOpen && !isAuthPage && (
          <div className="navbar-mobile-menu animate-fadeDown">
            <ul style={{ listStyle: "none", padding: "0.5rem 0", margin: 0 }}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive =
                  pathname === href ||
                  (href === "/jobs" && pathname.startsWith("/jobs"));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`navbar-mobile-link ${isActive ? "active" : ""}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* User info in mobile menu */}
            {user ? (
              <div style={{
                borderTop: "1px solid var(--bg-border)",
                padding: "0.875rem 1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => { logout(); setMobileOpen(false); }}
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: "8px",
                    padding: "0.35rem 0.75rem",
                    cursor: "pointer",
                    color: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--bg-border)" }}>
                <Link
                  href="/login"
                  className="btn btn-primary"
                  style={{ textDecoration: "none", width: "100%", justifyContent: "center" }}
                  onClick={() => setMobileOpen(false)}
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Backdrop for mobile menu */}
      {mobileOpen && (
        <div
          className="navbar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
