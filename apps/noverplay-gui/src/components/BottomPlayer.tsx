import { useApp } from "../store";
import { formatTime, artistLabel, providerLabel, isFavorite } from "../lib/utils";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";

export function BottomPlayer() {
  const { state, progress, showToast, refresh } = useApp();
  if (!state) return null;

  const track = state.now_playing;
  const player = state.player;
  const prog = progress ?? player;
  const fav = track ? isFavorite(state.library, track) : false;

  const percent = player.duration_ms > 0
    ? Math.min(100, (prog.position_ms / player.duration_ms) * 100)
    : 0;

  const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player.duration_ms) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = Math.round((x / rect.width) * player.duration_ms);
    try {
      await api.seek(ms);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleVolume = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const vol = Math.round((x / rect.width) * 100);
    try {
      await api.setVolume(Math.max(0, Math.min(100, vol)));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleToggle = async () => {
    try {
      await api.togglePlayback();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleNext = async () => {
    try {
      await api.next();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePrev = async () => {
    try {
      await api.previous();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleFav = async () => {
    if (!track) return;
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleShuffle = async () => {
    try {
      await api.setShuffle(!player.shuffle);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleRepeat = async () => {
    const next = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(next);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <footer className="player">
      <div className="pl-left">
        {track ? (
          <Artwork url={track.artwork_url} alt={track.title} className="pl-art" seed={track.id.length} />
        ) : (
          <div className="pl-art" style={{ background: "var(--elev)" }} />
        )}
        <div className="pl-meta">
          <span className="ttl">{track?.title ?? "No track"}</span>
          <div className="pl-sub">
            <span>{track ? artistLabel(track.artists) : ""}</span>
            {track && <span className="dot" />}
            <span className="pl-src">{track ? providerLabel(track.provider) : ""}</span>
          </div>
        </div>
        <button className={`pl-fav ${fav ? "on" : ""}`} onClick={handleFav} title="Favorite">
          {fav ? "♥" : "♡"}
        </button>
      </div>
      <div className="pl-center">
        <div className="pl-controls">
          <button className={`p-btn muted ${player.shuffle ? "" : "muted"}`} onClick={handleShuffle} title="Shuffle">
            ↻
          </button>
          <button className="p-btn" onClick={handlePrev} title="Previous">
            ◀◀
          </button>
          <button className="p-play" onClick={handleToggle} title="Play / Pause">
            {player.status === "playing" || player.status === "buffering" ? "❚❚" : "▶"}
          </button>
          <button className="p-btn" onClick={handleNext} title="Next">
            ▶▶
          </button>
          <button className={`p-btn ${player.repeat === "off" ? "muted" : ""}`} onClick={handleRepeat} title="Repeat">
            {player.repeat === "one" ? "⤨" : "⤤"}
          </button>
        </div>
        <div className="pl-progress">
          <span className="pl-time">{formatTime(prog.position_ms)}</span>
          <div className="pl-bar" onClick={handleSeek}>
            <div className="fill" style={{ width: `${percent}%` }} />
            <div className="knob" style={{ left: `${percent}%` }} />
          </div>
          <span className="pl-time">{formatTime(player.duration_ms)}</span>
        </div>
      </div>
      <div className="pl-right">
        <button className="p-btn muted" onClick={handleRepeat} title="Repeat">
          {player.repeat === "one" ? "1" : player.repeat === "all" ? "A" : "⤤"}
        </button>
        <div className="vol-bar" onClick={handleVolume}>
          <div className="fill" style={{ width: `${player.volume_percent}%` }} />
          <div className="knob" style={{ left: `${player.volume_percent}%` }} />
        </div>
      </div>
    </footer>
  );
}