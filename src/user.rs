use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::storage::Storage;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

pub const FORMAT_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub display_name: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub format_version: u32,
}

impl UserProfile {
    pub fn new(display_name: impl Into<String>) -> Self {
        let now = now_ms();
        Self {
            id: Uuid::new_v4(),
            display_name: display_name.into(),
            created_at_ms: now,
            updated_at_ms: now,
            format_version: FORMAT_VERSION,
        }
    }

    pub fn touch(&mut self) {
        self.updated_at_ms = now_ms();
    }
}

// ---------------------------------------------------------------------------
// User — a single user directory with profile + storage
// ---------------------------------------------------------------------------

pub struct User {
    pub dir: PathBuf,
    pub profile: UserProfile,
    pub storage: Storage,
}

impl User {
    pub fn open(dir: PathBuf, profile: UserProfile, history_limit: usize) -> Result<Self> {
        let db_path = dir.join("library.sqlite3");
        let mut storage = Storage::new(db_path);
        storage.initialize()?;
        storage.set_history_limit(history_limit);
        Ok(Self {
            dir,
            profile,
            storage,
        })
    }

    pub fn save_profile(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.profile)
            .context("Не удалось сериализовать профиль")?;
        let path = self.profile_path();
        fs::write(&path, &json)
            .with_context(|| format!("Не удалось сохранить {}", path.display()))
    }

    pub fn backup(&self) -> Result<PathBuf> {
        let backups_dir = self.dir.join("backups");
        fs::create_dir_all(&backups_dir)
            .with_context(|| format!("Не удалось создать {}", backups_dir.display()))?;
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = backups_dir.join(format!("library_{timestamp}.sqlite3"));
        self.storage
            .vacuum_into(&backup_path)
            .with_context(|| format!("Не удалось создать backup {}", backup_path.display()))?;
        Ok(backup_path)
    }

    pub fn profile_path(&self) -> PathBuf {
        self.dir.join("profile.json")
    }

    pub fn data_dir(&self) -> PathBuf {
        self.dir.join("data")
    }
}

// ---------------------------------------------------------------------------
// UserManager — discovers, creates and manages users
// ---------------------------------------------------------------------------

pub struct UserManager {
    users_dir: PathBuf,
    active_user: User,
    history_limit: usize,
}

impl UserManager {
    /// Инициализирует Users/ и создаёт/открывает пользователя.
    /// Если `migrate_from` передан и старой БД не было — копирует её в нового пользователя.
    pub fn open(
        users_dir: PathBuf,
        history_limit: usize,
        migrate_from: Option<PathBuf>,
    ) -> Result<Self> {
        fs::create_dir_all(&users_dir)
            .with_context(|| format!("Не удалось создать {}", users_dir.display()))?;

        let known = Self::discover(&users_dir)?;
        if let Some(user_dir) = known.first() {
            let profile = Self::load_profile(user_dir)?;
            let user = User::open(user_dir.clone(), profile, history_limit)?;
            return Ok(Self {
                users_dir,
                active_user: user,
                history_limit,
            });
        }

        let dir = users_dir.join("default");
        fs::create_dir_all(&dir)?;
        let profile = UserProfile::new("Default");
        // Если есть старая БД на миграцию — кладём её в нового пользователя до инициализации
        if let Some(old_db) = migrate_from {
            if old_db.exists() {
                fs::copy(&old_db, dir.join("library.sqlite3"))
                    .context("Не удалось скопировать существующую БД")?;
            }
        }
        let user = User::open(dir.clone(), profile, history_limit)?;
        user.save_profile()?;
        Ok(Self {
            users_dir,
            active_user: user,
            history_limit,
        })
    }

    pub fn discover(users_dir: &Path) -> Result<Vec<PathBuf>> {
        let mut dirs = Vec::new();
        let entries = fs::read_dir(users_dir)
            .with_context(|| format!("Не удалось прочитать {}", users_dir.display()))?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() && path.join("profile.json").exists() {
                dirs.push(path);
            }
        }
        dirs.sort_by_key(|p| {
            fs::metadata(p.join("profile.json"))
                .and_then(|m| m.modified())
                .ok()
        });
        Ok(dirs)
    }

    pub fn load_profile(user_dir: &Path) -> Result<UserProfile> {
        let path = user_dir.join("profile.json");
        let source =
            fs::read_to_string(&path).with_context(|| format!("Не удалось прочитать {}", path.display()))?;
        let profile: UserProfile =
            serde_json::from_str(&source).context("Не удалось разобрать profile.json")?;
        Ok(profile)
    }

    pub fn create_user(&mut self, name: &str) -> Result<&User> {
        let name = name.trim();
        if name.is_empty() {
            anyhow::bail!("Имя пользователя не может быть пустым");
        }
        let dir = self.users_dir.join(safe_folder_name(name));
        if dir.exists() {
            anyhow::bail!("Пользователь «{name}» уже существует");
        }
        fs::create_dir_all(&dir)?;
        let profile = UserProfile::new(name);
        let user = User::open(dir, profile, self.history_limit)?;
        user.save_profile()?;
        self.active_user = user;
        Ok(&self.active_user)
    }

    pub fn switch_user(&mut self, name: &str) -> Result<&User> {
        let name = name.trim();
        let dir = self.resolve_user_dir(name)?;
        let profile = Self::load_profile(&dir)?;
        self.active_user = User::open(dir, profile, self.history_limit)?;
        Ok(&self.active_user)
    }

    /// Есть ли пользователь с таким именем (по display_name или имени папки).
    pub fn user_exists(&self, name: &str) -> bool {
        self.resolve_user_dir(name.trim()).is_ok()
    }

    /// Количество локальных пользователей.
    pub fn count(&self) -> usize {
        self.known_users().map(|users| users.len()).unwrap_or(0)
    }

    /// Удаляет пользователя по имени (display_name или имени папки).
    /// Нельзя удалить активного пользователя.
    pub fn delete_user(&mut self, name: &str) -> Result<()> {
        let name = name.trim();
        let dir = self.resolve_user_dir(name)?;
        if self.active_user.profile.display_name.eq_ignore_ascii_case(name)
            || self.active_user.dir == dir
        {
            anyhow::bail!("Нельзя удалить активного пользователя");
        }
        if dir.join("profile.json").exists() {
            fs::remove_dir_all(&dir)
                .with_context(|| format!("Не удалось удалить {}", dir.display()))?;
        }
        Ok(())
    }

    /// Находит папку пользователя по имени (display_name) или по имени папки.
    fn resolve_user_dir(&self, name: &str) -> Result<PathBuf> {
        // 1. папка по имени пользователя напрямую (например "default")
        let direct = self.users_dir.join(name);
        if direct.join("profile.json").exists() {
            return Ok(direct);
        }
        // 2. папка по safe-имени (например display_name "Default User" > "Default_User")
        let safe = self.users_dir.join(safe_folder_name(name));
        if safe.join("profile.json").exists() {
            return Ok(safe);
        }
        // 3. папка, чей profile.display_name совпадает с именем
        for dir in Self::discover(&self.users_dir)? {
            if let Ok(profile) = Self::load_profile(&dir) {
                if profile.display_name.eq_ignore_ascii_case(name) {
                    return Ok(dir);
                }
            }
        }
        anyhow::bail!("Пользователь «{name}» не найден")
    }

    pub fn active_user(&self) -> &User {
        &self.active_user
    }

    pub fn active_user_mut(&mut self) -> &mut User {
        &mut self.active_user
    }

    pub fn users_dir(&self) -> &Path {
        &self.users_dir
    }

    pub fn known_users(&self) -> Result<Vec<UserProfile>> {
        let dirs = Self::discover(&self.users_dir)?;
        let mut profiles = Vec::new();
        for dir in dirs {
            match Self::load_profile(&dir) {
                Ok(p) => profiles.push(p),
                Err(e) => crate::dlog!("[vessel] повреждённый профиль в {:?}: {e}", dir),
            }
        }
        Ok(profiles)
    }

    pub fn storage(&self) -> &Storage {
        &self.active_user.storage
    }

    pub fn storage_mut(&mut self) -> &mut Storage {
        &mut self.active_user.storage
    }

    pub fn prune_history(&self, limit: usize) -> Result<usize> {
        self.active_user.storage.prune_history(limit)
    }

    /// Экспорт пользователя: копирует папку в destination.
    pub fn export_user(&self, destination: &Path) -> Result<PathBuf> {
        let dest = destination.join(safe_folder_name(&self.active_user.profile.display_name));
        if dest.exists() {
            anyhow::bail!("{} уже существует, экспорт отменён", dest.display());
        }
        copy_dir(&self.active_user.dir, &dest)?;
        Ok(dest)
    }

    /// Импорт пользователя: копирует папку из source в users_dir.
    pub fn import_user(&mut self, source: &Path) -> Result<&User> {
        if !source.join("profile.json").exists() {
            anyhow::bail!("Нет profile.json — не пользовательская папка");
        }
        let profile = Self::load_profile(source)?;
        let dest = self.users_dir.join(safe_folder_name(&profile.display_name));
        if dest.exists() {
            anyhow::bail!(
                "Пользователь «{}» уже существует, импорт отменён",
                profile.display_name
            );
        }
        copy_dir(source, &dest)?;
        let profile = Self::load_profile(&dest)?;
        self.active_user = User::open(dest, profile, self.history_limit)?;
        Ok(&self.active_user)
    }
}

fn safe_folder_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => ch,
        })
        .collect();
    let sanitized = sanitized.trim().trim_matches('.').to_string();
    if sanitized.is_empty() {
        "user".to_string()
    } else {
        sanitized
    }
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let name = entry.file_name();
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if ty.is_dir() {
            copy_dir(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn users_dir(temp: &tempfile::TempDir) -> PathBuf {
        temp.path().join("data").join("Users")
    }

    #[test]
    fn default_user_is_created_automatically() {
        let temp = tempfile::tempdir().unwrap();
        let manager = UserManager::open(users_dir(&temp), 1000, None).unwrap();
        let user = manager.active_user();
        assert!(user.profile_path().exists());
        assert_eq!(user.profile.display_name, "Default");
        assert_eq!(user.profile.format_version, FORMAT_VERSION);
    }

    #[test]
    fn existing_user_is_reopened() {
        let temp = tempfile::tempdir().unwrap();
        let dir = users_dir(&temp);
        let manager = UserManager::open(dir.clone(), 1000, None).unwrap();
        let user_id = manager.active_user().profile.id;
        drop(manager);

        let manager = UserManager::open(dir, 1000, None).unwrap();
        assert_eq!(manager.active_user().profile.id, user_id);
    }

    #[test]
    fn create_and_switch_user() {
        let temp = tempfile::tempdir().unwrap();
        let dir = users_dir(&temp);
        let mut manager = UserManager::open(dir, 1000, None).unwrap();
        let _ = manager.create_user("user_001").unwrap();
        assert_eq!(manager.active_user().profile.display_name, "user_001");
        let _ = manager.switch_user("default").unwrap();
        assert_eq!(manager.active_user().profile.display_name, "Default");
    }

    #[test]
    fn known_users_returns_all() {
        let temp = tempfile::tempdir().unwrap();
        let dir = users_dir(&temp);
        let mut manager = UserManager::open(dir, 1000, None).unwrap();
        let _ = manager.create_user("user_001").unwrap();
        let _ = manager.create_user("user_002").unwrap();
        let profiles = manager.known_users().unwrap();
        let names: Vec<&str> = profiles.iter().map(|p| p.display_name.as_str()).collect();
        assert!(names.contains(&"Default"));
        assert!(names.contains(&"user_001"));
        assert!(names.contains(&"user_002"));
    }

    #[test]
    fn backup_creates_sqlite_file() {
        let temp = tempfile::tempdir().unwrap();
        let dir = users_dir(&temp);
        let manager = UserManager::open(dir, 1000, None).unwrap();
        let backup = manager.active_user().backup().unwrap();
        assert!(backup.exists());
        assert_eq!(backup.extension().unwrap_or_default(), "sqlite3");
        assert!(backup
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("library_"));
    }

    #[test]
    fn delete_user_removes_other_users_but_not_active() {
        let temp = tempfile::tempdir().unwrap();
        let dir = users_dir(&temp);
        let mut manager = UserManager::open(dir, 1000, None).unwrap();
        let _ = manager.create_user("user_001").unwrap();
        let _ = manager.switch_user("default").unwrap();

        // нельзя удалить активного
        assert!(manager.delete_user("default").is_err());

        // можно удалить другого
        manager.delete_user("user_001").unwrap();
        let names: Vec<String> = manager
            .known_users()
            .unwrap()
            .into_iter()
            .map(|p| p.display_name)
            .collect();
        assert!(!names.contains(&"user_001".to_string()));
        assert!(names.contains(&"Default".to_string()));
    }

    #[test]
    fn export_import_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        let mut manager = UserManager::open(users_dir(&temp).join("a"), 1000, None).unwrap();
        let _ = manager.create_user("user_001").unwrap();
        let export_dir = temp.path().join("export");
        let exported = manager.export_user(&export_dir).unwrap();
        assert!(exported.join("profile.json").exists());
        assert!(exported.join("library.sqlite3").exists());

        let mut manager2 = UserManager::open(users_dir(&temp).join("b"), 1000, None).unwrap();
        let _ = manager2.import_user(&exported).unwrap();
        let profiles = manager2.known_users().unwrap();
        let names: Vec<&str> = profiles.iter().map(|p| p.display_name.as_str()).collect();
        assert!(names.contains(&"user_001"));
    }

    #[test]
    fn switch_resolves_default_user_with_lowercase_folder() {
        let temp = tempfile::tempdir().unwrap();
        let mut manager = UserManager::open(users_dir(&temp), 1000, None).unwrap();
        let _ = manager.create_user("Default User").unwrap();
        // папка хранится под safe-именем, а switch ищет и по display_name
        let _ = manager.switch_user("Default").unwrap();
        assert_eq!(manager.active_user().profile.display_name, "Default");
        let _ = manager.switch_user("Default User").unwrap();
        assert_eq!(manager.active_user().profile.display_name, "Default User");
    }

    #[test]
    fn unsafe_names_are_sanitized_into_folder_names() {
        assert_eq!(safe_folder_name("a/b\\c:d"), "a_b_c_d");
        assert_eq!(safe_folder_name("  spaced  "), "spaced");
        assert_eq!(safe_folder_name("..."), "user");
        assert_eq!(safe_folder_name("Default"), "Default");
    }
}
