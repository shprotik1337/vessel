import { useState } from "react";

import { useApp } from "../store";
import { PlaylistCover } from "../components/PlaylistCover";
import { PlatformIcon } from "../components/PlatformIcon";
import { TextInputModal, ConfirmModal } from "../components/Modal";
import { trackKey } from "../lib/utils";
import { t } from "../i18n";
import * as api from "../api/commands";

type ImportStep =
  | "none"
  | "choose"
  | "url"
  | "provider"
  | "target"
  | "soundcloud-url";

export function Playlists() {
  const { state, navigateTo, showToast, refresh, playTracks, lang } = useApp();
  const [importStep, setImportStep] = useState<ImportStep>("none");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [likesProvider, setLikesProvider] = useState<"soundcloud" | "deezer" | "spotify">("deezer");
  const [likesProfileUrl, setLikesProfileUrl] = useState("");
  const [likesTarget, setLikesTarget] = useState<"favorites" | "playlist">("favorites");
  const [likesPlaylistTitle, setLikesPlaylistTitle] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  if (!state) return null;

  const doCreate = async (title: string) => {
    const name = title.trim();
    if (!name) return;
    try {
      await api.createPlaylist(name);
      await refresh();
      setCreateOpen(false);
      showToast(`${t(lang, "common.created")} ${name}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

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

  const playPlaylist = async (playlistId: string) => {
    const p = state.playlists.find((x) => x.id === playlistId);
    if (!p || p.tracks.length === 0) return;
    try {
      await playTracks(p.tracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const isPlayingPlaylist = (tracks: { provider: string; id: string }[]) => {
    if (!state.now_playing) return false;
    return tracks.some((t) => trackKey(t as never) === trackKey(state.now_playing!));
  };

  const openImport = () => setImportStep("choose");
  const closeImport = () => {
    setImportStep("none");
    setImportUrl("");
    setLikesProfileUrl("");
    setLikesPlaylistTitle("");
  };

  async function doImportUrl() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const pl = await api.importPlaylistUrl(url);
      await refresh();
      closeImport();
      showToast(`${t(lang, "common.imported")} ${pl.title} (${pl.tracks.length} ${t(lang, "playlists.tracks")})`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setImporting(false);
    }
  }

  async function doImportLikes() {
    const scConnected = state?.providers?.find((p) => p.kind === "soundcloud")?.connected;
    if (likesProvider === "soundcloud" && !likesProfileUrl.trim() && !scConnected) {
      showToast(t(lang, "playlists.likesProfileHint"), true);
      return;
    }
    setImporting(true);
    try {
      const title =
        likesTarget === "playlist"
          ? likesPlaylistTitle.trim() || `Лайки ${likesProvider === "deezer" ? "Deezer" : likesProvider === "spotify" ? "Spotify" : "SoundCloud"}`
          : undefined;
      const count = await api.importLikes(
        likesProvider,
        likesTarget,
        likesProvider === "soundcloud" && likesProfileUrl.trim() ? likesProfileUrl.trim() : null,
        title,
      );
      await refresh();
      closeImport();
      showToast(`${t(lang, "playlists.likesImported")} ${count}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setImporting(false);
    }
  }

  const providers = [
    { key: "soundcloud", label: "SoundCloud" },
    { key: "deezer", label: "Deezer" },
    { key: "spotify", label: "Spotify" },
  ] as const;

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">{t(lang, "playlists.title")}</div>
          <div className="view-sub">{state.playlists.length} {t(lang, "playlists.count")}</div>
        </div>
        <div className="btns">
          <button className="btn btn-ghost" onClick={openImport}>
            {t(lang, "playlists.import")}
          </button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style={{verticalAlign:"-2px",marginRight:6}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t(lang, "playlists.new")}
          </button>
        </div>
      </div>

      {state.playlists.length === 0 ? (
        <div className="empty">
          <div className="ico">♫</div>
          <div className="t1">{t(lang, "playlists.empty1")}</div>
          <div className="t2">{t(lang, "playlists.empty2")}</div>
        </div>
      ) : (
        <div className="grid">
          {state.playlists.map((p) => (
            <div
              key={p.id}
              className="card"
              onClick={() => navigateTo("playlist", { playlistId: p.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                setDeleteTarget({ id: p.id, title: p.title });
              }}
            >
              <div className="card-art">
                <PlaylistCover
                  tracks={p.tracks}
                  coverUrl={p.cover_url}
                  border={false}
                />
                <button
                  className="card-play"
                  title={t(lang, "common.play")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void playPlaylist(p.id);
                  }}
                >
                  {isPlayingPlaylist(p.tracks) ? "❚❚" : "▶"}
                </button>
              </div>
              <div className="card-t">{p.title}</div>
              <div className="card-s">{p.tracks.length} {t(lang, "playlists.tracks")}</div>
            </div>
          ))}
        </div>
      )}

      {importStep !== "none" && (
        <div className="ov show" onMouseDown={(e) => e.stopPropagation()}>
          <div
            className="playlist-picker-card"
            style={{ width: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="playlist-picker-head">
              <span className="ov-title">
                {importStep === "choose"
                  ? t(lang, "playlists.importChoice")
                  : importStep === "url"
                    ? t(lang, "playlists.importTitle")
                    : importStep === "provider"
                      ? t(lang, "playlists.likesProvider")
                      : importStep === "soundcloud-url"
                        ? "SoundCloud"
                        : t(lang, "playlists.likesTarget")}
              </span>
              <button className="ov-close" onClick={closeImport}>
                ✕
              </button>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              {importStep === "choose" && (
                <>
                  <div className="set-desc">{t(lang, "playlists.importChoiceSub")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => setImportStep("url")}>
                      {t(lang, "playlists.importUrlOption")}
                    </button>
                    <button className="btn btn-outline" onClick={() => setImportStep("provider")}>
                      {t(lang, "playlists.importLikesOption")}
                    </button>
                  </div>
                </>
              )}

              {importStep === "url" && (
                <>
                  <div className="set-desc">{t(lang, "playlists.importDesc")}</div>
                  <div className="input-row">
                    <input
                      type="text"
                      placeholder="https://soundcloud.com/user/sets/…"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void doImportUrl();
                        if (e.key === "Escape") closeImport();
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="btns" style={{ justifyContent: "space-between" }}>
                    <button className="btn btn-ghost" onClick={() => setImportStep("choose")}>
                      ← {t(lang, "playlists.back")}
                    </button>
                    <div className="btns">
                      <button className="btn btn-outline" onClick={closeImport}>
                        {t(lang, "common.cancel")}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={doImportUrl}
                        disabled={importing || !importUrl.trim()}
                      >
                        {importing ? t(lang, "playlists.importing") : t(lang, "playlists.import")}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {importStep === "provider" && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {providers.map((p) => (
                      <button
                        key={p.key}
                        className="svc-row"
                        style={{
                          cursor: "pointer",
                          color: "var(--text)",
                          background: likesProvider === p.key ? "var(--track)" : "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          width: "100%",
                          textAlign: "left",
                          transition: "background .12s, border-color .12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--hover)";
                          e.currentTarget.style.borderColor = "var(--text)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            likesProvider === p.key ? "var(--track)" : "transparent";
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                        onClick={() => {
                          setLikesProvider(p.key);
                          setLikesProfileUrl("");
                          setImportStep(p.key === "soundcloud" ? "soundcloud-url" : "target");
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <PlatformIcon kind={p.key} size={26} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "var(--text)" }}>
                          {p.label}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="btns" style={{ justifyContent: "space-between" }}>
                    <button className="btn btn-ghost" onClick={() => setImportStep("choose")}>
                      ← {t(lang, "playlists.back")}
                    </button>
                    <button className="btn btn-outline" onClick={closeImport}>
                      {t(lang, "common.cancel")}
                    </button>
                  </div>
                </>
              )}

              {importStep === "soundcloud-url" && (
                <>
                  <div className="set-desc">{t(lang, "playlists.likesProfileHint")}</div>
                  <div className="input-row">
                    <input
                      type="text"
                      placeholder="https://soundcloud.com/username"
                      value={likesProfileUrl}
                      onChange={(e) => setLikesProfileUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && likesProfileUrl.trim()) setImportStep("target");
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="btns" style={{ justifyContent: "space-between" }}>
                    <button className="btn btn-ghost" onClick={() => setImportStep("provider")}>
                      ← {t(lang, "playlists.back")}
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      {state?.providers?.find((p) => p.kind === "soundcloud")?.connected && (
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            setLikesProfileUrl("");
                            setImportStep("target");
                          }}
                        >
                          {lang === "ru" ? "Мой аккаунт" : "My account"}
                        </button>
                      )}
                      <button
                        className="btn btn-primary"
                        disabled={!likesProfileUrl.trim()}
                        onClick={() => setImportStep("target")}
                      >
                        {t(lang, "common.save")}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {importStep === "target" && (
                <>
                  <div className="set-desc">{t(lang, "playlists.likesTarget")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      className={`btn ${likesTarget === "favorites" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setLikesTarget("favorites")}
                    >
                      {t(lang, "playlists.likesToFavorites")}
                    </button>
                    <button
                      className={`btn ${likesTarget === "playlist" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setLikesTarget("playlist")}
                    >
                      {t(lang, "playlists.likesToPlaylist")}
                    </button>
                    {likesTarget === "playlist" && (
                      <div className="input-row">
                        <input
                          type="text"
                          placeholder={t(lang, "playlists.likesPlaylistName")}
                          value={likesPlaylistTitle}
                          onChange={(e) => setLikesPlaylistTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void doImportLikes();
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="btns" style={{ justifyContent: "space-between" }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        setImportStep(likesProvider === "soundcloud" ? "soundcloud-url" : "provider")
                      }
                    >
                      ← {t(lang, "playlists.back")}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={doImportLikes}
                      disabled={importing}
                    >
                      {importing ? t(lang, "playlists.importing") : t(lang, "playlists.import")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {createOpen && (
        <TextInputModal
          lang={lang}
          title={t(lang, "playlists.createName")}
          placeholder={t(lang, "playlists.createName")}
          confirmText={t(lang, "common.create")}
          onSubmit={doCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          lang={lang}
          title={t(lang, "playlists.deleteConfirm").replace("{title}", deleteTarget.title)}
          confirmText={t(lang, "common.delete")}
          onConfirm={doDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
