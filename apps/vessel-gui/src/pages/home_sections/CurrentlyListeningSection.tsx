import { useState, useEffect } from "react";
import { useApp } from "../../store";
import { Artwork } from "../../components/Artwork";
import { MiniContextMenu, type MiniContextMenuState } from "../../components/MiniContextMenu";
import {
  trackKey,
  filterValidArtists,
  formatDuration,
  canPlay,
} from "../../lib/utils";
import type { TrackRef } from "../../api/types";
import * as api from "../../api/commands";

const CUR_LISTEN_CACHE_KEY = "vessel_cur_listen_cache";
const CUR_LISTEN_TIMESTAMP_KEY = "vessel_cur_listen_timestamp";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

function getCachedListeningTracks(): TrackRef[] {
  try {
    const raw = localStorage.getItem(CUR_LISTEN_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLastFetchTime(): number {
  try {
    const raw = localStorage.getItem(CUR_LISTEN_TIMESTAMP_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveCachedListeningTracks(list: TrackRef[]) {
  try {
    localStorage.setItem(CUR_LISTEN_CACHE_KEY, JSON.stringify(list));
    localStorage.setItem(CUR_LISTEN_TIMESTAMP_KEY, String(Date.now()));
  } catch {}
}

function IconFire() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{
        flexShrink: 0,
        color: "var(--text, #ffffff)",
        display: "block",
      }}
      aria-hidden="true"
    >
      <path d="M12.8324 21.8013C15.9583 21.1747 20 18.926 20 13.1112C20 7.8196 16.1267 4.29593 13.3415 2.67685C12.7235 2.31757 12 2.79006 12 3.50492V5.3334C12 6.77526 11.3938 9.40711 9.70932 10.5018C8.84932 11.0607 7.92052 10.2242 7.816 9.20388L7.73017 8.36604C7.6304 7.39203 6.63841 6.80075 5.85996 7.3946C4.46147 8.46144 3 10.3296 3 13.1112C3 20.2223 8.28889 22.0001 10.9333 22.0001C11.0871 22.0001 11.2488 21.9955 11.4171 21.9858C10.1113 21.8742 8 21.064 8 18.4442C8 16.3949 9.49507 15.0085 10.631 14.3346C10.9365 14.1533 11.2941 14.3887 11.2941 14.7439V15.3331C11.2941 15.784 11.4685 16.4889 11.8836 16.9714C12.3534 17.5174 13.0429 16.9454 13.0985 16.2273C13.1161 16.0008 13.3439 15.8564 13.5401 15.9711C14.1814 16.3459 15 17.1465 15 18.4442C15 20.4922 13.871 21.4343 12.8324 21.8013Z" />
    </svg>
  );
}

export function CurrentlyListeningSection({
  nowKey,
  isLive,
  lang,
}: {
  nowKey: string | null;
  isLive: boolean;
  lang: any;
}) {
  const { playTracks, navigateTo } = useApp();
  const [tracks, setTracks] = useState<TrackRef[]>(() => getCachedListeningTracks());
  const [loading, setLoading] = useState(() => tracks.length === 0);
  const [menu, setMenu] = useState<MiniContextMenuState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (force: boolean = false) => {
      const now = Date.now();
      const lastFetch = getLastFetchTime();
      const hasCached = tracks.length > 0;

      // Если данные свежие (< 10 минут) и не запрошен принудительный рефреш — не трогаем сеть
      if (!force && hasCached && now - lastFetch < CACHE_TTL_MS) {
        setLoading(false);
        return;
      }

      // 1. Пытаемся получить живые треки платформы
      try {
        const live = await api.getPlatformNowPlaying();
        if (!cancelled && live && live.length > 0) {
          const list = live.slice(0, 10);
          setTracks(list);
          saveCachedListeningTracks(list);
          setLoading(false);
          return;
        }
      } catch {}

      // 2. Фолбэк на рекомендации (только если кэш пуст)
      if (!hasCached) {
        try {
          const res = await api.getHomeRecommendations(10);
          if (!cancelled && res && res.length > 0) {
            const list = res.slice(0, 10);
            setTracks(list);
            saveCachedListeningTracks(list);
            setLoading(false);
            return;
          }
        } catch {}

        try {
          const waveRecs = await api.getWaveRecommendations("all", 10);
          if (!cancelled && waveRecs && waveRecs.length > 0) {
            const list = waveRecs.slice(0, 10);
            setTracks(list);
            saveCachedListeningTracks(list);
          }
        } catch {}
      }

      if (!cancelled) setLoading(false);
    };

    void load(false);

    // Фоновый таймер проверяет и обновляет данные раз в 10 минут
    const interval = setInterval(() => {
      void load(true);
    }, CACHE_TTL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading && tracks.length === 0) {
    return (
      <div className="cur-listen-block">
        <div className="cur-listen-head">
          <IconFire />
          <h2 className="cur-listen-title">
            {lang === "ru" ? "Сейчас популярно в Vessel" : "Popular in Vessel"}
          </h2>
        </div>
        <div className="cur-listen-card">
          <div className="cur-listen-cols">
            <div className="cur-listen-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="cur-listen-skel" style={{ height: 56, borderRadius: 8, background: "rgba(255, 255, 255, 0.03)" }} />
              ))}
            </div>
            <div className="cur-listen-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="cur-listen-skel" style={{ height: 56, borderRadius: 8, background: "rgba(255, 255, 255, 0.03)" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tracks.length === 0) return null;

  const leftCol = tracks.slice(0, Math.ceil(tracks.length / 2));
  const rightCol = tracks.slice(Math.ceil(tracks.length / 2));

  const renderTrackItem = (t: TrackRef, index: number) => {
    const k = trackKey(t);
    const isCurrent = nowKey != null && nowKey === k;
    const playing = isCurrent && isLive;
    const playable = canPlay(t.capability);
    const validArtists = filterValidArtists(t.artists);

    const onRowClick = () => {
      if (!playable) return;
      if (isCurrent) {
        void api.togglePlayback();
      } else {
        void playTracks(tracks, index);
      }
    };

    const onMoreClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(rect.right + 4, window.innerWidth - 210);
      const y = Math.min(rect.top, window.innerHeight - 260);
      setMenu({ track: t, x: Math.max(10, x), y: Math.max(10, y), index });
    };

    const onContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const x = Math.min(e.clientX, window.innerWidth - 210);
      const y = Math.min(e.clientY, window.innerHeight - 260);
      setMenu({ track: t, x: Math.max(10, x), y: Math.max(10, y), index });
    };

    return (
      <div
        key={`${k}-${index}`}
        className={`cur-listen-row ${playing ? "now" : ""}`}
        onClick={onRowClick}
        onContextMenu={onContextMenu}
      >
        <div
          className="cur-listen-art-wrap"
          title={playing ? (lang === "ru" ? "Пауза" : "Pause") : (lang === "ru" ? "Слушать" : "Play")}
        >
          <Artwork
            url={t.artwork_url}
            alt={t.title}
            size={48}
            seed={t.id.length}
            className="cur-listen-art"
            isPlaying={playing}
            onPlayClick={async () => {
              if (isCurrent) {
                try { await api.togglePlayback(); } catch {}
              } else {
                void playTracks(tracks, index);
              }
            }}
          />
        </div>

        <div className="cur-listen-info">
          <span className="cur-listen-track-name" title={t.title}>
            {t.title}
          </span>
          <span className="cur-listen-artist-name">
            {validArtists.length > 0
              ? validArtists.map((artist, idx) => (
                  <span
                    key={`${artist}-${idx}`}
                    className="cur-listen-artist-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo("artist", {
                        artist,
                        provider: t.provider === "spotify" ? "deezer" : t.provider,
                      });
                    }}
                  >
                    {artist}
                    {idx < validArtists.length - 1 ? ", " : ""}
                  </span>
                ))
              : "—"}
          </span>
        </div>

        <div className="cur-listen-end">
          <span className="cur-listen-time">{formatDuration(t.duration_ms)}</span>
          <button
            type="button"
            className="cur-listen-more-btn"
            onClick={onMoreClick}
            title={lang === "ru" ? "Опции" : "More options"}
            aria-label="Options"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.2" />
              <circle cx="12" cy="12" r="2.2" />
              <circle cx="12" cy="19" r="2.2" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="cur-listen-block">
      <div className="cur-listen-head">
        <IconFire />
        <h2 className="cur-listen-title">
          {lang === "ru" ? "Сейчас популярно в Vessel" : "Popular in Vessel"}
        </h2>
      </div>

      <div className="cur-listen-card">
        <div className="cur-listen-cols">
          <div className="cur-listen-col">
            {leftCol.map((t, i) => renderTrackItem(t, i))}
          </div>
          <div className="cur-listen-col">
            {rightCol.map((t, i) => renderTrackItem(t, i + leftCol.length))}
          </div>
        </div>
      </div>

      <MiniContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        lang={lang}
      />
    </div>
  );
}
