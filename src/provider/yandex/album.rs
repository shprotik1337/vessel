use anyhow::{Context, Result};
use url::Url;
use yandex_music::{
    YandexMusicClient,
    api::album::get_album::GetAlbumOptions,
    model::{album::Album, playlist::PlaylistTracks},
};

use crate::provider::ImportedPlaylist;

use super::playlist_tracks::zagruzit_treki_pleilista;

pub(super) async fn import_album(
    client: &YandexMusicClient,
    album_id: u32,
    source_url: &Url,
) -> Result<ImportedPlaylist> {
    let album = client
        .get_album(&GetAlbumOptions::new(album_id).with_tracks())
        .await
        .context("Yandex Music не отдал альбом")?;
    let title = album_title(&album);
    let description = album_artist(&album);
    let cover_url = album.cover_uri.as_deref().and_then(super::mapping::cover_url);
    let tracks =
        zagruzit_treki_pleilista(client, Some(PlaylistTracks::Full(flatten(album)))).await?;
    Ok(ImportedPlaylist {
        title,
        description,
        source_url: source_url.clone(),
        cover_url,
        tracks,
    })
}

fn flatten(album: Album) -> Vec<yandex_music::model::track::Track> {
    album.volumes.into_iter().flatten().collect()
}

fn album_title(album: &Album) -> String {
    album
        .title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "Альбом Yandex Music".to_string())
}

fn album_artist(album: &Album) -> String {
    album
        .artists
        .iter()
        .filter_map(|artist| artist.name.as_deref())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}
