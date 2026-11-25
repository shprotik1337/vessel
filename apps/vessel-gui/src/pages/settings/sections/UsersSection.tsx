import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../store";
import { IconUser, IconBackground } from "../../../components/Icons";
import * as api from "../../../api/commands";

interface UsersSectionProps {
  onClose?: () => void;
  onProfileLoadedOrSaved?: (profile: {
    displayName: string;
    username: string;
    avatarUrl: string;
  }) => void;
}

export function UsersSection({ onClose, onProfileLoadedOrSaved }: UsersSectionProps) {
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
        const dn = p.display_name || p.username || "";
        const av = p.avatar_url || "";
        setProfileAvatarUrl(av);
        setProfileBannerUrl(p.banner_url || "");
        setProfileDisplayName(dn);
        setProfileStatus(p.status || "");
        setProfileBio(p.bio || "");
        setProfileLoaded(true);
        onProfileLoadedOrSaved?.({
          displayName: dn,
          username: p.username,
          avatarUrl: av,
        });
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
  }, [state?.account_state, profileLoaded, onProfileLoadedOrSaved]);

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
              reject(new Error("Canvas error"));
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
      showToast(lang === "ru" ? "Изображение выбрано" : "Image selected");
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
      const dn = updated.display_name || updated.username;
      const av = updated.avatar_url || "";
      setProfileAvatarUrl(av);
      setProfileBannerUrl(updated.banner_url || "");
      setProfileDisplayName(dn);
      setProfileStatus(updated.status || "");
      setProfileBio(updated.bio || "");
      onProfileLoadedOrSaved?.({
        displayName: dn,
        username: updated.username,
        avatarUrl: av,
      });
      showToast(lang === "ru" ? "Профиль сохранён" : "Profile saved");
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
          {lang === "ru" ? "Профиль аккаунта" : "Account Profile"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Настройка баннера, аватарки, отображаемого имени и информации о себе."
            : "Customize your banner, avatar, display name and bio."}
        </p>
      </div>

      {state?.account_state?.kind === "restoring" && (
        <div className="sett-group-card">
          <div className="sett-row">
            <div className="sett-integration-banner-left">
              <div className="sett-integration-icon-box">
                <IconUser size={20} />
              </div>
              <div className="sett-row-info">
                <div className="sett-row-title">
                  {lang === "ru" ? "Восстановление сессии..." : "Restoring session..."}
                </div>
                <div className="sett-row-desc">Vessel Account</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {state?.account_state?.kind === "authenticated" && (
        <>
          {/* Profile Preview Card */}
          <div className="sett-profile-preview-card">
            <div className="sett-profile-banner-box">
              {profileBannerUrl.trim() && (
                <img
                  src={profileBannerUrl.trim()}
                  alt="Banner"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="sett-profile-banner-overlay" />
            </div>

            <div className="sett-profile-preview-body">
              <div className="sett-profile-preview-avatar">
                {profileAvatarUrl.trim() ? (
                  <img
                    src={profileAvatarUrl.trim()}
                    alt="Avatar"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span>{(profileDisplayName || state.account_state.username || "U").slice(0, 1).toUpperCase()}</span>
                )}
              </div>

              <div className="sett-profile-preview-names">
                <div className="sett-profile-preview-display">
                  {profileDisplayName || state.account_state.username}
                </div>
                <div className="sett-profile-preview-handle">
                  @{state.account_state.username.replace(/^@+/, "")} · ID {state.account_state.user_id.slice(0, 8)}
                </div>
                {profileStatus.trim() && (
                  <div className="sett-profile-preview-status">
                    {profileStatus}
                  </div>
                )}
                {profileBio.trim() && (
                  <div className="sett-profile-preview-bio">
                    {profileBio}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <div className="sett-section-label">
            {lang === "ru" ? "Данные профиля" : "Profile Details"}
          </div>
          <div className="sett-group-card">
            {/* Avatar */}
            <div className="sett-row-col">
              <div className="sett-row-info" style={{ marginBottom: 8 }}>
                <div className="sett-row-title">{lang === "ru" ? "Аватар" : "Avatar"}</div>
              </div>
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
              <div className="sett-input-with-actions">
                {profileAvatarUrl.startsWith("data:") ? (
                  <div className="sett-input sett-input-readonly-tag">
                    {lang === "ru" ? "Выбран локальный файл" : "Local image selected"}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="sett-input"
                    value={profileAvatarUrl}
                    onChange={(e) => setProfileAvatarUrl(e.target.value)}
                    placeholder={lang === "ru" ? "Ссылка на аватарку или выбор файла" : "Avatar URL or local file"}
                  />
                )}
                <div className="sett-input-actions">
                  {profileAvatarUrl && (
                    <button
                      type="button"
                      className="sett-icon-btn"
                      onClick={() => setProfileAvatarUrl("")}
                      title={lang === "ru" ? "Удалить" : "Remove"}
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    className="sett-icon-btn"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title={lang === "ru" ? "Выбрать с компьютера" : "Choose file"}
                  >
                    <IconBackground size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Banner */}
            <div className="sett-row-col">
              <div className="sett-row-info" style={{ marginBottom: 8 }}>
                <div className="sett-row-title">{lang === "ru" ? "Баннер" : "Banner"}</div>
              </div>
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
              <div className="sett-input-with-actions">
                {profileBannerUrl.startsWith("data:") ? (
                  <div className="sett-input sett-input-readonly-tag">
                    {lang === "ru" ? "Выбран локальный файл" : "Local image selected"}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="sett-input"
                    value={profileBannerUrl}
                    onChange={(e) => setProfileBannerUrl(e.target.value)}
                    placeholder={lang === "ru" ? "Ссылка на баннер или выбор файла" : "Banner URL or local file"}
                  />
                )}
                <div className="sett-input-actions">
                  {profileBannerUrl && (
                    <button
                      type="button"
                      className="sett-icon-btn"
                      onClick={() => setProfileBannerUrl("")}
                      title={lang === "ru" ? "Удалить" : "Remove"}
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    className="sett-icon-btn"
                    onClick={() => bannerFileInputRef.current?.click()}
                    title={lang === "ru" ? "Выбрать с компьютера" : "Choose file"}
                  >
                    <IconBackground size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div className="sett-row-col">
              <div className="sett-field-head">
                <label className="sett-row-title">{lang === "ru" ? "Никнейм" : "Display Name"}</label>
                <span className="sett-field-counter">{profileDisplayName.length}/32</span>
              </div>
              <input
                type="text"
                maxLength={32}
                className="sett-input"
                value={profileDisplayName}
                onChange={(e) => setProfileDisplayName(e.target.value.slice(0, 32))}
                placeholder={lang === "ru" ? "Отображаемое имя" : "Display name"}
              />
            </div>

            {/* Username */}
            <div className="sett-row-col">
              <div className="sett-field-head">
                <label className="sett-row-title">{lang === "ru" ? "Имя пользователя" : "Username"}</label>
                <span className="sett-field-counter">{state.account_state.username.length}/20</span>
              </div>
              <input
                type="text"
                readOnly
                className="sett-input sett-input-disabled"
                value={
                  state.account_state.username.startsWith("@")
                    ? state.account_state.username
                    : `@${state.account_state.username}`
                }
              />
            </div>

            {/* Status */}
            <div className="sett-row-col">
              <div className="sett-field-head">
                <label className="sett-row-title">{lang === "ru" ? "Статус" : "Status"}</label>
                <span className="sett-field-counter">{profileStatus.length}/60</span>
              </div>
              <input
                type="text"
                maxLength={60}
                className="sett-input"
                value={profileStatus}
                onChange={(e) => setProfileStatus(e.target.value.slice(0, 60))}
                placeholder={lang === "ru" ? "Короткий статус в профиле" : "Short status in profile"}
              />
            </div>

            {/* Bio */}
            <div className="sett-row-col">
              <div className="sett-field-head">
                <label className="sett-row-title">{lang === "ru" ? "О себе" : "About"}</label>
                <span className="sett-field-counter">{profileBio.length}/200</span>
              </div>
              <textarea
                maxLength={200}
                rows={3}
                className="sett-textarea"
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value.slice(0, 200))}
                placeholder={
                  lang === "ru"
                    ? "Расскажите немного о себе или музыкальных предпочтениях"
                    : "Tell a bit about yourself or your music taste"
                }
              />
            </div>

            {/* Actions */}
            <div className="sett-row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="sett-btn-danger"
                onClick={async () => {
                  await logoutAccount();
                  onClose?.();
                  showToast(lang === "ru" ? "Вы вышли из аккаунта Vessel" : "Logged out from Vessel");
                }}
              >
                {lang === "ru" ? "Выйти из аккаунта" : "Log out"}
              </button>

              <button
                type="button"
                className="sett-btn-primary"
                disabled={profileSaving || profileLoading}
                onClick={() => void handleSaveProfile()}
              >
                {profileSaving
                  ? (lang === "ru" ? "Сохранение..." : "Saving...")
                  : profileLoading
                  ? (lang === "ru" ? "Загрузка..." : "Loading...")
                  : (lang === "ru" ? "Сохранить изменения" : "Save Changes")}
              </button>
            </div>
          </div>
        </>
      )}

      {(!state?.account_state || state.account_state.kind === "guest") && (
        <div className="sett-integration-banner">
          <div className="sett-integration-banner-left">
            <div className="sett-integration-icon-box">
              <IconUser size={22} />
            </div>
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Гостевой режим" : "Guest Mode"}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Войдите в аккаунт Vessel для синхронизации библиотеки, плейлистов и профиля."
                  : "Sign in to Vessel to sync your library, playlists and profile."}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="sett-btn-primary"
            onClick={() => {
              onClose?.();
              openAuthModal();
            }}
          >
            {lang === "ru" ? "Войти" : "Sign In"}
          </button>
        </div>
      )}
    </div>
  );
}
