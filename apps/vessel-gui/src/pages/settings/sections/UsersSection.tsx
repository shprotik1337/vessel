import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../store";
import { IconUser, IconBackground } from "../../../components/Icons";
import * as api from "../../../api/commands";

interface UsersSectionProps {
  onClose?: () => void;
}

export function UsersSection({ onClose }: UsersSectionProps) {
  const { state, showToast, lang, openAuthModal, logoutAccount } = useApp();

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileBannerUrl, setProfileBannerUrl] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state?.account_state?.kind !== "authenticated") return;
    if (profileLoaded) return;
    let mounted = true;
    setProfileLoading(true);
    api
      .authGetProfile()
      .then((p) => {
        if (!mounted) return;
        setProfileAvatarUrl(p.avatar_url || "");
        setProfileBannerUrl(p.banner_url || "");
        setProfileDisplayName(p.display_name || p.username || "");
        setProfileStatus(p.status || "");
        setProfileBio(p.bio || "");
        setProfileLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load profile:", e);
        if (!mounted) return;
        if (state.account_state?.kind === "authenticated") {
          setProfileDisplayName(state.account_state.username);
        }
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [state?.account_state, profileLoaded]);

  const handleImageFileSelect = async (
    file: File,
    maxWidth: number,
    maxHeight: number,
    setter: (val: string) => void,
  ) => {
    if (!file || !file.type.startsWith("image/")) {
      showToast(lang === "ru" ? "Пожалуйста, выберите файл изображения" : "Please select an image file", true);
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Не удалось создать контекст canvas"));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            try {
              const webp = canvas.toDataURL("image/webp", 0.85);
              if (webp.startsWith("data:image/webp")) {
                resolve(webp);
                return;
              }
            } catch {}
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          };
          img.onerror = () => reject(new Error(lang === "ru" ? "Ошибка декодирования изображения" : "Failed to decode image"));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error(lang === "ru" ? "Ошибка чтения файла" : "Failed to read file"));
        reader.readAsDataURL(file);
      });
      setter(dataUrl);
      showToast(lang === "ru" ? "Изображение успешно выбрано" : "Image selected");
    } catch (err: any) {
      showToast(err?.message || (lang === "ru" ? "Ошибка обработки изображения" : "Error processing image"), true);
    }
  };

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const updated = await api.authUpdateProfile({
        display_name: profileDisplayName.trim() || null,
        avatar_url: profileAvatarUrl.trim() || null,
        banner_url: profileBannerUrl.trim() || null,
        status: profileStatus.trim() || null,
        bio: profileBio.trim() || null,
      });
      setProfileAvatarUrl(updated.avatar_url || "");
      setProfileBannerUrl(updated.banner_url || "");
      setProfileDisplayName(updated.display_name || updated.username);
      setProfileStatus(updated.status || "");
      setProfileBio(updated.bio || "");
      showToast(lang === "ru" ? "Профиль успешно сохранён" : "Profile saved");
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Vessel аккаунт" : "Vessel Account"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Синхронизация медиатеки и управление аккаунтом Vessel"
            : "Library synchronization and Vessel account management"}
        </p>
      </div>

      {/* VESSEL PROFILE SECTION */}
      <div className="sett-section-title">
        {lang === "ru" ? "ПРОФИЛЬ VESSEL" : "VESSEL PROFILE"}
      </div>

      {state?.account_state?.kind === "restoring" && (
        <div className="sett-card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--elev)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
              }}
            >
              <IconUser size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {lang === "ru" ? "Восстановление сессии..." : "Restoring session..."}
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                Vessel
              </div>
            </div>
          </div>
        </div>
      )}

      {state?.account_state?.kind === "authenticated" && (
        <>
          {/* Profile Live Preview Card */}
          <div
            className="sett-card"
            style={{
              padding: 0,
              overflow: "hidden",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              background: "var(--card-bg, #000000)",
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
            }}
          >
            {/* Banner Area */}
            <div
              style={{
                width: "100%",
                height: "130px",
                position: "relative",
                overflow: "hidden",
                background: profileBannerUrl.trim()
                  ? "#000000"
                  : "linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(20, 20, 26, 0.98) 100%)",
              }}
            >
              {profileBannerUrl.trim() ? (
                <img
                  src={profileBannerUrl.trim()}
                  alt="Banner"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Profile Header Area */}
            <div style={{ padding: "0 22px 20px 22px", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                {/* Overlapping Round Avatar */}
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    border: "3px solid var(--card-bg, #000000)",
                    marginTop: -36,
                    position: "relative",
                    zIndex: 2,
                    background: "var(--accent)",
                    color: "var(--accent-contrast-text)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.6)",
                    flexShrink: 0,
                  }}
                >
                  {profileAvatarUrl.trim() ? (
                    <img
                      src={profileAvatarUrl.trim()}
                      alt="Avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      display: profileAvatarUrl.trim() ? "none" : "block",
                    }}
                  >
                    {(profileDisplayName || state.account_state.username || "U").slice(0, 1).toUpperCase()}
                  </span>
                </div>
              </div>

              {/* User Names & Identifiers */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>
                  {profileDisplayName || state.account_state.username}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>
                  @{state.account_state.username.replace(/^@+/, "")} • ID: {state.account_state.user_id.slice(0, 8)}
                </div>

                {/* Status if filled */}
                {profileStatus.trim() ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text2)",
                      marginTop: 8,
                      fontStyle: "italic",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>💬</span>
                    <span>{profileStatus}</span>
                  </div>
                ) : null}

                {/* Bio if filled */}
                {profileBio.trim() ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text2)",
                      lineHeight: 1.45,
                      marginTop: 10,
                      padding: "8px 12px",
                      background: "var(--elev, rgba(255, 255, 255, 0.03))",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {profileBio}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Profile Edit Form */}
          <div className="sett-section-title" style={{ marginTop: 24 }}>
            {lang === "ru" ? "НАСТРОЙКИ ПРОФИЛЯ" : "PROFILE SETTINGS"}
          </div>

          <div
            className="sett-card"
            style={{
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              borderRadius: "16px",
              border: "1px solid var(--border)",
              background: "var(--card-bg, #000000)",
            }}
          >
            {/* Аватар */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                {lang === "ru" ? "Аватар" : "Avatar"}
              </label>
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageFileSelect(f, 256, 256, setProfileAvatarUrl);
                  e.target.value = "";
                }}
              />
              <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
                {profileAvatarUrl.startsWith("data:") ? (
                  <div
                    style={{
                      width: "100%",
                      height: 38,
                      boxSizing: "border-box",
                      background: "var(--elev, rgba(255, 255, 255, 0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0 68px 0 14px",
                      fontSize: 13,
                      color: "var(--text2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{lang === "ru" ? "Локальный файл" : "Local file"}</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={profileAvatarUrl}
                    onChange={(e) => setProfileAvatarUrl(e.target.value)}
                    placeholder={lang === "ru" ? "Ссылка на аватарку или выбор файла" : "Avatar image URL or local file"}
                    style={{
                      width: "100%",
                      height: 38,
                      boxSizing: "border-box",
                      background: "var(--elev, rgba(255, 255, 255, 0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0 68px 0 14px",
                      fontSize: 13,
                      color: "var(--text)",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                )}

                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2 }}>
                  {profileAvatarUrl ? (
                    <button
                      type="button"
                      onClick={() => setProfileAvatarUrl("")}
                      title={lang === "ru" ? "Удалить аватар" : "Remove avatar"}
                      style={{
                        color: "var(--text3)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 5,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title={lang === "ru" ? "Выбрать аватар с компьютера" : "Choose avatar from computer"}
                    style={{
                      color: "var(--text)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 6,
                      borderRadius: 6,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <IconBackground size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Баннер */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                {lang === "ru" ? "Баннер" : "Banner"}
              </label>
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageFileSelect(f, 1200, 400, setProfileBannerUrl);
                  e.target.value = "";
                }}
              />
              <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
                {profileBannerUrl.startsWith("data:") ? (
                  <div
                    style={{
                      width: "100%",
                      height: 38,
                      boxSizing: "border-box",
                      background: "var(--elev, rgba(255, 255, 255, 0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0 68px 0 14px",
                      fontSize: 13,
                      color: "var(--text2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{lang === "ru" ? "Локальный файл" : "Local file"}</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={profileBannerUrl}
                    onChange={(e) => setProfileBannerUrl(e.target.value)}
                    placeholder={lang === "ru" ? "Ссылка на баннер или выбор файла" : "Banner image URL or local file"}
                    style={{
                      width: "100%",
                      height: 38,
                      boxSizing: "border-box",
                      background: "var(--elev, rgba(255, 255, 255, 0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0 68px 0 14px",
                      fontSize: 13,
                      color: "var(--text)",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                )}

                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2 }}>
                  {profileBannerUrl ? (
                    <button
                      type="button"
                      onClick={() => setProfileBannerUrl("")}
                      title={lang === "ru" ? "Удалить баннер" : "Remove banner"}
                      style={{
                        color: "var(--text3)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 5,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => bannerFileInputRef.current?.click()}
                    title={lang === "ru" ? "Выбрать баннер с компьютера" : "Choose banner from computer"}
                    style={{
                      color: "var(--text)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 6,
                      borderRadius: 6,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <IconBackground size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Никнейм */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  {lang === "ru" ? "Никнейм" : "Nickname"}
                </label>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  {profileDisplayName.length}/32
                </span>
              </div>
              <input
                type="text"
                maxLength={32}
                value={profileDisplayName}
                onChange={(e) => setProfileDisplayName(e.target.value.slice(0, 32))}
                placeholder={lang === "ru" ? "Отображаемое имя" : "Display name"}
                style={{
                  width: "100%",
                  height: 38,
                  boxSizing: "border-box",
                  background: "var(--elev, rgba(255, 255, 255, 0.04))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0 14px",
                  fontSize: 13,
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Имя пользователя (Readonly login) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  {lang === "ru" ? "Имя пользователя" : "Username"}
                </label>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  {state.account_state.username.length}/20
                </span>
              </div>
              <input
                type="text"
                value={state.account_state.username ? (state.account_state.username.startsWith("@") ? state.account_state.username : `@${state.account_state.username}`) : "@"}
                readOnly
                title={lang === "ru" ? "Имя пользователя является уникальным идентификатором аккаунта" : "Username is your unique account identifier"}
                style={{
                  width: "100%",
                  height: 38,
                  boxSizing: "border-box",
                  background: "var(--elev, rgba(255, 255, 255, 0.02))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0 14px",
                  fontSize: 13,
                  color: "var(--text3)",
                  outline: "none",
                  fontFamily: "inherit",
                  cursor: "not-allowed",
                }}
              />
            </div>

            {/* Статус */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  {lang === "ru" ? "Статус" : "Status"}
                </label>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  {profileStatus.length}/60
                </span>
              </div>
              <input
                type="text"
                maxLength={60}
                value={profileStatus}
                onChange={(e) => setProfileStatus(e.target.value.slice(0, 60))}
                placeholder={lang === "ru" ? "Короткий статус в профиле" : "Short status in profile"}
                style={{
                  width: "100%",
                  height: 38,
                  boxSizing: "border-box",
                  background: "var(--elev, rgba(255, 255, 255, 0.04))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0 14px",
                  fontSize: 13,
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* О себе */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  {lang === "ru" ? "О себе" : "About"}
                </label>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  {profileBio.length}/200
                </span>
              </div>
              <textarea
                maxLength={200}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value.slice(0, 200))}
                placeholder={lang === "ru" ? "Расскажите немного о себе или ваших музыкальных предпочтениях" : "Tell something about yourself or your music taste"}
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--elev, rgba(255, 255, 255, 0.04))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", justifyContent: "space-between" }}>
              <button
                type="button"
                disabled={profileSaving || profileLoading}
                onClick={handleSaveProfile}
                style={{
                  padding: "10px 22px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "var(--accent-contrast-text)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: (profileSaving || profileLoading) ? "not-allowed" : "pointer",
                  opacity: (profileSaving || profileLoading) ? 0.6 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {profileSaving
                  ? (lang === "ru" ? "Сохранение..." : "Saving...")
                  : profileLoading
                  ? (lang === "ru" ? "Загрузка..." : "Loading...")
                  : (lang === "ru" ? "Сохранить изменения" : "Save Changes")}
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logoutAccount();
                  onClose?.();
                  showToast(lang === "ru" ? "Вы вышли из аккаунта Vessel" : "Logged out from Vessel");
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  color: "#f87171",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {lang === "ru" ? "Выйти из аккаунта" : "Log out"}
              </button>
            </div>
          </div>
        </>
      )}

      {(!state?.account_state || state.account_state.kind === "guest") && (
        <div className="sett-card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--elev)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text2)",
                }}
              >
                <IconUser size={22} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                    {lang === "ru" ? "Гостевой режим" : "Guest Mode"}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "var(--elev)",
                      color: "var(--text3)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {lang === "ru" ? "Только локально" : "Local only"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                  {lang === "ru"
                    ? "Войдите в Vessel аккаунт для облачной синхронизации треков и плейлистов"
                    : "Log into Vessel account to sync your tracks and playlists across devices"}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-apply-preset"
              style={{
                padding: "10px 20px",
                height: "auto",
                background: "var(--accent)",
                color: "var(--accent-contrast-text)",
                fontWeight: 700,
              }}
              onClick={() => {
                onClose?.();
                openAuthModal();
              }}
            >
              {lang === "ru" ? "Войти / Регистрация" : "Sign In / Register"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
