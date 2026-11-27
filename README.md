# Vessel

<p align="center">
  <a href="https://github.com/shprotik1337/vessel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/shprotik1337/vessel/ci.yml?branch=release&amp;style=for-the-badge&amp;logo=githubactions&amp;logoColor=white&amp;label=CI" alt="CI"></a>
  <a href="#платформа"><img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&amp;logo=windows95&amp;logoColor=white" alt="Windows"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-2EA44F?style=for-the-badge" alt="License: GPL-3.0-only"></a>
</p>

<p align="center">
  <a href="apps/vessel-gui/src-tauri"><img src="https://img.shields.io/badge/Desktop-Tauri%202%20%2B%20WebView2-24C8DB?style=for-the-badge&amp;logo=tauri&amp;logoColor=white" alt="Tauri 2"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Rust%20Core-2024-000000?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="Rust 2024"></a>
  <a href="apps/vessel-gui/src"><img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-3178C6?style=for-the-badge&amp;logo=react&amp;logoColor=white" alt="React + TypeScript"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Audio-CPAL%20%2B%20Symphonia-8A63D2?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="CPAL and Symphonia"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Storage-SQLite-07405E?style=for-the-badge&amp;logo=sqlite&amp;logoColor=white" alt="SQLite"></a>
</p>

**Vessel** — прост плейр прост .

[Возможности](#возможности) · [Провайдеры](#провайдеры) · [Сборка](#сборка-из-исходников) · [Структура проекта](#структура-проекта) · [Архитектура](#архитектура) · [Лицензия](#лицензия)


## Установка

Скачай установщик `Vessel_1.4.0_x64-setup.exe` из [Releases](https://github.com/shprotik1337/vessel/releases/latest) и запусти — NSIS-инсталлятор (~38 МБ) сделает всё сам. Инсталлятор включает всё необходимое для работы.

## Системные требования

- Windows 10/11 x64 с WebView2 Runtime (предустановлен в актуальных Windows 10/11);
- Rust (stable, edition 2024) и Node.js ≥ 18 — только для сборки из исходников.

## Сборка из исходников

```bash
git clone https://github.com/shprotik1337/vessel.git
cd vessel/apps/vessel-gui
npm install
npm run tauri build
```

Готовый NSIS-инсталлятор появится в `target/release/bundle/nsis/Vessel_1.4.0_x64-setup.exe`. Для сборки автономного бинарника без инсталлятора используйте `npm run tauri build -- --no-bundle`.

Режим разработки с горячей перезагрузкой:

```bash
npm run tauri dev
```

## Структура проекта

```
vessel/
├── Cargo.toml                  # workspace + крейт vessel-core (вся логика)
├── src/                        # ядро на Rust
│   ├── app.rs                  # состояние приложения, эффекты, обработка действий
│   ├── action.rs               # действия (Action) — события от runtime к App
│   ├── effect.rs               # эффекты (AppEffect) — команды от App к runtime
│   ├── config.rs               # конфигурация (config.toml) и пути приложения
│   ├── model.rs                # базовые модели: TrackRef, Playlist, ProviderKind…
│   ├── credentials.rs          # виды ключей провайдеров и их состояние
│   ├── secrets.rs              # хранилище секретов: keyring + файл-фоллбэк
│   ├── storage.rs              # SQLite: библиотека, плейлисты, очередь, история
│   ├── user.rs                 # профили и мультипользовательский режим
│   ├── importer.rs             # импорт плейлистов из ссылок
│   ├── recommendation.rs       # общая логика рекомендаций
│   ├── audio/                  # аудиодвижок
│   │   ├── engine.rs           #   AudioEngine: очередь воспроизведения, события
│   │   ├── output.rs           #   вывод через CPAL
│   │   ├── decoder.rs          #   декодирование через Symphonia
│   │   ├── media.rs            #   открытие источников (файл / HTTP / HLS)
│   │   ├── http_source.rs      #   потоковое чтение по HTTP с Range-запросами
│   │   └── hls/                #   HLS-потоки
│   ├── provider/               # провайдеры музыки
│   │   ├── mod.rs              #   трейт MusicProvider, реестр провайдеров
│   │   ├── cache.rs            #   кэш треков и обложек
│   │   ├── soundcloud/         #   SoundCloud
│   │   ├── yandex/             #   Yandex Music
│   │   ├── deezer.rs           #   Deezer
│   │   ├── spotify.rs          #   Spotify
│   │   └── youtube/            #   YouTube Music
│   ├── runtime/                # асинхронный рантайм
│   │   ├── providers.rs        #   сборка реестра провайдеров
│   │   ├── playback.rs         #   задачи воспроизведения
│   │   ├── search.rs           #   параллельный поиск по провайдерам
│   │   └── wave.rs             #   генерация «Моей волны»
│   └── wave/                   # движок рекомендаций «Моя волна»
└── apps/vessel-gui/            # настольное приложение (Tauri 2)
    ├── package.json            # React + TypeScript + Vite
    ├── src/                    # фронтенд
    │   ├── App.tsx             # маршрутизация экранов
    │   ├── store.tsx           # глобальное состояние
    │   ├── api/                # типизированные обёртки invoke()
    │   ├── components/         # TrackRow, BottomPlayer, Sidebar, Artwork, QueueDrawer…
    │   ├── customization/      # CustomizationContext, темы, пресеты, конструктор
    │   └── pages/              # Home, Search, Wave, Artist, Playlists, Favorites, Settings…
    └── src-tauri/              # бэкенд Tauri
        ├── tauri.conf.json     # конфигурация окна и приложения
        └── src/
            ├── lib.rs          # состояние GUI, цикл событий драйвера
            └── commands.rs     # команды Tauri: поиск, плеер, библиотека, профили
```

## Архитектура

**Однонаправленный поток данных.** Фронтенд вызывает Tauri-команды (`commands.rs`), те работают с `GuiCore` — обёрткой над ядром. Ядро состоит из двух половин:

- `App` (синхронный) — владеет состоянием: очередь, библиотека, плейлисты, плеер. Получает `Action`, отдаёт `AppEffect`;
- `Runtime` (асинхронный, Tokio) — выполняет эффекты: сетевые запросы к провайдерам, воспроизведение через AudioEngine, генерацию волны. Результаты возвращаются `Action`'ами.

Фоновый поток-драйвер в `lib.rs` крутит цикл: `poll_actions` → `dispatch(effects)` → обновление `App` → сохранение в SQLite/конфиг → рассылка состояния во фронтенд событиями `state`/`progress`.

## Лицензия

Проект распространяется по лицензии [GNU GPL v3.0](LICENSE).
