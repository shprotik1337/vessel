use std::path::PathBuf;

use vessel_core::secrets::{SecretKey, SecretStore};

fn main() {
    let appdata = std::env::var("APPDATA").expect("APPDATA");
    let fallback = PathBuf::from(appdata)
        .join("vessel")
        .join("vessel")
        .join("data")
        .join("secrets.json");
    let store = SecretStore::new(fallback);
    let r = store.get(SecretKey::YouTubeOAuthRefresh).ok().flatten();
    match r {
        Some(v) => println!("yt-oauth-refresh present len={}", v.len()),
        None => println!("yt-oauth-refresh NONE"),
    }
    let o = store.get(SecretKey::SessionToken).ok().flatten();
    println!("session-token {}", if o.is_some() { "yes" } else { "no" });
}
