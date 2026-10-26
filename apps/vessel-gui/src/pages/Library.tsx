import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../store";
import { PlaylistCover } from "../components/PlaylistCover";
import { ConfirmModal } from "../components/Modal";
import { CreateOrImportPlaylistModal } from "../components/CreateOrImportPlaylistModal";
import { resolveArtworkUrl } from "../lib/utils";
import { t } from "../i18n";
import * as api from "../api/commands";
import type { FollowedArtist } from "../api/types";

type LibraryTab = "playlists" | "albums" | "artists";
type ViewMode = "grid" | "list";

export function Library() {
  const { state, navigateTo, showToast, refresh, lang } = useApp();
  const [activeTab, setActiveTab] = useState<LibraryTab>("playlists");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("vessel_library_view_mode") as ViewMode) || "grid";
    } catch {
      return "grid";
    }
  });

  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [createOrImportOpen, setCreateOrImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0, opacity: 0 });

  useLayoutEffect(() => {
    const el = tabButtonRefs.current[activeTab];
    if (el) {
      setSliderStyle({
        left: el.offsetLeft,
        width: el.offsetWidth,
        opacity: 1,
      });
    }
  }, [activeTab]);

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === "grid" ? "list" : "grid";
      try {
        localStorage.setItem("vessel_library_view_mode", next);
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    if (activeTab === "artists") {
      setLoadingArtists(true);
      void api
        .getFollowedArtists()
        .then((artists) => {
          if (active) {
            setFollowedArtists(artists);
            setLoadingArtists(false);
          }
        })
        .catch((err) => {
          if (active) {
            showToast(String(err), true);
            setLoadingArtists(false);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [activeTab, showToast]);

  const loadArtists = async () => {
    try {
      const list = await api.getFollowedArtists();
      setFollowedArtists(list);
    } catch (err) {
      showToast(String(err), true);
    }
  };

  if (!state) return null;

  const playlists = state.playlists ?? [];
  const userPlaylists = useMemo(() => playlists.filter((p) => !p.is_album), [playlists]);
  const savedAlbums = useMemo(() => playlists.filter((p) => Boolean(p.is_album)), [playlists]);

  const filteredPlaylists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return userPlaylists;
    return userPlaylists.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [userPlaylists, searchQuery]);

  const filteredAlbums = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return savedAlbums;
    return savedAlbums.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.artist_name && a.artist_name.toLowerCase().includes(q))
    );
  }, [savedAlbums, searchQuery]);

  const filteredArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return followedArtists;
    return followedArtists.filter((a) => a.name.toLowerCase().includes(q));
  }, [followedArtists, searchQuery]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePlaylist(deleteTarget.id);
      await refresh();
      showToast(`${t(lang, "common.deleted")} ${deleteTarget.title}`);
      setDeleteTarget(null);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleUnfollowArtist = async (e: React.MouseEvent, id: string, _name?: string, provider?: string) => {
    e.stopPropagation();
    try {
      await api.unfollowArtist(id, provider);
      await loadArtists();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  return (
    <div
      className="view library-page"
      style={{
        padding: "0 32px var(--safe-area-bottom, 140px)",
        width: "100%",
        margin: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Top Header & Navigation Bar */}
      <div
        className="library-header"
        style={{
          padding: "16px 0 6px",
          borderBottom: "none",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>
          {lang === "ru" ? "Библиотека" : "Library"}
        </h1>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {/* Clean Segmented Control Tabs (Pills without counts) */}
          <div
            className="library-tabs-track"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              background: "transparent",
              border: "none",
              borderRadius: "24px",
              padding: "2px",
              gap: "2px",
            }}
          >
            <span
              className="library-tab-slider-pill"
              style={{
                position: "absolute",
                top: "2px",
                bottom: "2px",
                left: `${sliderStyle.left}px`,
                width: `${sliderStyle.width}px`,
                opacity: sliderStyle.opacity,
                background: "var(--card-bg, #000000)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.4)",
                transition: "left 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
            {(
              [
                { id: "playlists", label: lang === "ru" ? "Плейлисты" : "Playlists" },
                { id: "albums", label: lang === "ru" ? "Альбомы" : "Albums" },
                { id: "artists", label: lang === "ru" ? "Исполнители" : "Artists" },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabButtonRefs.current[tab.id] = el;
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    position: "relative",
                    zIndex: 2,
                    background: "transparent",
                    color: isActive ? "var(--text)" : "var(--text3)",
                    border: "none",
                    borderRadius: "20px",
                    padding: "6px 18px",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    cursor: "pointer",
                    transition: "color 0.18s ease",
                    userSelect: "none",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search filter & Display Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              className="library-search-box"
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.05)",
                border: "none",
                borderRadius: "20px",
                padding: "6px 14px",
                width: "220px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === "ru" ? "Поиск в библиотеке…" : "Search library…"}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text)",
                  fontSize: "13px",
                  marginLeft: "8px",
                  width: "100%",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text3)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={toggleViewMode}
              title={viewMode === "grid" ? (lang === "ru" ? "Список" : "List") : lang === "ru" ? "Сетка" : "Grid"}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "none",
                borderRadius: "10px",
                padding: "8px",
                cursor: "pointer",
                color: "var(--text2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s ease",
              }}
            >
              {viewMode === "grid" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Areas with smooth animated transition */}
      <div key={`${activeTab}-${viewMode}`} className="library-animated-view" style={{ marginTop: "14px" }}>
        {/* TAB 1: PLAYLISTS */}
        {activeTab === "playlists" && (
          <>
            {viewMode === "grid" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(175px, 185px))",
                  gap: "20px 16px",
                  justifyContent: "flex-start",
                }}
              >
                {/* Pinned Card: Favorites (🤍) */}
                <div
                  className="library-grid-card"
                  onClick={() => navigateTo("favorites")}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: "12px",
                      overflow: "hidden",
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
                    }}
                  >
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.72 1.06-1.06a5.5 5.5 0 0 0 0-7.84z" />
                    </svg>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "13.5px",
                        color: "var(--text, #ffffff)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.3,
                      }}
                    >
                      {lang === "ru" ? "Понравившиеся" : "Favorite Tracks"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text2, rgba(255, 255, 255, 0.6))", marginTop: "2px" }}>
                      {state.library.length} {t(lang, "playlists.tracks")}
                    </div>
                  </div>
                </div>

                {/* User Playlists in Grid */}
                {filteredPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    className="library-grid-card"
                    onClick={() => navigateTo("playlist", { playlistId: pl.id })}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        position: "relative",
                        borderRadius: "12px",
                        overflow: "hidden",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
                      }}
                    >
                      <PlaylistCover tracks={pl.tracks} coverUrl={pl.cover_url} borderRadius={12} border={false} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "13.5px",
                          color: "var(--text, #ffffff)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {pl.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text2, rgba(255, 255, 255, 0.6))", marginTop: "2px" }}>
                        {pl.tracks.length} {t(lang, "playlists.tracks")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Linear List View (50px covers, smooth rows) */
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {/* Favorites row in list */}
                <div
                  className="library-list-row"
                  onClick={() => navigateTo("favorites")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: "transparent",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      width: "50px",
                      height: "50px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.72 1.06-1.06a5.5 5.5 0 0 0 0-7.84z" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)" }}>
                      {lang === "ru" ? "Понравившиеся" : "Favorite Tracks"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text2)", marginTop: "2px" }}>
                      {state.library.length} {t(lang, "playlists.tracks")}
                    </div>
                  </div>
                </div>

                {/* User Playlists rows in list */}
                {filteredPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    className="library-list-row"
                    onClick={() => navigateTo("playlist", { playlistId: pl.id })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: "transparent",
                      transition: "background 0.15s ease",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ width: "50px", height: "50px", flexShrink: 0, borderRadius: "8px", overflow: "hidden" }}>
                      <PlaylistCover size={50} tracks={pl.tracks} coverUrl={pl.cover_url} borderRadius={8} border={false} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pl.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text2)", marginTop: "2px" }}>
                        {pl.tracks.length} {t(lang, "playlists.tracks")}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: pl.id, title: pl.title });
                      }}
                      title={lang === "ru" ? "Удалить" : "Delete"}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text3)",
                        cursor: "pointer",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        opacity: 0.6,
                        fontSize: "14px",
                        transition: "opacity 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* TAB 2: ALBUMS */}
        {activeTab === "albums" && (
          <div>
            {filteredAlbums.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 20px",
                  color: "var(--text2)",
                  background: "transparent",
                  border: "none",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                  {lang === "ru" ? "Нет сохранённых альбомов" : "No saved albums yet"}
                </div>
                <div style={{ fontSize: "13px" }}>
                  {lang === "ru"
                    ? "Импортируйте альбом по ссылке или добавьте его в карточке артиста"
                    : "Import an album via link or save one from an artist profile"}
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(175px, 185px))",
                  gap: "20px 16px",
                  justifyContent: "flex-start",
                }}
              >
                {filteredAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="library-grid-card"
                    onClick={() => navigateTo("playlist", { playlistId: album.id })}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        position: "relative",
                        borderRadius: "12px",
                        overflow: "hidden",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
                      }}
                    >
                      <PlaylistCover tracks={album.tracks} coverUrl={album.cover_url} borderRadius={12} border={false} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "13.5px",
                          color: "var(--text, #ffffff)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {album.title}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text2, rgba(255, 255, 255, 0.6))",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: "2px",
                        }}
                      >
                        {album.artist_name || (lang === "ru" ? "Альбом" : "Album")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Albums List View */
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {filteredAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="library-list-row"
                    onClick={() => navigateTo("playlist", { playlistId: album.id })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: "transparent",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ width: "50px", height: "50px", flexShrink: 0, borderRadius: "8px", overflow: "hidden" }}>
                      <PlaylistCover size={50} tracks={album.tracks} coverUrl={album.cover_url} borderRadius={8} border={false} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {album.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text2)", marginTop: "2px" }}>
                        {album.artist_name || (lang === "ru" ? "Альбом" : "Album")} • {album.tracks.length}{" "}
                        {t(lang, "playlists.tracks")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ARTISTS */}
        {activeTab === "artists" && (
          <div>
            {loadingArtists ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text2)" }}>
                {lang === "ru" ? "Загрузка исполнителей…" : "Loading artists…"}
              </div>
            ) : filteredArtists.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 20px",
                  color: "var(--text2)",
                  background: "transparent",
                  border: "none",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                  {lang === "ru" ? "Нет отслеживаемых исполнителей" : "No followed artists"}
                </div>
                <div style={{ fontSize: "13px" }}>
                  {lang === "ru"
                    ? "Нажмите кнопку «+ Подписаться» в карточке любого артиста, чтобы добавить его сюда"
                    : "Click '+ Follow' on any artist card to pin them to your library"}
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(175px, 185px))",
                  gap: "20px 16px",
                  justifyContent: "flex-start",
                }}
              >
                {filteredArtists.map((artist) => {
                  const avatar = resolveArtworkUrl(artist.avatar_url);
                  return (
                    <div
                      key={`${artist.provider}:${artist.id}`}
                      className="library-artist-card"
                      onClick={() =>
                        navigateTo("artist", {
                          artist: artist.name,
                          provider: artist.provider,
                          artistId: artist.id,
                        })
                      }
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          width: "140px",
                          height: "140px",
                          borderRadius: "50%",
                          overflow: "hidden",
                          marginBottom: "10px",
                          background: "rgba(255, 255, 255, 0.05)",
                          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.4)",
                        }}
                      >
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "13.5px",
                          color: "var(--text, #ffffff)",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {artist.name}
                      </div>

                      <div style={{ fontSize: "12px", color: "var(--text2, rgba(255, 255, 255, 0.6))", marginTop: "2px" }}>
                        {lang === "ru" ? "Исполнитель" : "Artist"}
                      </div>

                      <button
                        onClick={(e) => handleUnfollowArtist(e, artist.id, artist.name, artist.provider)}
                        title={lang === "ru" ? "Отписаться" : "Unfollow"}
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "4px",
                          background: "rgba(0, 0, 0, 0.6)",
                          border: "none",
                          borderRadius: "50%",
                          width: "22px",
                          height: "22px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text3)",
                          cursor: "pointer",
                          fontSize: "11px",
                          transition: "background 0.15s ease",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Artists List View */
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {filteredArtists.map((artist) => {
                  const avatar = resolveArtworkUrl(artist.avatar_url);
                  return (
                    <div
                      key={`${artist.provider}:${artist.id}`}
                      className="library-list-row"
                      onClick={() =>
                        navigateTo("artist", {
                          artist: artist.name,
                          provider: artist.provider,
                          artistId: artist.id,
                        })
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        background: "transparent",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div
                        style={{
                          width: "50px",
                          height: "50px",
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          background: "rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "14px",
                            color: "var(--text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {artist.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text2)", marginTop: "2px" }}>
                          {lang === "ru" ? "Исполнитель" : "Artist"}
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleUnfollowArtist(e, artist.id, artist.name, artist.provider)}
                        title={lang === "ru" ? "Отписаться" : "Unfollow"}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text3)",
                          cursor: "pointer",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          opacity: 0.6,
                          fontSize: "13px",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button '+' (FAB) for Creating / Importing Playlists */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="library-fab-container"
            style={{
              position: "fixed",
              bottom: "calc(var(--player-height, 96px) + 24px)",
              right: "28px",
              zIndex: 850,
              transition: "bottom 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <button
              onClick={() => setCreateOrImportOpen(true)}
              title={lang === "ru" ? "Создать или импортировать плейлист" : "Create or import playlist"}
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "var(--accent, #ffffff)",
                color: "var(--accent-contrast-text, #000000)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
                transition: "transform 0.18s ease, box-shadow 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>,
          document.querySelector(".app-shell") || document.body
        )}

      {/* Unified Create or Import Modal */}
      <CreateOrImportPlaylistModal
        isOpen={createOrImportOpen}
        onClose={() => setCreateOrImportOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          lang={lang}
          title={t(lang, "playlists.deleteConfirm")}
          text={`${lang === "ru" ? "Удалить плейлист" : "Delete playlist"} "${deleteTarget.title}"?`}
          confirmText={t(lang, "common.delete")}
          onConfirm={doDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
