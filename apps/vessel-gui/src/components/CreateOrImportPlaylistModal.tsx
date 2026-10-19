import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../store";
import * as api from "../api/commands";
import { t } from "../i18n";
import { PlatformIcon } from "./PlatformIcon";

interface CreateOrImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (playlistId?: string) => void;
}

type TabType = "scratch" | "import";
type ImportMode = "url" | "likes";

export function CreateOrImportPlaylistModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateOrImportPlaylistModalProps) {
  const { lang, showToast, refresh, navigateTo, state } = useApp();

  const [activeTab, setActiveTab] = useState<TabType>("scratch");

  // Scratch tab state
  const [title, setTitle] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Import tab state
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Likes transfer state
  const [likesProvider, setLikesProvider] = useState<"deezer" | "spotify" | "soundcloud">("deezer");
  const [likesTarget, setLikesTarget] = useState<"favorites" | "playlist">("favorites");
  const [likesPlaylistTitle, setLikesPlaylistTitle] = useState("");
  const [likesProfileUrl, setLikesProfileUrl] = useState("");

  // Sliding capsule refs and styles
  const modeRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [modeSlider, setModeSlider] = useState({ left: 0, width: 0, opacity: 0 });

  const subModeRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [subModeSlider, setSubModeSlider] = useState({ left: 0, width: 0, opacity: 0 });

  const providerRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [providerSlider, setProviderSlider] = useState({ left: 0, width: 0, opacity: 0 });

  const targetRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [targetSlider, setTargetSlider] = useState({ left: 0, width: 0, opacity: 0 });

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = modeRefs.current[activeTab];
    if (el) {
      setModeSlider({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
    }
  }, [isOpen, activeTab]);

  useLayoutEffect(() => {
    if (!isOpen || activeTab !== "import") return;
    const el = subModeRefs.current[importMode];
    if (el) {
      setSubModeSlider({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
    }
  }, [isOpen, activeTab, importMode]);

  useLayoutEffect(() => {
    if (!isOpen || activeTab !== "import" || importMode !== "likes") return;
    const el = providerRefs.current[likesProvider];
    if (el) {
      setProviderSlider({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
    }
  }, [isOpen, activeTab, importMode, likesProvider]);

  useLayoutEffect(() => {
    if (!isOpen || activeTab !== "import" || importMode !== "likes") return;
    const el = targetRefs.current[likesTarget];
    if (el) {
      setTargetSlider({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
    }
  }, [isOpen, activeTab, importMode, likesTarget]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const pl = await api.createPlaylist(trimmed);
      await refresh();
      showToast(`${t(lang, "common.created")} ${trimmed}`);
      onClose();
      if (onSuccess) {
        onSuccess(pl.id);
      } else {
        navigateTo("playlist", { playlistId: pl.id });
      }
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setCreating(false);
    }
  };

  const handleImportUrl = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImporting(true);
    try {
      const pl = await api.importPlaylistUrl(trimmed);
      await refresh();
      showToast(`${t(lang, "common.imported")} ${pl.title} (${pl.tracks.length} ${t(lang, "playlists.tracks")})`);
      onClose();
      if (onSuccess) {
        onSuccess(pl.id);
      } else {
        navigateTo("playlist", { playlistId: pl.id });
      }
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setImporting(false);
    }
  };

  const handleImportLikes = async () => {
    const scConnected = state?.providers?.find((p) => p.kind === "soundcloud")?.connected;
    if (likesProvider === "soundcloud" && !likesProfileUrl.trim() && !scConnected) {
      showToast(t(lang, "playlists.likesProfileHint"), true);
      return;
    }
    setImporting(true);
    try {
      const titleTarget =
        likesTarget === "playlist"
          ? likesPlaylistTitle.trim() ||
            `Лайки ${likesProvider === "deezer" ? "Deezer" : likesProvider === "spotify" ? "Spotify" : "SoundCloud"}`
          : undefined;
      const count = await api.importLikes(
        likesProvider,
        likesTarget,
        likesProvider === "soundcloud" && likesProfileUrl.trim() ? likesProfileUrl.trim() : null,
        titleTarget,
      );
      await refresh();
      showToast(`${t(lang, "playlists.likesImported")} ${count}`);
      onClose();
      if (likesTarget === "favorites") {
        navigateTo("favorites");
      }
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div
      className="ov show create-import-playlist-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
      onMouseDown={onClose}
    >
      <div
        className="create-import-playlist-card"
        style={{
          width: "440px",
          maxWidth: "92vw",
          background: "var(--card-bg, #111113)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.75)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          color: "var(--text, #ffffff)",
          boxSizing: "border-box",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ margin: 0, fontSize: "19px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            {activeTab === "scratch"
              ? lang === "ru"
                ? "С нуля"
                : "From scratch"
              : lang === "ru"
              ? "Импорт"
              : "Import"}
          </h2>
          <span style={{ fontSize: "13px", color: "var(--text2, rgba(255, 255, 255, 0.6))" }}>
            {activeTab === "scratch"
              ? lang === "ru"
                ? "Создать новый пустой плейлист"
                : "Create a new empty playlist"
              : lang === "ru"
              ? "Импортировать по ссылке или перенести лайки"
              : "Import via link or transfer your likes"}
          </span>
        </div>

        {/* Segmented Switch: [ С нуля ] [ Импорт ] */}
        <div
          style={{
            position: "relative",
            display: "flex",
            background: "transparent",
            border: "none",
            borderRadius: "10px",
            padding: "0",
            gap: "4px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: modeSlider.left,
              width: modeSlider.width,
              opacity: modeSlider.opacity,
              background: "var(--card-bg, #000000)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
              transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
          <button
            type="button"
            ref={(el) => {
              modeRefs.current["scratch"] = el;
            }}
            onClick={() => setActiveTab("scratch")}
            style={{
              position: "relative",
              zIndex: 2,
              flex: 1,
              padding: "7px 12px",
              border: "none",
              borderRadius: "8px",
              background: "transparent",
              color: activeTab === "scratch" ? "var(--text, #ffffff)" : "var(--text3, rgba(255, 255, 255, 0.45))",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "color 0.15s ease",
            }}
          >
            {lang === "ru" ? "С нуля" : "From scratch"}
          </button>
          <button
            type="button"
            ref={(el) => {
              modeRefs.current["import"] = el;
            }}
            onClick={() => setActiveTab("import")}
            style={{
              position: "relative",
              zIndex: 2,
              flex: 1,
              padding: "7px 12px",
              border: "none",
              borderRadius: "8px",
              background: "transparent",
              color: activeTab === "import" ? "var(--text, #ffffff)" : "var(--text3, rgba(255, 255, 255, 0.45))",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "color 0.15s ease",
            }}
          >
            {lang === "ru" ? "Импорт" : "Import"}
          </button>
        </div>

        {/* TAB 1: FROM SCRATCH */}
        {activeTab === "scratch" && (
          <div className="modal-tab-content-anim" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                background: "var(--elev, rgba(255, 255, 255, 0.05))",
                border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                borderRadius: "10px",
                padding: "10px 14px",
              }}
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === "ru" ? "Название плейлиста" : "Playlist title"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) void handleCreate();
                }}
                autoFocus
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text, #ffffff)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              />
            </div>

            {/* Description toggle */}
            {!showDesc ? (
              <button
                type="button"
                onClick={() => setShowDesc(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text2, rgba(255, 255, 255, 0.6))",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "2px 4px",
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                + {lang === "ru" ? "Описание (необязательно)" : "Description (optional)"}
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  background: "var(--elev, rgba(255, 255, 255, 0.05))",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                  borderRadius: "10px",
                  padding: "10px 14px",
                }}
              >
                <textarea
                  rows={2}
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={lang === "ru" ? "Описание плейлиста..." : "Playlist description..."}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text, #ffffff)",
                    fontSize: "13px",
                    resize: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text2, rgba(255, 255, 255, 0.7))",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {lang === "ru" ? "Отмена" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!title.trim() || creating}
                onClick={handleCreate}
                style={{
                  background: "var(--accent, #ffffff)",
                  color: "var(--accent-contrast-text, #000000)",
                  border: "none",
                  padding: "9px 22px",
                  borderRadius: "8px",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  cursor: title.trim() && !creating ? "pointer" : "not-allowed",
                  opacity: title.trim() && !creating ? 1 : 0.45,
                  transition: "opacity 0.15s ease",
                }}
              >
                {creating ? (lang === "ru" ? "Создание..." : "Creating...") : (lang === "ru" ? "Создать" : "Create")}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT */}
        {activeTab === "import" && (
          <div className="modal-tab-content-anim" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Sub-modes: По ссылке / Лайки */}
            <div
              style={{
                position: "relative",
                display: "flex",
                background: "transparent",
                border: "none",
                borderRadius: "8px",
                padding: "0",
                gap: "4px",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: subModeSlider.left,
                  width: subModeSlider.width,
                  opacity: subModeSlider.opacity,
                  background: "var(--card-bg, #000000)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.35)",
                  transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
              <button
                type="button"
                ref={(el) => {
                  subModeRefs.current["url"] = el;
                }}
                onClick={() => setImportMode("url")}
                style={{
                  position: "relative",
                  zIndex: 2,
                  flex: 1,
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: importMode === "url" ? "var(--text)" : "var(--text3)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "color 0.15s ease",
                }}
              >
                {lang === "ru" ? "По ссылке" : "By URL"}
              </button>
              <button
                type="button"
                ref={(el) => {
                  subModeRefs.current["likes"] = el;
                }}
                onClick={() => setImportMode("likes")}
                style={{
                  position: "relative",
                  zIndex: 2,
                  flex: 1,
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: importMode === "likes" ? "var(--text)" : "var(--text3)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "color 0.15s ease",
                }}
              >
                {lang === "ru" ? "Перенос лайков" : "Transfer likes"}
              </button>
            </div>

            {importMode === "url" ? (
              <div className="modal-tab-content-anim" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div
                  style={{
                    display: "flex",
                    background: "var(--elev, rgba(255, 255, 255, 0.05))",
                    border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                    borderRadius: "10px",
                    padding: "10px 14px",
                  }}
                >
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://open.spotify.com/... or https://music.youtube.com/..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && importUrl.trim()) void handleImportUrl();
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text, #ffffff)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <span style={{ fontSize: "11.5px", color: "var(--text3)" }}>
                  {lang === "ru"
                    ? "Поддерживаются ссылки на плейлисты и альбомы Spotify, YouTube Music, Deezer, SoundCloud"
                    : "Supports Spotify, YouTube Music, Deezer, SoundCloud playlists & albums"}
                </span>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text2)",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lang === "ru" ? "Отмена" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    disabled={!importUrl.trim() || importing}
                    onClick={handleImportUrl}
                    style={{
                      background: "var(--accent, #ffffff)",
                      color: "var(--accent-contrast-text, #000000)",
                      border: "none",
                      padding: "9px 22px",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: importUrl.trim() && !importing ? "pointer" : "not-allowed",
                      opacity: importUrl.trim() && !importing ? 1 : 0.45,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {importing ? (lang === "ru" ? "Импорт..." : "Importing...") : (lang === "ru" ? "Импортировать" : "Import")}
                  </button>
                </div>
              </div>
            ) : (
              /* Likes Transfer Mode */
              <div className="modal-tab-content-anim" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "12px", color: "var(--text2)", fontWeight: 500 }}>
                  {lang === "ru" ? "Выберите сервис:" : "Select service:"}
                </div>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    background: "transparent",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: providerSlider.left,
                      width: providerSlider.width,
                      opacity: providerSlider.opacity,
                      background: "var(--card-bg, #000000)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
                      transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                  {(
                    [
                      { key: "deezer", label: "Deezer" },
                      { key: "spotify", label: "Spotify" },
                      { key: "soundcloud", label: "SoundCloud" },
                    ] as const
                  ).map((prov) => {
                    const isSel = likesProvider === prov.key;
                    return (
                      <button
                        key={prov.key}
                        ref={(el) => {
                          providerRefs.current[prov.key] = el;
                        }}
                        type="button"
                        onClick={() => setLikesProvider(prov.key)}
                        style={{
                          position: "relative",
                          zIndex: 2,
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          color: isSel ? "var(--text)" : "var(--text2)",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "color 0.15s ease",
                        }}
                      >
                        <PlatformIcon kind={prov.key} size={15} />
                        <span>{prov.label}</span>
                      </button>
                    );
                  })}
                </div>

                {likesProvider === "soundcloud" && (
                  <div
                    style={{
                      display: "flex",
                      background: "var(--elev, rgba(255, 255, 255, 0.05))",
                      border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                      borderRadius: "10px",
                      padding: "8px 12px",
                    }}
                  >
                    <input
                      type="text"
                      value={likesProfileUrl}
                      onChange={(e) => setLikesProfileUrl(e.target.value)}
                      placeholder="https://soundcloud.com/username (если не авторизован)"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--text, #ffffff)",
                        fontSize: "12px",
                      }}
                    />
                  </div>
                )}

                <div style={{ fontSize: "12px", color: "var(--text2)", fontWeight: 500, marginTop: "4px" }}>
                  {lang === "ru" ? "Куда сохранить:" : "Save to:"}
                </div>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    background: "transparent",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: targetSlider.left,
                      width: targetSlider.width,
                      opacity: targetSlider.opacity,
                      background: "var(--card-bg, #000000)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.35)",
                      transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                  <button
                    type="button"
                    ref={(el) => {
                      targetRefs.current["favorites"] = el;
                    }}
                    onClick={() => setLikesTarget("favorites")}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      flex: 1,
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background: "transparent",
                      color: likesTarget === "favorites" ? "var(--text)" : "var(--text3)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "color 0.15s ease",
                    }}
                  >
                    {lang === "ru" ? "В Избранное (🤍)" : "Favorites (🤍)"}
                  </button>
                  <button
                    type="button"
                    ref={(el) => {
                      targetRefs.current["playlist"] = el;
                    }}
                    onClick={() => setLikesTarget("playlist")}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      flex: 1,
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background: "transparent",
                      color: likesTarget === "playlist" ? "var(--text)" : "var(--text3)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "color 0.15s ease",
                    }}
                  >
                    {lang === "ru" ? "В отдельный плейлист" : "Separate playlist"}
                  </button>
                </div>

                {likesTarget === "playlist" && (
                  <div
                    style={{
                      display: "flex",
                      background: "var(--elev, rgba(255, 255, 255, 0.05))",
                      border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
                      borderRadius: "10px",
                      padding: "8px 12px",
                    }}
                  >
                    <input
                      type="text"
                      maxLength={30}
                      value={likesPlaylistTitle}
                      onChange={(e) => setLikesPlaylistTitle(e.target.value)}
                      placeholder={`Лайки ${likesProvider === "deezer" ? "Deezer" : likesProvider === "spotify" ? "Spotify" : "SoundCloud"}`}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--text, #ffffff)",
                        fontSize: "12.5px",
                      }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text2)",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lang === "ru" ? "Отмена" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleImportLikes}
                    style={{
                      background: "var(--accent, #ffffff)",
                      color: "var(--accent-contrast-text, #000000)",
                      border: "none",
                      padding: "9px 22px",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: !importing ? "pointer" : "not-allowed",
                      opacity: !importing ? 1 : 0.45,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {importing ? (lang === "ru" ? "Перенос..." : "Transferring...") : (lang === "ru" ? "Перенести лайки" : "Transfer likes")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
