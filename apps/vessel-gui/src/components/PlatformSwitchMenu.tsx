import React, { useState, useRef, useEffect } from "react";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";
import { useApp } from "../store";
import { PlatformIcon } from "./PlatformIcon";
import { getPlatformColor } from "../pages/player/playerIcons";
import { providerLabel } from "../lib/utils";

export interface PlatformSwitchMenuProps {
  track: TrackRef | null | undefined;
  positionMs: number;
  size?: number;
  iconSize?: number;
  direction?: "up" | "down";
  className?: string;
  style?: React.CSSProperties;
  transparent?: boolean;
}

interface PlatformItem {
  id: string;
  label: string;
  color: string;
}

const PLATFORMS: PlatformItem[] = [
  { id: "youtube_music", label: "YouTube Music", color: "#ff0000" },
  { id: "spotify", label: "Spotify", color: "#1ed760" },
  { id: "soundcloud", label: "SoundCloud", color: "#ff5500" },
  { id: "yandex", label: "Яндекс Музыка", color: "#fc3f1d" },
  { id: "deezer", label: "Deezer", color: "#a238ff" },
];

export function PlatformSwitchMenu({
  track,
  positionMs,
  size = 42,
  iconSize: explicitIconSize,
  direction = "up",
  className = "",
  style = {},
  transparent = false,
}: PlatformSwitchMenuProps) {
  const { state, showToast, refresh, lang } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);
  const isLoading = Boolean(loadingPlatform);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!track) return null;

  const currentProvider = track.provider?.toLowerCase() || "";
  const normCurrentProvider = currentProvider === "you_tube_music" ? "youtube_music" : currentProvider;
  const currentBrandColor = getPlatformColor(track.provider);

  const isCurrentPlatform = (platformId: string) => {
    return (
      normCurrentProvider === platformId ||
      (platformId === "youtube_music" && normCurrentProvider === "you_tube_music") ||
      (platformId === "yandex" && normCurrentProvider === "yandex_music")
    );
  };

  const handleSwitch = async (platformId: string) => {
    const normTarget = platformId === "you_tube_music" ? "youtube_music" : platformId;
    if (normTarget === normCurrentProvider) {
      setIsOpen(false);
      return;
    }

    const targetMeta = PLATFORMS.find((p) => p.id === platformId);
    const targetName = targetMeta?.label || providerLabel(platformId);

    setLoadingPlatform(platformId);
    setIsOpen(false);

    try {
      const rawTitle = track.title;
      // Чистим заголовок от скобок продюсеров, фитов, официальных видео-тегов
      const cleanTitle = rawTitle
        .replace(
          /\s*[\(\[](official\s*(music\s*)?video|official\s*audio|visualizer|lyric\s*video|explicit|clean|hq|hd|audio|clip|video|prod\..*?|produced\s*by.*?|feat\..*?|ft\..*?)[\)\]]/gi,
          ""
        )
        .replace(/\s*-\s*(official\s*(music\s*)?video|official\s*audio|visualizer|lyric\s*video)/gi, "")
        .trim();

      const primaryArtist = track.artists?.[0] || "";
      let candidateTracks: TrackRef[] = [];

      // Шаг 1: Поиск по "Чистое название + Основной артист"
      const query1 = `${cleanTitle || rawTitle} ${primaryArtist}`.trim();
      let outcome = await api.search(query1, platformId).catch(() => null);
      if (outcome?.tracks && outcome.tracks.length > 0) {
        candidateTracks = outcome.tracks;
      }

      // Шаг 2 (если не найдено): Ищем ТОЛЬКО по чистому названию трека (особенно важно для SoundCloud)
      if (candidateTracks.length === 0 && cleanTitle.length > 1) {
        outcome = await api.search(cleanTitle, platformId).catch(() => null);
        if (outcome?.tracks && outcome.tracks.length > 0) {
          // Если среди результатов есть трек, где автор или заголовок содержит имя артиста — отдаем приоритет
          const normArtist = primaryArtist.toLowerCase();
          const matchWithArtist = outcome.tracks.find((t) => {
            const inTitle = t.title.toLowerCase().includes(normArtist);
            const inArtists = t.artists?.some((a) => a.toLowerCase().includes(normArtist));
            return inTitle || inArtists;
          });
          // Если есть трек с упоминанием артиста — берём его первым, иначе первый качественный результат (включая ремикс)
          candidateTracks = matchWithArtist ? [matchWithArtist, ...outcome.tracks] : outcome.tracks;
        }
      }

      // Шаг 3 (фоллбэк): Пробуем оригинальное сырое название со скобками
      if (candidateTracks.length === 0) {
        outcome = await api.search(rawTitle, platformId).catch(() => null);
        if (outcome?.tracks && outcome.tracks.length > 0) {
          candidateTracks = outcome.tracks;
        }
      }

      if (candidateTracks.length === 0) {
        showToast(
          lang === "ru"
            ? `Трек «${track.title}» не найден на ${targetName}`
            : `Track "${track.title}" not found on ${targetName}`,
          true
        );
        return;
      }

      const matchedTrack = candidateTracks[0];
      const resumePos = positionMs;
      const currentQueue = state?.queue || [];
      const queueIdx = state?.queue_index ?? 0;

      // Обновляем трек в текущей очереди, сохраняя остальной плейлист
      const nextQueue = [...currentQueue];
      if (queueIdx >= 0 && queueIdx < nextQueue.length) {
        nextQueue[queueIdx] = matchedTrack;
      } else {
        nextQueue.push(matchedTrack);
      }

      await api.playTracks(nextQueue, queueIdx >= 0 && queueIdx < nextQueue.length ? queueIdx : 0);
      await refresh();

      // Восстанавливаем позицию проигрывания, если трек играл более 2 секунд
      if (resumePos > 2000) {
        setTimeout(async () => {
          try {
            await api.seek(resumePos);
          } catch {}
        }, 350);
      }

      showToast(
        lang === "ru"
          ? `Переключено на ${targetName}`
          : `Switched to ${targetName}`
      );
    } catch (err) {
      showToast(
        lang === "ru"
          ? `Не удалось переключить на ${targetName}`
          : `Failed to switch to ${targetName}`,
        true
      );
    } finally {
      setLoadingPlatform(null);
    }
  };

  // Разделяем платформы: текущая внизу, остальные сверху (как на скриншоте 2)
  const otherPlatforms = PLATFORMS.filter((p) => !isCurrentPlatform(p.id));
  const activePlatform = PLATFORMS.find((p) => isCurrentPlatform(p.id)) || {
    id: normCurrentProvider,
    label: providerLabel(track.provider),
    color: currentBrandColor,
  };

  const iconSize = explicitIconSize || Math.max(22, Math.round(size * 0.6));
  const capsuleWidth = Math.max(46, Math.max(size + 2, iconSize + 18));
  const itemSize = Math.max(38, Math.max(size - 4, iconSize + 10));

  return (
    <div
      ref={containerRef}
      className={`platform-switch-wrap ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Trigger Button: squircle matching Screenshot 3 */}
      <button
        type="button"
        className={`platform-switch-btn ${isOpen ? "active" : ""} ${isLoading ? "loading" : ""} ${transparent ? "transparent" : ""}`}
        onClick={() => !isLoading && setIsOpen((prev) => !prev)}
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isLoading ? "wait" : "pointer",
          background: transparent ? "transparent" : "var(--elev, rgba(255, 255, 255, 0.08))",
          border: transparent ? "none" : "1px solid var(--border, rgba(255, 255, 255, 0.12))",
          padding: 0,
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
          transition: "transform 0.15s ease, background 0.15s ease, opacity 0.12s ease",
        }}
        title={
          isLoading
            ? (lang === "ru" ? "Поиск на платформе…" : "Searching on platform…")
            : (lang === "ru"
                ? `Источник: ${providerLabel(track.provider)} (сменить платформу)`
                : `Source: ${providerLabel(track.provider)} (switch platform)`)
        }
        aria-label="Switch music platform"
      >
        {isLoading ? (
          <span className="platform-switch-spinner" />
        ) : (
          <PlatformIcon
            kind={normCurrentProvider}
            size={iconSize}
            color={currentBrandColor}
          />
        )}
      </button>

      {/* Vertical Popover Capsule: expands directly from the button upwards (Screenshot 2 & 5) */}
      {isOpen && (
        <div
          className={`platform-switch-popover ${direction} ${transparent ? "transparent-glass" : ""}`}
          style={{
            position: "absolute",
            [direction === "up" ? "bottom" : "top"]: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: capsuleWidth,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "8px 3px 6px 3px",
            background: transparent ? "var(--elev, rgba(255, 255, 255, 0.08))" : "var(--card-bg, #000000)",
            backdropFilter: "blur(28px) saturate(160%)",
            WebkitBackdropFilter: "blur(28px) saturate(160%)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.14))",
            borderRadius: Math.round(capsuleWidth / 2),
            boxShadow: transparent
              ? "0 18px 48px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border, rgba(255, 255, 255, 0.05))"
              : "0 18px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px var(--border, rgba(255, 255, 255, 0.05))",
            transformOrigin: direction === "up" ? "bottom center" : "top center",
            animation: "platformPopoverAppear 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Other platforms on top */}
          {otherPlatforms.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() => void handleSwitch(platform.id)}
              className="platform-switch-item"
              style={{
                width: itemSize,
                height: itemSize,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              title={platform.label}
            >
              <PlatformIcon kind={platform.id} size={iconSize} color={platform.color} />
            </button>
          ))}

          {/* Subtle separator line */}
          <div
            style={{
              width: 22,
              height: 1,
              background: "var(--border, rgba(255, 255, 255, 0.14))",
              margin: "2px 0",
            }}
          />

          {/* Current active platform at the bottom (anchors exactly over the trigger button) */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="platform-switch-item current"
            style={{
              width: itemSize,
              height: itemSize,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            title={`${activePlatform.label}${lang === "ru" ? " (Сейчас играет)" : " (Current)"}`}
          >
            <PlatformIcon kind={activePlatform.id} size={iconSize} color={activePlatform.color} />
          </button>
        </div>
      )}
    </div>
  );
}
