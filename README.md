# Vessel

<p align="center">
  <a href="https://github.com/shprotik1337/vessel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/shprotik1337/vessel/ci.yml?branch=main&amp;style=for-the-badge&amp;logo=githubactions&amp;logoColor=white&amp;label=CI" alt="CI"></a>
  <a href="#системные-требования"><img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&amp;logo=windows95&amp;logoColor=white" alt="Windows"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-2EA44F?style=for-the-badge" alt="License: GPL-3.0-only"></a>
</p>

<p align="center">
  <a href="apps/vessel-gui/src-tauri"><img src="https://img.shields.io/badge/Desktop-Tauri%202%20%2B%20WebView2-24C8DB?style=for-the-badge&amp;logo=tauri&amp;logoColor=white" alt="Tauri 2"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Rust%20Core-2024-000000?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="Rust 2024"></a>
  <a href="apps/vessel-gui/src"><img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-3178C6?style=for-the-badge&amp;logo=react&amp;logoColor=white" alt="React + TypeScript"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Audio-CPAL%20%2B%20Symphonia-8A63D2?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="CPAL and Symphonia"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Storage-SQLite-07405E?style=for-the-badge&amp;logo=sqlite&amp;logoColor=white" alt="SQLite"></a>
</p>

**Vessel** — настольный музыкальный клиент с единым поиском по SoundCloud, Yandex Music, Deezer, Spotify и YouTube Music. Одна очередь, общая библиотека и «Моя волна» поверх всех подключённых площадок.

[Возможности](#возможности) · [Провайдеры](#провайдеры) · [Сборка](#сборка-из-исходников) · [Структура проекта](#структура-проекта) · [Архитектура](#архитектура) · [Лицензия](#лицензия)

## Возможности

- **Единый поиск** по всем настроенным сервисам сразу или по выбранной площадке: треки, плейлисты, альбомы, артисты;
- **полноценный плеер**: воспроизведение, пауза, перемотка, громкость, shuffle, три режима repeat, буферизация с прогрессом;
- **«Моя волна»** — персональные рекомендации на основе истории, любимых треков и подборок провайдеров, с выбором площадок-источников;
- **карточки артистов**: аватар, популярные треки, дискография сеткой, вся музыка — единый вид для всех сервисов;
- **импорт плейлистов и альбомов** по ссылкам SoundCloud, Yandex Music, Deezer, Spotify и YouTube Music;
- **локальная библиотека** с сортировкой и drag-and-drop, плейлисты с обложками, история прослушивания;
- **несколько профилей** с раздельными библиотеками, экспорт/импорт/бэкап пользователя;
- **вход через браузер** для Spotify и YouTube Music: встроенное окно входа, ключи остаются только на устройстве;
- **двухязычный интерфейс** (русский и английский) с мгновенным переключением;
- гостевой режим — аккаунт не обязателен.

## Провайдеры

Vessel подключает только включённые и настроенные сервисы — если площадка недоступна или не настроена, остальные продолжают работать независимо. Провайдер можно включить/выключить в один клик, реестр пересобирается без перезапуска приложения.

| Сервис | Как подключить | Что даёт |
| --- | --- | --- |
| SoundCloud | `client_id` (можно вставить вручную или получить через аккаунт) | поиск, треки, плейлисты, похожие треки |
| Yandex Music | OAuth-токен из расширения [yandex-music-token](https://github.com/DoorChop/yandex-music-oauth-token) | поиск, треки, плейлисты, персональная волна |
| Deezer | cookie `arl` | поиск, треки, плейлисты, похожие треки |
| Spotify | cookie `sp_dc` или вход через браузер (берёт и `sp_dc`, и OAuth) | поиск, треки, плейлисты, альбомы, карточки артистов |
| YouTube Music | без ключа (анонимно, первые ~60 секунд трека) или cookie YouTube через вход в браузер (полные треки) | поиск, треки, плейлисты, альбомы, артисты, похожие треки |

### Где взять ключи

- **SoundCloud** — `client_id` из любого веб-запроса soundcloud.com к API;
- **Yandex Music** — токен из браузерного расширения yandex-music-token;
- **Deezer** — значение cookie `arl` из браузера с залогиненным аккаунтом;
- **Spotify** — cookie `sp_dc` из браузера, либо кнопка «Войти через браузер» в Настройках;
- **YouTube Music** — работает сразу после включения; для полных треков — cookie YouTube (SID, HSID, SSID, LOGIN_INFO и другие) кнопкой «Войти через браузер».

Все ключи хранятся локально: сначала в системном хранилище учётных данных (Windows Credential Manager / Secret Service), при его недоступности — в файле `secrets.json` рядом с данными приложения.

> Vessel не является официальным клиентом перечисленных сервисов. Для работы провайдеров нужен действующий доступ к соответствующим площадкам.

## Установка

Скачай установщик `Vessel_1.0.0_x64-setup.exe` из [Releases](https://github.com/shprotik1337/vessel/releases/latest) и запусти — NSIS-инсталлятор (~14 МБ) сделает всё сам. Инсталлятор включает всё нужное: поиск, плеер, импорт плейлистов и лайков.

Альтернатива без установки: скачай portable `vessel.exe` из вложений релиза и запусти его откуда угодно.

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

Готовый installer появится в `target/release/bundle/nsis/Vessel_1.0.0_x64-setup.exe`.

Режим разработки с горячей перезагрузкой:

```bash
npm run tauri dev
```

Проверки перед коммитом:

```bash
cargo fmt --all -- --check
cargo test --lib --locked -j 2
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
│   │   ├── hls/                #   HLS-потоки (плейлисты чанков)
│   │   └── convert.rs          #   конвертация сэмплов
│   ├── provider/               # провайдеры музыки
│   │   ├── mod.rs              #   трейт MusicProvider, реестр провайдеров
│   │   ├── cache.rs            #   кэш треков и обложек
│   │   ├── soundcloud/         #   SoundCloud: клиент, поиск, артисты, плейлисты
│   │   ├── yandex/             #   Yandex Music: клиент, волна, плейлисты, альбомы
│   │   ├── deezer.rs           #   Deezer: REST API
│   │   ├── spotify.rs          #   Spotify: Pathfinder GraphQL + Web API + аудио
│   │   ├── youtube/            #   YouTube Music: Innertube (поиск, плеер, резолвер)
│   │   └── download.rs         #   скачивание треков
│   ├── runtime/                # асинхронный рантайм
│   │   ├── providers.rs        #   сборка реестра провайдеров из конфига+секретов
│   │   ├── playback.rs         #   задачи воспроизведения
│   │   ├── search.rs           #   параллельный поиск по провайдерам
│   │   ├── wave.rs             #   генерация «Моей волны»
│   │   ├── importer.rs         #   импорт плейлистов
│   │   ├── account.rs          #   клиент аккаунтов vessel
│   │   └── onboarding.rs       #   проверка SoundCloud, Zapret
│   ├── wave/                   # движок рекомендаций «Моя волна»
│   │   ├── generator.rs        #   сборка волны из истории/лайков/кандидатов
│   │   ├── selector.rs         #   выбор треков, квоты по провайдерам
│   │   ├── score.rs            #   скоринг кандидатов
│   │   ├── pool.rs             #   пул кандидатов
│   │   └── …                   #   жанры, семена, профили, текстовый анализ
│   ├── account/                # API аккаунтов (логин, капча, восстановление)
│   └── bin/                    # отладочные утилиты (не входят в релиз)
│       ├── debug_providers.rs  #   проверка регистрации провайдеров и поиска
│       ├── debug_youtube.rs    #   проверка поиска/стрима YouTube
│       ├── debug_youtube_stream.rs # проверка Range-запросов к CDN
│       ├── debug_spotify.rs    #   проверка профиля артиста Spotify
│       └── debug_secrets.rs    #   проверка хранилища секретов
├── apps/vessel-gui/            # настольное приложение (Tauri 2)
│   ├── package.json            # React + TypeScript + Vite
│   ├── src/                    # фронтенд
│   │   ├── App.tsx             # маршрутизация экранов
│   │   ├── store.tsx           # глобальное состояние (React context)
│   │   ├── api/                # типизированные обёртки invoke() над командами
│   │   ├── i18n.ts             # строки интерфейса (ru/en)
│   │   ├── lib/                # утилиты форматирования
│   │   ├── components/         # TrackRow, BottomPlayer, Sidebar, Artwork,
│   │   │                       # PlatformIcon, WaveSection, Waveform, UserSelector…
│   │   └── pages/              # Home, Search, Wave, Artist, Playlists, Playlist,
│   │                           # Favorites, Queue, Recent, Settings
│   └── src-tauri/              # бэкенд Tauri
│       ├── tauri.conf.json     # окно 1120×720, идентификатор space.vessel.app
│       └── src/
│           ├── lib.rs          # состояние GUI, полный state, цикл событий драйвера
│           ├── commands.rs     # все #[tauri::command]: поиск, плеер, библиотека,
│           │                   # провайдеры, вход через браузер, пользователи
│           ├── webview_cookies.rs # захват cookies (sp_dc, YouTube) из WebView
│           └── main.rs         # точка входа
└── packaging/                  # упаковка релизов
```

## Архитектура

**Однонаправленный поток данных.** Фронтенд вызывает Tauri-команды (`commands.rs`), те работают с `GuiCore` — обёрткой над ядром. Ядро состоит из двух половин:

- `App` (синхронный) — владеет состоянием: очередь, библиотека, плейлисты, плеер. Получает `Action`, отдаёт `AppEffect`;
- `Runtime` (асинхронный, Tokio) — выполняет эффекты: сетевые запросы к провайдерам, воспроизведение через AudioEngine, генерацию волны. Результаты возвращаются `Action`'ами.

Фоновый поток-драйвер в `lib.rs` крутит цикл: `poll_actions` → `dispatch(effects)` → обновление `App` → сохранение в SQLite/конфиг → рассылка состояния во фронтенд событиями `state`/`progress`.

**Провайдеры.** Каждый сервис реализует трейт `MusicProvider` (поиск, коллекции, карточка артиста, все треки, импорт плейлиста, похожие, источник воспроизведения). Реестр строится из конфига и секретов; включение/выключение провайдера или сохранение ключа пересобирает реестр на лету.

**Аудио.** Источник трека (URL с заголовками) превращается в `MediaSource`: локальный файл, HTTP с Range-запросами или HLS. Symphonia декодирует MP3/AAC/FLAC/Vorbis/WAV, CPAL выводит звук. Для Spotify аудио идёт через встроенный резолвер Spotify → YouTube, когда нет premium-доступа.

**Хранение.** SQLite — библиотека, плейлисты, очередь, история (на пользователя). `config.toml` — настройки. Keyring/`secrets.json` — ключи провайдеров.

## Лицензия

Проект распространяется по лицензии [GNU GPL v3.0](LICENSE).
