# Vessel

<p align="center">
  <a href="https://github.com/shprotik1337/vessel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/shprotik1337/vessel/ci.yml?branch=beta&amp;style=for-the-badge&amp;logo=githubactions&amp;logoColor=white&amp;label=CI" alt="CI"></a>
  <a href="#системные-требования"><img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&amp;logo=windows95&amp;logoColor=white" alt="Windows"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-2EA44F?style=for-the-badge" alt="License: GPL-3.0-only"></a>
</p>

<p align="center">
  <a href="apps/vessel-gui/src-tauri"><img src="https://img.shields.io/badge/Desktop-Tauri%202%20%2B%20WebView2-24C8DB?style=for-the-badge&amp;logo=tauri&amp;logoColor=white" alt="Tauri 2"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Rust%20Core-2021-000000?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="Rust 2021"></a>
  <a href="apps/vessel-gui/src"><img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-3178C6?style=for-the-badge&amp;logo=react&amp;logoColor=white" alt="React + TypeScript"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Audio-CPAL%20%2B%20Symphonia-8A63D2?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="CPAL and Symphonia"></a>
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Storage-SQLite-07405E?style=for-the-badge&amp;logo=sqlite&amp;logoColor=white" alt="SQLite"></a>
</p>

**Vessel** — настольный музыкальный клиент с единым поиском по SoundCloud, Yandex Music, Deezer, Spotify и YouTube Music. Одна очередь, общая библиотека и «Моя волна» поверх всех подключённых площадок.

[Возможности](#возможности) · [Провайдеры](#провайдеры) · [Сборка](#сборка-из-исходников) · [Структура проекта](#структура-проекта) · [Архитектура](#архитектура) · [Лицензия](#лицензия)

## Возможности

- **Единый поиск** по всем настроенным сервисам сразу или по выбранной площадке: треки, плейлисты, альбомы, артисты;
- **полноценный плеер**: воспроизведение, пауза, перемотка, громкость, shuffle, три режима repeat, буферизация с прогрессом;
- **полноэкранный плеер и синхронизированный текст песен (караоке)**: динамический эмбиент-фон по обложке альбома, точный автоскролл активной строки по центру, перемотка трека по нажатию на любую строчку текста (на базе LRCLIB API);
- **чистый потоковый стриминг**: аудио воспроизводится напрямую в память через chunked/range буфер без замусоривания диска и устаревания кэша;
- **«Моя волна»** — персональные рекомендации на основе истории, любимых треков и подборок провайдеров, с выбором площадок-источников;
- **карточки артистов**: аватар, популярные треки, дискография сеткой, вся музыка — единый вид для всех сервисов;
- **импорт плейлистов и альбомов** по ссылкам SoundCloud, Yandex Music, Deezer, Spotify и YouTube Music;
- **импорт лайков** из SoundCloud, Deezer и Spotify — в «Избранное» или отдельным плейлистом;
- **локальная библиотека** с сортировкой и drag-and-drop, плейлисты с обложками, история прослушивания;
- **несколько профилей** с раздельными библиотеками, экспорт/импорт/бэкап пользователя;
- **вход через браузер** для Spotify, SoundCloud и Deezer: встроенное окно, приложение само перехватывает нужный ключ — cookie `sp_dc`, `client_id` из запросов страницы или cookie `arl` — и закрывает окно (OAuth не используется); ключи остаются только на устройстве;
- **двухязычный интерфейс** (русский и английский) с мгновенным переключением;
- **Vessel Server** (Настройки → Сервер): выполнение провайдеров и получение аудио на своей машине/сервере — гео-выход для YouTube, стабильная сеть, без локального запуска треков.

## Провайдеры

Vessel подключает только включённые и настроенные сервисы — если площадка недоступна или не настроена, остальные продолжают работать независимо. Провайдер можно включить/выключить в один клик, реестр пересобирается без перезапуска приложения.

| Сервис | Как подключить | Что даёт |
| --- | --- | --- |
| SoundCloud | кнопка «Войти через браузер» или `client_id` вручную | поиск, треки, плейлисты, похожие треки |
| Yandex Music | OAuth-токен из расширения [yandex-music-token](https://github.com/DoorChop/yandex-music-oauth-token) | поиск, треки, плейлисты, персональная волна |
| Deezer | вход через браузер или cookie `arl` | поиск, треки, плейлисты, похожие треки |
| Spotify | cookie `sp_dc` или вход через браузер (OAuth не используется) | поиск, треки, плейлисты, альбомы, карточки артистов |
| YouTube Music | ничего не нужно — работает сразу | поиск, треки, плейлисты, альбомы, артисты, похожие треки |

### Где взять ключи

- **SoundCloud** — кнопка «Войти через браузер» (Vessel сам перехватит `client_id` из запросов страницы), либо `client_id` из любого веб-запроса soundcloud.com к API;
- **Yandex Music** — токен из браузерного расширения yandex-music-token;
- **Deezer** — кнопка «Войти через браузер» (Vessel сам заберёт cookie `arl`), либо значение cookie `arl` из браузера с залогиненным аккаунтом;
- **Spotify** — cookie `sp_dc` из браузера, либо кнопка «Войти через браузер» в Настройках (приложение само перехватит cookie; OAuth не используется);
- **YouTube Music** — работает сразу после включения, без входа и ключей.

Все ключи хранятся локально: сначала в системном хранилище учётных данных (Windows Credential Manager / Secret Service), при его недоступности — в файле `secrets.json` рядом с данными приложения.

> Vessel не является официальным клиентом перечисленных сервисов. Для работы провайдеров нужен действующий доступ к соответствующим площадкам.

## Установка

Скачай установщик `Vessel_1.3.8_x64-setup.exe` из [Releases](https://github.com/shprotik1337/vessel/releases/latest) и запусти — NSIS-инсталлятор (~14 МБ) сделает всё сам. Инсталлятор включает всё нужное: поиск, плеер, импорт плейлистов и лайков.

## Системные требования

- Windows 10/11 x64 с WebView2 Runtime (предустановлен в актуальных Windows 10/11);
- Rust (stable, edition 2021) и Node.js ≥ 18 — только для сборки из исходников.

## Сборка из исходников

```bash
git clone https://github.com/shprotik1337/vessel.git
cd vessel/apps/vessel-gui
npm install
npm run tauri build
```

Готовый installer появится в `target/release/bundle/nsis/Vessel_1.3.8_x64-setup.exe`.

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
│   │   ├── spotify.rs          #   Spotify: Pathfinder GraphQL + Web API (метаданные)
│   │   ├── youtube/            #   YouTube Music: Innertube (поиск, плеер, резолвер)
│   │   └── download.rs         #   скачивание треков
│   ├── runtime/                # асинхронный рантайм
│   │   ├── providers.rs        #   сборка реестра провайдеров из конфига+секретов
│   │   ├── playback.rs         #   задачи воспроизведения
│   │   ├── search.rs           #   параллельный поиск по провайдерам
│   │   ├── wave.rs             #   генерация «Моей волны»
│   │   ├── importer.rs         #   импорт плейлистов
│   │   └── onboarding.rs       #   проверка SoundCloud, Zapret
│   ├── wave/                   # движок рекомендаций «Моя волна»
│   │   ├── generator.rs        #   сборка волны из истории/лайков/кандидатов
│   │   ├── selector.rs        #   выбор треков, квоты по провайдерам
│   │   ├── score.rs            #   скоринг кандидатов
│   │   ├── pool.rs             #   пул кандидатов
│   │   └── …                   #   жанры, семена, профили, текстовый анализ
│   └── onboarding/             # первичная настройка: проверка SoundCloud, Zapret
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
│           ├── webview_cookies.rs # захват cookie sp_dc из окна входа Spotify
│           └── main.rs         # точка входа
```

## Vessel Server

Vessel умеет гибридный режим: каждый провайдер исполняется **локально или на
своем Vessel Server** — тем же кодом провайдеров, только на другой машине
(например, на VPS). Выбор места выполнения — в **Настройки → Сервер** для
каждого провайдера отдельно: «Этот компьютер» (local) или конкретный сервер.

Зачем сервер: гео-выход (googlevideo/POT живут на IP сервера, и клиент
получает аудио транзитом), стабильная сеть дата-центра, тяжёлая работа
(поиск, резолв аудио, расшифровка Deezer) выполняется не на клиенте.

Сервер — **не CDN и не музыкальная база**: постоянного кэша на нём нет,
временные расшифровки не сохраняются. Приложение полностью работает и без
сервера — всё исполняется локально.

```bash
# сборка бинарника (Linux):
cargo build --release -p vessel-server
# на сервере:
cp deploy/vessel-server.example.toml /opt/vessel/server.toml   # вписать токен
/opt/vessel/bin/vessel-server /opt/vessel/server.toml
# systemd unit:            deploy/vessel-server.service
```

В клиенте: **Настройки → Сервер** — добавить экземпляр (имя, адрес, токен →
мгновенное рукопожатие `/api/v1/capabilities`) и выбрать для каждого
провайдера «Этот компьютер» или конкретный сервер. Адреса и маршруты — в
`config.toml`; токен доступа к экземпляру — в защищённом хранилище ОС
(`vessel-server:<id>`), провайдерские ключи на клиент не уезжают.

API `/api/v1`: `capabilities`, per-provider `search`/`collections`/
`artists/{id}[/tracks]`/`wave`/`liked`, `playlists/import`,
`playback/resolve` и транзитный `s/{token}` (Range-capable).
Без TLS — ставь caddy/nginx перед токеном; при гео-блокировках DNS на клиенте
relay включается автоматически для googlevideo-доменов.

## Архитектура

**Однонаправленный поток данных.** Фронтенд вызывает Tauri-команды (`commands.rs`), те работают с `GuiCore` — обёрткой над ядром. Ядро состоит из двух половин:

- `App` (синхронный) — владеет состоянием: очередь, библиотека, плейлисты, плеер. Получает `Action`, отдаёт `AppEffect`;
- `Runtime` (асинхронный, Tokio) — выполняет эффекты: сетевые запросы к провайдерам, воспроизведение через AudioEngine, генерацию волны. Результаты возвращаются `Action`'ами.

Фоновый поток-драйвер в `lib.rs` крутит цикл: `poll_actions` → `dispatch(effects)` → обновление `App` → сохранение в SQLite/конфиг → рассылка состояния во фронтенд событиями `state`/`progress`.

**Провайдеры.** Каждый сервис реализует трейт `MusicProvider` (поиск, коллекции, карточка артиста, все треки, импорт плейлиста, похожие, источник воспроизведения). Реестр строится из конфига и секретов; включение/выключение провайдера или сохранение ключа пересобирает реестр на лету.

**Аудио.** Источник трека (URL с заголовками) превращается в `MediaSource`: локальный файл, HTTP с Range-запросами или HLS. Symphonia декодирует MP3/AAC/FLAC/Vorbis/WAV, CPAL выводит звук. Для Spotify источник аудио настраивается: «Автоматически» (цепочка YouTube Music → Deezer), YouTube Music или Deezer; если первый источник недоступен, автоматически пробуется следующий.

**Хранение.** SQLite — библиотека, плейлисты, очередь, история (на пользователя). `config.toml` — настройки. Keyring/`secrets.json` — ключи провайдеров.

## Лицензия

Проект распространяется по лицензии [GNU GPL v3.0](LICENSE).
