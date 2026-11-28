import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { PlaylistCover } from "../components/PlaylistCover";
import { ConfirmModal } from "../components/Modal";
import { CreateOrImportPlaylistModal } from "../components/CreateOrImportPlaylistModal";
import { PageAmbientBackdrop } from "../components/PageAmbientBackdrop";
import { resolveArtworkUrl } from "../lib/utils";
import { t } from "../i18n";
import * as api from "../api/commands";
import type { FollowedArtist, Playlist } from "../api/types";

type LibraryTab = "all" | "playlists" | "albums" | "artists";
type ViewMode = "grid" | "list";

export function Library() {
  const { state, navigateTo, showToast, refresh, lang } = useApp();
  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("vessel_library_view_mode") as ViewMode) || "grid";
    } catch {
      return "grid";
    }
  });

  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState<number>(0);
  const [localCount, setLocalCount] = useState<number>(0);
  const [createOrImportOpen, setCreateOrImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const selectViewMode = (next: ViewMode) => {
    setViewMode(next);
    try {
      localStorage.setItem("vessel_library_view_mode", next);
    } catch {}
  };

  useEffect(() => {
    let active = true;
    setLoadingArtists(true);
    void api
      .getFollowedArtists()
      .then((artists) => {
        if (active) {
          setFollowedArtists(artists);
          setLoadingArtists(false);
        }
      })
      .catch(() => {
        if (active) setLoadingArtists(false);
      });

    void api
      .getDownloadedTracks()
      .then((list) => {
        if (active) setDownloadedCount(list.length);
      })
      .catch(() => {});

    void api
      .getLocalTracks()
      .then((list) => {
        if (active) setLocalCount(list.length);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [state?.playlists, state?.library]);

  const playlists = state?.playlists ?? [];
  const userPlaylists = useMemo(() => playlists.filter((p) => !p.is_album), [playlists]);
  const savedAlbums = useMemo(() => playlists.filter((p) => Boolean(p.is_album)), [playlists]);

  if (!state) return null;

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

  const systemCards = [
    {
      id: "favorites" as const,
      title: lang === "ru" ? "Любимые" : "Favorites",
      subtitle: lang === "ru" ? "Лайкнутые треки" : "Liked tracks",
      count: state.library.length,
      target: "favorites",
      icon: (size: number) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.72 1.06-1.06a5.5 5.5 0 0 0 0-7.84z" />
        </svg>
      ),
    },
    {
      id: "downloads" as const,
      title: lang === "ru" ? "Скачанные" : "Downloaded",
      subtitle: lang === "ru" ? "Кэш и загрузки" : "Cache & downloads",
      count: downloadedCount,
      target: "downloads",
      icon: (size: number) => (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
    },
    {
      id: "local" as const,
      title: lang === "ru" ? "На устройстве" : "On Device",
      subtitle: lang === "ru" ? "Локальные файлы" : "Local audio files",
      count: localCount,
      target: "local",
      icon: (size: number) => (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];

  const renderPlaylistsGrid = (items: Playlist[], includeSystem: boolean) => (
    <div className="library-cards-grid">
      {includeSystem &&
        systemCards.map((card) => (
          <div
            key={card.id}
            className="library-grid-card"
            onClick={() => navigateTo(card.target)}
          >
            <div className="library-system-cover">
              {card.icon(44)}
            </div>
            <div className="library-card-meta">
              <div className="library-card-title">{card.title}</div>
              <div className="library-card-sub">
                {card.subtitle}
              </div>
              <div className="library-card-count">
                {card.count} {t(lang, "playlists.tracks")}
              </div>
            </div>
          </div>
        ))}

      {items.map((pl) => (
        <div
          key={pl.id}
          className="library-grid-card"
          onClick={() => navigateTo("playlist", { playlistId: pl.id })}
        >
          <div className="library-card-cover-wrap">
            <PlaylistCover tracks={pl.tracks} coverUrl={pl.cover_url} borderRadius={12} border={false} />
          </div>
          <div className="library-card-meta">
            <div className="library-card-title">{pl.title}</div>
            {pl.description && (
              <div className="library-card-sub">{pl.description}</div>
            )}
            <div className="library-card-count">
              {pl.tracks.length} {t(lang, "playlists.tracks")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderPlaylistsList = (items: Playlist[], includeSystem: boolean) => (
    <div className="library-list-stack">
      {includeSystem &&
        systemCards.map((card) => (
          <div
            key={card.id}
            className="library-list-row"
            onClick={() => navigateTo(card.target)}
          >
            <div className="library-list-system-thumb">
              {card.icon(22)}
            </div>
            <div className="library-list-meta">
              <div className="library-list-title">{card.title}</div>
              <div className="library-list-sub">
                {card.subtitle} · {card.count} {t(lang, "playlists.tracks")}
              </div>
            </div>
          </div>
        ))}

      {items.map((pl) => (
        <div
          key={pl.id}
          className="library-list-row"
          onClick={() => navigateTo("playlist", { playlistId: pl.id })}
        >
          <div className="library-list-thumb">
            <PlaylistCover size={50} tracks={pl.tracks} coverUrl={pl.cover_url} borderRadius={8} border={false} />
          </div>
          <div className="library-list-meta">
            <div className="library-list-title">{pl.title}</div>
            <div className="library-list-sub">
              {pl.tracks.length} {t(lang, "playlists.tracks")}
            </div>
          </div>
          <button
            className="library-row-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget({ id: pl.id, title: pl.title });
            }}
            title={lang === "ru" ? "Удалить" : "Delete"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );

  const renderAlbums = () => {
    if (savedAlbums.length === 0) {
      return (
        <div className="library-empty-box">
          <div className="t1">{lang === "ru" ? "Нет сохранённых альбомов" : "No saved albums yet"}</div>
          <div className="t2">
            {lang === "ru"
              ? "Импортируйте альбом по ссылке или добавьте его в карточке артиста"
              : "Import an album via link or save one from an artist profile"}
          </div>
        </div>
      );
    }

    if (viewMode === "grid") {
      return (
        <div className="library-cards-grid">
          {savedAlbums.map((album) => (
            <div
              key={album.id}
              className="library-grid-card"
              onClick={() => navigateTo("playlist", { playlistId: album.id })}
            >
              <div className="library-card-cover-wrap">
                <PlaylistCover tracks={album.tracks} coverUrl={album.cover_url} borderRadius={12} border={false} />
              </div>
              <div className="library-card-meta">
                <div className="library-card-title">{album.title}</div>
                <div className="library-card-sub">
                  {album.artist_name || (lang === "ru" ? "Альбом" : "Album")}
                </div>
                <div className="library-card-count">
                  {album.tracks.length} {t(lang, "playlists.tracks")}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="library-list-stack">
        {savedAlbums.map((album) => (
          <div
            key={album.id}
            className="library-list-row"
            onClick={() => navigateTo("playlist", { playlistId: album.id })}
          >
            <div className="library-list-thumb">
              <PlaylistCover size={50} tracks={album.tracks} coverUrl={album.cover_url} borderRadius={8} border={false} />
            </div>
            <div className="library-list-meta">
              <div className="library-list-title">{album.title}</div>
              <div className="library-list-sub">
                {album.artist_name || (lang === "ru" ? "Альбом" : "Album")} · {album.tracks.length}{" "}
                {t(lang, "playlists.tracks")}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderArtists = () => {
    if (loadingArtists && followedArtists.length === 0) {
      return (
        <div className="library-empty-box">
          <div className="t2">{lang === "ru" ? "Загрузка исполнителей…" : "Loading artists…"}</div>
        </div>
      );
    }
    if (followedArtists.length === 0) {
      return (
        <div className="library-empty-box">
          <div className="t1">{lang === "ru" ? "Нет отслеживаемых исполнителей" : "No followed artists"}</div>
          <div className="t2">
            {lang === "ru"
              ? "Нажмите кнопку «+ Подписаться» в карточке любого артиста, чтобы добавить его сюда"
              : "Click '+ Follow' on any artist card to pin them to your library"}
          </div>
        </div>
      );
    }

    if (viewMode === "grid") {
      return (
        <div className="library-cards-grid">
          {followedArtists.map((artist) => {
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
              >
                <div className="library-artist-avatar">
                  {avatar ? (
                    <img src={avatar} alt="" loading="lazy" />
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <div className="library-artist-name">{artist.name}</div>
                <div className="library-card-sub">{lang === "ru" ? "Исполнитель" : "Artist"}</div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="library-list-stack">
        {followedArtists.map((artist) => {
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
            >
              <div className="library-list-avatar">
                {avatar ? (
                  <img src={avatar} alt="" loading="lazy" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              <div className="library-list-meta">
                <div className="library-list-title">{artist.name}</div>
                <div className="library-list-sub">{lang === "ru" ? "Исполнитель" : "Artist"}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="view library-page">
      <PageAmbientBackdrop fallbackClass="page-ambient-glow-fav" />

      <div className="library-header">
        <h1 className="library-page-title">
          {lang === "ru" ? "Библиотека" : "Library"}
        </h1>

        <div className="library-toolbar">
          <div className="library-tabs-track">
            {(
              [
                { id: "all", label: lang === "ru" ? "Все" : "All" },
                { id: "playlists", label: lang === "ru" ? "Плейлисты" : "Playlists" },
                { id: "albums", label: lang === "ru" ? "Альбомы" : "Albums" },
                { id: "artists", label: lang === "ru" ? "Исполнители" : "Artists" },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`library-tab-btn ${isActive ? "active" : ""}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="library-toolbar-actions">
            <div className="library-view-switch" role="group" aria-label={lang === "ru" ? "Режим отображения" : "View mode"}>
              <span
                className="library-view-switch-thumb"
                style={{ transform: `translateX(${viewMode === "list" ? 32 : 0}px)` }}
              />
              <button
                type="button"
                className={`library-view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => selectViewMode("grid")}
                title={lang === "ru" ? "Сетка" : "Grid"}
                aria-label="Grid view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="2" width="5" height="5" rx="1" />
                  <rect x="9" y="2" width="5" height="5" rx="1" />
                  <rect x="9" y="9" width="5" height="5" rx="1" />
                  <rect x="2" y="9" width="5" height="5" rx="1" />
                </svg>
              </button>

              <button
                type="button"
                className={`library-view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                onClick={() => selectViewMode("list")}
                title={lang === "ru" ? "Список" : "List"}
                aria-label="List view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="2.5" y1="4" x2="2.5" y2="4" />
                  <line x1="6" y1="4" x2="13.5" y2="4" />
                  <line x1="2.5" y1="8" x2="2.5" y2="8" />
                  <line x1="6" y1="8" x2="13.5" y2="8" />
                  <line x1="2.5" y1="12" x2="2.5" y2="12" />
                  <line x1="6" y1="12" x2="13.5" y2="12" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              className="library-create-btn"
              onClick={() => setCreateOrImportOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
              <span>{lang === "ru" ? "Создать плейлист" : "Create playlist"}</span>
            </button>
          </div>
        </div>
      </div>

      <div key={`${activeTab}-${viewMode}`} className={`library-animated-view ${activeTab === "all" ? "is-all-tab" : ""}`}>
        {activeTab === "all" && (
          <div className="library-all-sections">
            <section className="library-section">
              <button
                type="button"
                className="library-section-heading"
                onClick={() => setActiveTab("playlists")}
              >
                <span>{lang === "ru" ? "Плейлисты" : "Playlists"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              {viewMode === "grid"
                ? renderPlaylistsGrid(userPlaylists, true)
                : renderPlaylistsList(userPlaylists, true)}
            </section>

            {savedAlbums.length > 0 && (
              <section className="library-section">
                <button
                  type="button"
                  className="library-section-heading"
                  onClick={() => setActiveTab("albums")}
                >
                  <span>{lang === "ru" ? "Альбомы" : "Albums"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {renderAlbums()}
              </section>
            )}

            {followedArtists.length > 0 && (
              <section className="library-section">
                <button
                  type="button"
                  className="library-section-heading"
                  onClick={() => setActiveTab("artists")}
                >
                  <span>{lang === "ru" ? "Исполнители" : "Artists"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {renderArtists()}
              </section>
            )}
          </div>
        )}

        {activeTab === "playlists" &&
          (viewMode === "grid"
            ? renderPlaylistsGrid(userPlaylists, true)
            : renderPlaylistsList(userPlaylists, true))}

        {activeTab === "albums" && renderAlbums()}

        {activeTab === "artists" && renderArtists()}
      </div>

      <CreateOrImportPlaylistModal
        isOpen={createOrImportOpen}
        onClose={() => setCreateOrImportOpen(false)}
      />

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
