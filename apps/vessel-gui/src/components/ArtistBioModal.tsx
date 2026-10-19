import { useEffect } from "react";
import { createPortal } from "react-dom";
import { resolveArtworkUrl } from "../lib/utils";
import type { ExternalLink } from "../api/types";

interface ArtistBioModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  avatarUrl?: string | null;
  headerImageUrl?: string | null;
  biography?: string | null;
  biographyDom?: any | null;
  monthlyListeners?: number | null;
  socialLinks?: ExternalLink[];
  onArtistClick?: (artistName: string) => void;
  lang: string;
}

function renderDomNode(node: any, key: string | number, onArtistClick?: (name: string) => void): React.ReactNode {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map((child, idx) => renderDomNode(child, `${key}-${idx}`, onArtistClick));
  }
  if (typeof node === "object" && node.tag) {
    const children = node.children ? renderDomNode(node.children, `${key}-c`, onArtistClick) : null;
    if (node.tag === "p") {
      return (
        <p key={key} style={{ margin: "0 0 12px 0", lineHeight: "1.65" }}>
          {children}
        </p>
      );
    }
    if (node.tag === "a") {
      const href = node.attributes?.href || "";
      const isArtistLink =
        node.data?.api_path?.startsWith("/artists/") ||
        href.includes("genius.com/artists/");

      let textContent = "";
      if (typeof node.children?.[0] === "string") {
        textContent = node.children[0];
      } else if (Array.isArray(node.children)) {
        textContent = node.children.filter((c: any) => typeof c === "string").join("");
      }

      if (isArtistLink && onArtistClick && textContent) {
        return (
          <span
            key={key}
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onArtistClick(textContent);
            }}
            style={{
              color: "var(--accent)",
              cursor: "pointer",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
            title={textContent}
          >
            {children || textContent}
          </span>
        );
      }

      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "var(--accent)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
          }}
        >
          {children}
        </a>
      );
    }
    if (node.tag === "em" || node.tag === "i") {
      return <em key={key}>{children}</em>;
    }
    if (node.tag === "strong" || node.tag === "b") {
      return <strong key={key} style={{ color: "var(--text)" }}>{children}</strong>;
    }
    if (node.tag === "blockquote") {
      return (
        <blockquote
          key={key}
          style={{
            margin: "12px 0",
            padding: "8px 16px",
            borderLeft: "3px solid var(--accent)",
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: "0 8px 8px 0",
            fontStyle: "italic",
            color: "var(--text2)",
          }}
        >
          {children}
        </blockquote>
      );
    }
    return <span key={key}>{children}</span>;
  }
  return null;
}

export function ArtistBioModal({
  isOpen,
  onClose,
  name,
  avatarUrl,
  headerImageUrl,
  biography,
  biographyDom,
  monthlyListeners,
  socialLinks,
  onArtistClick,
  lang,
}: ArtistBioModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bgImg = resolveArtworkUrl(headerImageUrl || avatarUrl);

  const formatListeners = (num: number) => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  return createPortal(
    <div
      className="ov show"
      onMouseDown={onClose}
      style={{
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(12px)",
        background: "rgba(0, 0, 0, 0.75)",
      }}
    >
      <div
        className="ov-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "600px",
          maxWidth: "92vw",
          maxHeight: "85vh",
          background: "var(--card-bg, #000000)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.7)",
          position: "relative",
        }}
      >
        {/* Banner image header */}
        <div
          style={{
            height: "190px",
            width: "100%",
            position: "relative",
            background: bgImg ? `url("${bgImg}") center/cover no-repeat` : "var(--elev)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)",
            }}
          />
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              background: "rgba(0, 0, 0, 0.6)",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: "14px",
              zIndex: 2,
            }}
          >
            ✕
          </button>
          <div
            style={{
              position: "absolute",
              bottom: "16px",
              left: "24px",
              right: "24px",
              display: "flex",
              alignItems: "baseline",
              gap: "12px",
            }}
          >
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#ffffff" }}>{name}</h2>
            {monthlyListeners != null && (
              <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.8)", fontWeight: 500 }}>
                {formatListeners(monthlyListeners)} {lang === "ru" ? "слушателей в месяц" : "monthly listeners"}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable bio content */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div>
            <h4
              style={{
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                color: "var(--text3)",
                marginBottom: "10px",
                fontWeight: 600,
              }}
            >
              {lang === "ru" ? "Об исполнителе" : "About the artist"}
            </h4>
            <div
              style={{
                fontSize: "14px",
                lineHeight: "1.65",
                color: "var(--text)",
              }}
            >
              {biographyDom ? (
                renderDomNode(biographyDom.children || biographyDom, "bio", (artistName) => {
                  onClose();
                  onArtistClick?.(artistName);
                })
              ) : biography ? (
                <div style={{ whiteSpace: "pre-line" }}>{biography}</div>
              ) : (
                <span style={{ color: "var(--text3)" }}>
                  {lang === "ru"
                    ? "Для данного исполнителя подробная биография не предоставлена."
                    : "No detailed biography provided for this artist."}
                </span>
              )}
            </div>
          </div>

          {/* External links */}
          {socialLinks && socialLinks.length > 0 && (
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  color: "var(--text3)",
                  marginBottom: "12px",
                  fontWeight: 600,
                }}
              >
                {lang === "ru" ? "Ссылки и социальные сети" : "Social Links"}
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {socialLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "var(--elev, rgba(255, 255, 255, 0.08))",
                      border: "1px solid var(--border)",
                      borderRadius: "20px",
                      padding: "7px 16px",
                      color: "var(--text)",
                      textDecoration: "none",
                      fontSize: "13px",
                      fontWeight: 500,
                      transition: "all 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.background = "var(--border)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--elev, rgba(255, 255, 255, 0.08))";
                    }}
                  >
                    <span>↗</span>
                    <span>{link.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
