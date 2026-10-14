import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../store";
import * as api from "../../../api/commands";

interface MigrationSectionProps {
  onClose?: () => void;
}

export function MigrationSection({ onClose }: MigrationSectionProps) {
  const { state, refresh, showToast, lang, openAuthModal } = useApp();

  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const [dataDir, setDataDir] = useState<string>("");
  const [databasePath, setDatabasePath] = useState<string>("");
  const [lastExportPath, setLastExportPath] = useState<string>("");

  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [cloudMigrating, setCloudMigrating] = useState(false);
  const [cloudDownloading, setCloudDownloading] = useState(false);

  useEffect(() => {
    api.getDataDir().then(setDataDir).catch(() => {});
    api.getDatabasePath().then(setDatabasePath).catch(() => {});
  }, []);

  const handleExportBackup = async () => {
    if (exportingBackup) return;
    setExportingBackup(true);
    try {
      let history: any[] = [];
      try {
        history = await api.getHistory();
      } catch {}
      const backupData = {
        version: 1,
        vessel_version: "1.3.17",
        exported_at: new Date().toISOString(),
        username: (state?.account_state && state.account_state.kind === "authenticated") ? state.account_state.username : "guest",
        tracks: state?.library || [],
        playlists: state?.playlists || [],
        history,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultName = `vessel-backup-${dateStr}.json`;

      let targetPath: string | null = null;
      try {
        targetPath = await api.saveFileAs(defaultName, ["json"]);
      } catch {}

      if (targetPath) {
        await api.writeTextFile(targetPath, jsonStr);
        setLastExportPath(targetPath);
        showToast(
          lang === "ru"
            ? `Файл сохранён в: ${targetPath} (${backupData.tracks.length} треков, ${backupData.playlists.length} плейлистов)`
            : `File saved to: ${targetPath} (${backupData.tracks.length} tracks, ${backupData.playlists.length} playlists)`
        );
      } else {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(
          lang === "ru"
            ? `Экспортировано ${backupData.tracks.length} треков и ${backupData.playlists.length} плейлистов`
            : `Exported ${backupData.tracks.length} tracks and ${backupData.playlists.length} playlists`
        );
      }
    } catch (e: any) {
      showToast(e?.message || (lang === "ru" ? "Ошибка экспорта" : "Export failed"), true);
    } finally {
      setExportingBackup(false);
    }
  };

  const processBackupData = async (text: string, sourceLabel: string) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") {
      throw new Error(lang === "ru" ? "Неверная структура файла" : "Invalid file structure");
    }
    const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
    let importedTracks = 0;
    if (rawTracks.length > 0) {
      importedTracks = await api.importTracksBatch(rawTracks);
    }
    const rawPlaylists = Array.isArray(data.playlists) ? data.playlists : [];
    let importedPlaylists = 0;
    for (const pl of rawPlaylists) {
      if (pl && pl.title && Array.isArray(pl.tracks)) {
        try {
          const created = await api.createPlaylist(pl.title);
          for (const t of pl.tracks) {
            await api.addToPlaylist(created.id, t).catch(() => {});
          }
          importedPlaylists++;
        } catch {}
      }
    }
    await refresh();
    showToast(
      lang === "ru"
        ? `Импортировано ${importedTracks} треков и ${importedPlaylists} плейлистов из «${sourceLabel}» в локальную медиатеку`
        : `Imported ${importedTracks} tracks and ${importedPlaylists} playlists from "${sourceLabel}" into local library`
    );
  };

  const handlePickAndImportBackup = async () => {
    if (importingBackup) return;
    try {
      const selectedPath = await api.pickFile(["json"]);
      if (!selectedPath) return;
      setImportingBackup(true);
      const text = await api.readTextFile(selectedPath);
      const fileName = selectedPath.split(/[/\\]/).pop() || selectedPath;
      await processBackupData(text, fileName);
    } catch {
      backupFileInputRef.current?.click();
    } finally {
      setImportingBackup(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    if (importingBackup) return;
    if (!file.name.endsWith(".json")) {
      showToast(lang === "ru" ? "Файл должен быть в формате .json" : "File must be in .json format", true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast(lang === "ru" ? "Файл резервной копии слишком велик (>25МБ)" : "Backup file too large (>25MB)", true);
      return;
    }
    setImportingBackup(true);
    try {
      const text = await file.text();
      await processBackupData(text, file.name);
    } catch (e: any) {
      showToast(e?.message || (lang === "ru" ? "Ошибка импорта файла" : "Import failed"), true);
    } finally {
      setImportingBackup(false);
    }
  };

  const handleCloudUpload = async () => {
    if (cloudMigrating) return;
    setCloudMigrating(true);
    try {
      await api.authMigrateData();
      await refresh();
      showToast(
        lang === "ru"
          ? "Локальные треки и плейлисты успешно выгружены в облачный аккаунт Vessel"
          : "Local library successfully uploaded to Vessel cloud"
      );
    } catch (e: any) {
      showToast(typeof e === "string" ? e : e?.message || "Ошибка облачной выгрузки", true);
    } finally {
      setCloudMigrating(false);
    }
  };

  const handleCloudDownload = async () => {
    if (cloudDownloading) return;
    setCloudDownloading(true);
    try {
      const res = await api.authDownloadCloudData();
      await refresh();
      const targetDb = databasePath.split(/[/\\]/).pop() || "library.sqlite3";
      showToast(
        lang === "ru"
          ? `Скачано из облака: ${res.tracks_count} треков и ${res.playlists_count} плейлистов в локальную базу (${targetDb})`
          : `Downloaded from cloud: ${res.tracks_count} tracks and ${res.playlists_count} playlists to local database (${targetDb})`
      );
    } catch (e: any) {
      showToast(typeof e === "string" ? e : e?.message || "Ошибка скачивания из облака", true);
    } finally {
      setCloudDownloading(false);
    }
  };

  return (
    <div>
      <input
        ref={backupFileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportBackup(f);
          e.target.value = "";
        }}
      />

      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Перенос треков и данных" : "Track Migration & Backup"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Резервное копирование в переносимый JSON-файл, синхронизация с облаком Vessel и информация о путях хранения"
            : "Backup your library to portable JSON, sync with Vessel Cloud and view storage paths"}
        </p>
      </div>

      {/* CARD 1: Local Storage Info */}
      <div className="sett-section-title">
        {lang === "ru" ? "ЛОКАЛЬНОЕ ХРАНИЛИЩЕ И БАЗА ДАННЫХ" : "LOCAL STORAGE & DATABASE"}
      </div>

      <div
        className="sett-card"
        style={{
          padding: "20px 24px",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          background: "var(--card-bg, #000000)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {lang === "ru" ? "Файл базы данных SQLite" : "SQLite Database File"}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--elev, rgba(255, 255, 255, 0.03))",
                border: "1px solid var(--border)",
                fontFamily: "monospace",
                fontSize: 12.5,
                color: "var(--text)",
                wordBreak: "break-all",
                userSelect: "all",
              }}
            >
              {databasePath || (lang === "ru" ? "Определение пути..." : "Resolving path...")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {lang === "ru" ? "Каталог данных Vessel" : "Vessel Data Directory"}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--elev, rgba(255, 255, 255, 0.03))",
                border: "1px solid var(--border)",
                fontFamily: "monospace",
                fontSize: 12.5,
                color: "var(--text)",
                wordBreak: "break-all",
                userSelect: "all",
              }}
            >
              {dataDir || (lang === "ru" ? "Определение каталога..." : "Resolving directory...")}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => {
              if (dataDir) {
                void api.openPath(dataDir);
              }
            }}
            style={{
              padding: "9px 18px",
              borderRadius: 9,
              background: "var(--elev2, rgba(255, 255, 255, 0.08))",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {lang === "ru" ? "Открыть папку с данными" : "Open Data Folder"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (databasePath) {
                const dir = databasePath.replace(/[/\\][^/\\]+$/, "");
                if (dir) void api.openPath(dir);
              }
            }}
            style={{
              padding: "9px 18px",
              borderRadius: 9,
              background: "var(--elev2, rgba(255, 255, 255, 0.08))",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {lang === "ru" ? "Показать файл базы данных" : "Show DB File"}
          </button>
        </div>
      </div>

      {/* CARD 2: JSON Backup */}
      <div className="sett-section-title" style={{ marginTop: 24 }}>
        {lang === "ru" ? "РЕЗЕРВНОЕ КОПИРОВАНИЕ (JSON)" : "BACKUP (JSON)"}
      </div>

      <div
        className="sett-card"
        style={{
          padding: "20px 24px",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          background: "var(--card-bg, #000000)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            {lang === "ru" ? "Экспорт и импорт медиатеки" : "Export & Import Library"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            {lang === "ru"
              ? "Сохраните всю медиатеку, плейлисты и историю прослушиваний в локальный JSON-файл для переноса на другой ПК"
              : "Save your full library, playlists and play history to a local JSON file to transfer between devices"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            disabled={exportingBackup}
            onClick={handleExportBackup}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--accent-contrast-text)",
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: exportingBackup ? "not-allowed" : "pointer",
              opacity: exportingBackup ? 0.6 : 1,
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>
              {exportingBackup
                ? (lang === "ru" ? "Экспорт..." : "Exporting...")
                : (lang === "ru" ? "Экспортировать медиатеку в JSON" : "Export Library to JSON")}
            </span>
          </button>

          <button
            type="button"
            disabled={importingBackup}
            onClick={handlePickAndImportBackup}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: "var(--elev2, rgba(255, 255, 255, 0.08))",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: importingBackup ? "not-allowed" : "pointer",
              opacity: importingBackup ? 0.6 : 1,
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>
              {importingBackup
                ? (lang === "ru" ? "Импорт из файла..." : "Importing...")
                : (lang === "ru" ? "Импортировать из файла" : "Import from File")}
            </span>
          </button>
        </div>

        {lastExportPath ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--elev, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", fontWeight: 700 }}>
                {lang === "ru" ? "Последний сохранённый файл:" : "Last exported file:"}
              </div>
              <div style={{ fontSize: 12.5, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all", marginTop: 2 }}>
                {lastExportPath}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const dir = lastExportPath.replace(/[/\\][^/\\]+$/, "");
                if (dir) void api.openPath(dir);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {lang === "ru" ? "Открыть папку с файлом" : "Open Folder"}
            </button>
          </div>
        ) : null}
      </div>

      {/* CARD 3: Cloud Sync */}
      <div className="sett-section-title" style={{ marginTop: 24 }}>
        {lang === "ru" ? "ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ VESSEL" : "VESSEL CLOUD SYNC"}
      </div>

      <div
        className="sett-card"
        style={{
          padding: "20px 24px",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          background: "var(--card-bg, #000000)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              {lang === "ru" ? "Облачный аккаунт Vessel" : "Vessel Cloud Account"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {state?.account_state?.kind === "authenticated"
                ? (lang === "ru"
                    ? `Подключено как @${state.account_state.username.replace(/^@+/, "")}`
                    : `Connected as @${state.account_state.username.replace(/^@+/, "")}`)
                : (lang === "ru"
                    ? "Войдите в аккаунт Vessel для автоматической синхронизации треков между всеми вашими ПК"
                    : "Log into Vessel account to sync tracks across all your devices")}
            </div>
          </div>
        </div>

        {state?.account_state?.kind === "authenticated" ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="button"
              disabled={cloudMigrating}
              onClick={handleCloudUpload}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "var(--accent-contrast-text)",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: cloudMigrating ? "not-allowed" : "pointer",
                opacity: cloudMigrating ? 0.6 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {cloudMigrating
                ? (lang === "ru" ? "Выгрузка в облако..." : "Uploading...")
                : (lang === "ru" ? "Выгрузить медиатеку в облако" : "Upload Library to Cloud")}
            </button>

            <button
              type="button"
              disabled={cloudDownloading}
              onClick={handleCloudDownload}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: cloudDownloading ? "not-allowed" : "pointer",
                opacity: cloudDownloading ? 0.6 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {cloudDownloading
                ? (lang === "ru" ? "Скачивание..." : "Downloading...")
                : (lang === "ru" ? "Скачать треки из облака в SQLite" : "Download Tracks from Cloud")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                onClose?.();
                openAuthModal();
              }}
              style={{
                padding: "9px 20px",
                borderRadius: 9,
                background: "var(--accent)",
                color: "var(--accent-contrast-text)",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {lang === "ru" ? "Войти / Регистрация в облаке" : "Sign In / Register"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
