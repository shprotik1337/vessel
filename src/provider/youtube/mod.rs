pub mod clients;
mod client;
pub mod decipher;
pub mod innertube;
mod mapping;
mod models;
pub mod player;
mod provider;
pub mod search;
pub mod botguard;

use url::Url;

use crate::provider::Attribution;

pub use provider::YouTubeMusicProvider;

pub(crate) const YTM_HOMEPAGE: &str = "https://music.youtube.com";

fn attribution() -> Attribution {
    Attribution {
        label: "YouTube Music".to_string(),
        url: Url::parse(YTM_HOMEPAGE).expect("статический адрес YouTube Music"),
    }
}
