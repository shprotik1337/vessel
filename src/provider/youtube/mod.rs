pub mod clients;
mod client;
pub mod decipher;
pub mod innertube;
mod mapping;
mod models;
pub mod player;
mod provider;
mod resolve;
pub mod search;
pub mod botguard;

use std::sync::Arc;

use anyhow::Result;
use url::Url;

use crate::provider::Attribution;

pub use client::YoutubeClient;
pub use provider::YouTubeMusicProvider;
pub use resolve::YoutubeResolver;

/// Единый клиент Innertube, разделяемый между YouTubeMusicProvider
/// и резолвером (Spotify через YouTube). Один объект — одна сессия.
#[derive(Clone)]
pub struct Innertube {
    client: Arc<YoutubeClient>,
}

impl Innertube {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: Arc::new(YoutubeClient::new()?),
        })
    }
}

pub(crate) const YTM_HOMEPAGE: &str = "https://music.youtube.com";

fn attribution() -> Attribution {
    Attribution {
        label: "YouTube Music".to_string(),
        url: Url::parse(YTM_HOMEPAGE).expect("статический адрес YouTube Music"),
    }
}
