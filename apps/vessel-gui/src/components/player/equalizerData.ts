export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const EQ_MAX_CUSTOM_PRESETS = 12;
export const EQ_PRESET_NAME_MAX = 24;

export type SpeedMode = "slowed" | "default" | "speed" | "custom";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.05;
export const SPEED_PRESETS: Record<Exclude<SpeedMode, "custom">, number> = {
  slowed: 0.85,
  default: 1.0,
  speed: 1.25,
};

export const PREAMP_MIN_DB = 0;
export const PREAMP_MAX_DB = 12;
export const PREAMP_STEP_DB = 0.5;

export const FLAT_EQ: number[] = EQ_BANDS.map(() => 0);

export type EqCategory = "enhance" | "genre" | "accent" | "custom";

export interface EqPreset {
  id: string;
  category: "enhance" | "genre" | "accent";
  name: string;
  hint: string;
  gains: number[];
}

export interface EqCustomPreset {
  id: string;
  name: string;
  gains: number[];
}

export const EQ_PRESETS: EqPreset[] = [
  // Улучшение (Enhance)
  {
    id: "hifi",
    category: "enhance",
    name: "Hi-Fi",
    hint: "Плотнее низ и больше воздуха, середина не тронута",
    gains: [2, 1.5, 0.5, 0, -0.5, 0, 0.5, 1.5, 2, 2.5],
  },
  {
    id: "clarity",
    category: "enhance",
    name: "Чёткость",
    hint: "Убирает муть на нижней середине, инструменты лучше разделяются",
    gains: [0, 0, -0.5, -1.5, -1, 0, 1.5, 2, 1.5, 1],
  },
  {
    id: "warmth",
    category: "enhance",
    name: "Тепло",
    hint: "Аналоговая теплота, смягчает резкие яркие записи",
    gains: [1.5, 2, 1.5, 0.5, 0, 0, -0.5, -1, -1, -1.5],
  },
  {
    id: "spacious",
    category: "enhance",
    name: "Простор",
    hint: "Более широкая и открытая сцена",
    gains: [1, 1, 0, -1, -1.5, -1, 0, 1, 2, 2.5],
  },
  {
    id: "headphones",
    category: "enhance",
    name: "Наушники",
    hint: "Компенсирует типичные провалы наушников в сабе и верхней середине",
    gains: [2.5, 2, 1, 0, -0.5, 0, 1, 1.5, 0.5, -0.5],
  },
  {
    id: "laptop",
    category: "enhance",
    name: "Ноутбук",
    hint: "Для маленьких динамиков: без лишнего саба, больше тела",
    gains: [-4, -1, 2, 2.5, 1, 0, 1, 1.5, 1, 0],
  },
  {
    id: "night",
    category: "enhance",
    name: "Ночь",
    hint: "Тихое прослушивание: меньше гула и шипения, голос разборчив",
    gains: [-2, -1.5, -0.5, 0, 0.5, 1, 1, 0, -1, -2],
  },
  {
    id: "punch",
    category: "enhance",
    name: "Плотность",
    hint: "Собранный микс, упругая бочка и атака",
    gains: [1, 2, 1.5, 0, -1.5, -0.5, 1, 1.5, 0.5, 0],
  },
  {
    id: "smooth",
    category: "enhance",
    name: "Мягкость",
    hint: "Убирает резкость, уши не устают",
    gains: [0.5, 0.5, 0.5, 0, 0, 0, -1, -2, -1, 0],
  },

  // Жанры (Genre)
  {
    id: "pop",
    category: "genre",
    name: "Поп",
    hint: "Выразительная середина и отполированный верх",
    gains: [-1, 0, 1.5, 2.5, 2, 0.5, -0.5, 0, 1, 1.5],
  },
  {
    id: "rock",
    category: "genre",
    name: "Рок",
    hint: "Плотные барабаны и атака гитар",
    gains: [3, 2.5, 1, -0.5, -1, -0.5, 1, 2, 2.5, 2.5],
  },
  {
    id: "hiphop",
    category: "genre",
    name: "Хип-хоп",
    hint: "Тяжёлые 808, вокал остаётся сверху",
    gains: [4, 3.5, 1.5, 0.5, -0.5, -0.5, 0.5, 0, 1, 1.5],
  },
  {
    id: "electronic",
    category: "genre",
    name: "Электроника",
    hint: "Глубокая бочка и хрусткие синты",
    gains: [3.5, 3, 1, 0, -1.5, 0, 1, 1, 2.5, 3],
  },
  {
    id: "jazz",
    category: "genre",
    name: "Джаз",
    hint: "Тёплый контрабас и воздушные тарелки",
    gains: [2, 1.5, 0.5, 1, -1, -1, 0, 1, 1.5, 2],
  },
  {
    id: "classical",
    category: "genre",
    name: "Классика",
    hint: "Естественный звук зала, мягко раскрытые края",
    gains: [2, 1.5, 1, 0.5, 0, 0, 0, 1, 1.5, 2],
  },
  {
    id: "acoustic",
    category: "genre",
    name: "Акустика",
    hint: "Тело инструментов и детали струн",
    gains: [1.5, 1, 1, 1.5, 0.5, 0.5, 1, 1.5, 1, 0.5],
  },
  {
    id: "rnb",
    category: "genre",
    name: "R&B",
    hint: "Шелковистый вокал на тёплом округлом басу",
    gains: [3, 3, 1.5, 0, -1, 0, 1, 1, 1.5, 2],
  },
  {
    id: "lofi",
    category: "genre",
    name: "Lo-Fi",
    hint: "Пыльный звук с заваленным верхом, как старая плёнка",
    gains: [1, 1.5, 2, 1, 0, -0.5, -1.5, -2.5, -4, -6],
  },

  // Акценты (Accent)
  {
    id: "bass",
    category: "accent",
    name: "Басы",
    hint: "Больше низких частот",
    gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "deep_bass",
    category: "accent",
    name: "Глубокий бас",
    hint: "Максимум саба",
    gains: [9, 8, 5, 1, -1, 0, 0, 0, 0, 0],
  },
  {
    id: "less_bass",
    category: "accent",
    name: "Меньше баса",
    hint: "Убирает гул на басовитых треках или колонках",
    gains: [-6, -5, -3, -1, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "vocal",
    category: "accent",
    name: "Вокал",
    hint: "Выдвигает голос вперёд",
    gains: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1],
  },
  {
    id: "treble",
    category: "accent",
    name: "Высокие",
    hint: "Больше верха и деталей",
    gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  },
  {
    id: "loudness",
    category: "accent",
    name: "Громкость",
    hint: "Подъём низа и верха для тихой громкости",
    gains: [5, 4, 2, 0, -1, 0, 0, 2, 4, 5],
  },
];

export function clampEqGain(db: number): number {
  return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Math.round(db * 2) / 2));
}

export function isEqFlat(gains: number[]): boolean {
  return gains.every((gain) => Math.abs(gain) < 0.01);
}

export function isEqActive(enabled: boolean, gains: number[]): boolean {
  return enabled && !isEqFlat(gains);
}

export function sameEqGains(a: number[], b: number[]): boolean {
  return a.every((gain, i) => Math.abs(gain - (b[i] ?? 0)) < 0.01);
}

export function findEqPreset(gains: number[]): EqPreset | null {
  return EQ_PRESETS.find((preset) => sameEqGains(preset.gains, gains)) ?? null;
}

export function findEqCustomPreset(
  presets: EqCustomPreset[],
  gains: number[],
): EqCustomPreset | null {
  return presets.find((preset) => sameEqGains(preset.gains, gains)) ?? null;
}

export function formatDb(db: number): string {
  const rounded = Math.round(db * 2) / 2;
  return `${rounded > 0 ? "+" : ""}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
}

export function formatEqFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

const STORAGE_KEY = "vessel_equalizer_state_v1";
export const PLAYBACK_RATE_EVENT = "vessel-playback-rate-changed";

export interface EqualizerStoredState {
  enabled: boolean;
  gains: number[];
  customPresets: EqCustomPreset[];
  preampDb: number;
  speedMode: SpeedMode;
  playbackRate: number;
}

export function clampPreampDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(PREAMP_MAX_DB, Math.max(PREAMP_MIN_DB, Math.round(db * 2) / 2));
}

export function clampSpeedRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1.0;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(rate * 20) / 20));
}

export function formatSpeedRate(rate: number): string {
  return `${clampSpeedRate(rate).toFixed(2)}x`;
}

export function isAudioEffectsActive(state: EqualizerStoredState): boolean {
  return (
    isEqActive(state.enabled, state.gains) ||
    state.preampDb > 0.01 ||
    Math.abs(state.playbackRate - 1.0) > 0.01
  );
}

export function loadStoredEqualizer(): EqualizerStoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const speedMode: SpeedMode =
        parsed.speedMode === "slowed" ||
        parsed.speedMode === "default" ||
        parsed.speedMode === "speed" ||
        parsed.speedMode === "custom"
          ? parsed.speedMode
          : "default";
      const playbackRate =
        typeof parsed.playbackRate === "number"
          ? clampSpeedRate(parsed.playbackRate)
          : speedMode === "custom"
          ? 1.0
          : SPEED_PRESETS[speedMode];
      return {
        enabled: Boolean(parsed.enabled),
        gains:
          Array.isArray(parsed.gains) && parsed.gains.length === 10
            ? parsed.gains.map(clampEqGain)
            : FLAT_EQ,
        customPresets: Array.isArray(parsed.customPresets)
          ? parsed.customPresets.slice(0, EQ_MAX_CUSTOM_PRESETS)
          : [],
        preampDb: typeof parsed.preampDb === "number" ? clampPreampDb(parsed.preampDb) : 0,
        speedMode,
        playbackRate,
      };
    }
  } catch {}
  return {
    enabled: false,
    gains: FLAT_EQ,
    customPresets: [],
    preampDb: 0,
    speedMode: "default",
    playbackRate: 1.0,
  };
}

export function saveStoredEqualizer(state: EqualizerStoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PLAYBACK_RATE_EVENT, { detail: { rate: state.playbackRate } }),
      );
    }
  } catch {}
}

export function getStoredPlaybackRate(): number {
  return loadStoredEqualizer().playbackRate;
}
