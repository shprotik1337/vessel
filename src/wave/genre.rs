use std::collections::{HashMap, HashSet};

use crate::model::TrackRef;

use super::text::normalize_search_text;

#[derive(Clone, Debug, Default)]
pub struct WaveGenreProfile {
    weights: HashMap<String, usize>,
}

impl WaveGenreProfile {
    pub fn from_tracks(tracks: &[TrackRef]) -> Self {
        let mut weights = HashMap::new();
        for track in tracks {
            for tag in track_tags(track) {
                weights
                    .entry(tag)
                    .and_modify(|count| *count += 1)
                    .or_insert(1);
            }
        }
        Self { weights }
    }

    pub fn is_empty(&self) -> bool {
        self.weights.is_empty()
    }

    pub fn similarity(&self, track: &TrackRef) -> f64 {
        if self.weights.is_empty() {
            return 0.0;
        }
        let tags = track_tags(track);
        if tags.is_empty() {
            return 0.0;
        }
        let total_weight = self.weights.values().copied().sum::<usize>().max(1) as f64;
        let matched_weight = tags
            .iter()
            .map(|tag| self.weights.get(tag).copied().unwrap_or_default() as f64)
            .sum::<f64>();
        (matched_weight / total_weight * 4.0).clamp(0.0, 1.0)
    }

    /// Штраф за чужеродные жанры, которых нет в профиле пользователя (например, Hardstyle/Frenchcore)
    pub fn alien_penalty(&self, track: &TrackRef) -> f64 {
        if self.weights.is_empty() {
            return 0.0;
        }
        let tags = track_tags(track);
        let mut pen = 0.0;
        for tag in tags {
            if !self.weights.contains_key(&tag) {
                if tag == "hardstyle" {
                    pen += 2.5;
                } else if tag == "techno" || tag == "metal" {
                    pen += 0.8;
                }
            }
        }
        pen
    }
}

pub(crate) fn track_tags(track: &TrackRef) -> HashSet<String> {
    let artist_norm = normalize_search_text(&track.display_artist());
    let mut tags = extract_tags(&format!(" {} {} ", track.title, track.display_artist()));

    // Добавляем жанры из метаданных самого трека, если провайдер их вернул
    for g in &track.genres {
        for t in extract_tags(&format!(" {} ", normalize_search_text(g))) {
            tags.insert(t);
        }
    }

    // Если артист относится к хип-хоп / трэп сцене — гарантированно добавляем тег рэпа
    if is_known_hiphop_artist(&artist_norm) {
        tags.insert("rap".to_string());
        tags.insert("trap".to_string());
        // Убираем ложные теги метала и рока из метафор в названиях (например, "Heavy Metal" Kai Angel)
        tags.remove("metal");
        tags.remove("rock");
    }

    tags
}

fn is_known_hiphop_artist(artist_norm: &str) -> bool {
    const HIPHOP_ARTISTS: &[&str] = &[
        "kai angel",
        "9mice",
        "playboi carti",
        "carti",
        "travis scott",
        "drake",
        "kendrick lamar",
        "future",
        "21 savage",
        "lil uzi vert",
        "yeat",
        "ken carson",
        "destroy lonely",
        "big baby tape",
        "kizaru",
        "og buda",
        "scally milano",
        "heronwater",
        "mayot",
        "toxi$",
        "toxis",
        "obladaet",
        "saluki",
        "pharaoh",
        "boulevard depo",
        "yanix",
        "gone.fludd",
        "rocket",
        "lizer",
        "friendly thug",
        "alblak 52",
        "bushido zho",
        "платина",
        "макан",
        "macan",
        "shadowraze",
        "zxcursed",
        "sqwoz bab",
        "трилл пилл",
        "thrill pill",
        "juice wrld",
        "xxxtentacion",
        "lil peep",
        "trippie redd",
        "gunna",
        "young thug",
        "baby keem",
        "asap rocky",
        "a$ap rocky",
        "metro boomin",
        "don toliver",
    ];
    HIPHOP_ARTISTS.iter().any(|&a| artist_norm.contains(a))
}

fn extract_tags(value: &str) -> HashSet<String> {
    let source = format!(" {} ", normalize_search_text(value));
    let mut tags = HashSet::new();
    let mut insert_if_any = |tag: &str, keys: &[&str]| {
        if keys.iter().any(|key| source.contains(key)) {
            tags.insert(tag.to_string());
        }
    };
    insert_if_any(
        "rap",
        &[
            " rap",
            " рэп",
            " hip hop",
            " hip-hop",
            " hiphop",
            " хип хоп",
            " хип-хоп",
            " trap",
            " трэп",
            " треп",
            " rage",
            " рейдж",
            " drill",
            " дрилл",
            " дрил",
            " plug",
            " плаг",
            " cloud rap",
            " клауд",
        ],
    );
    insert_if_any("rock", &[" рок", " rock", " grunge", " панк"]);
    insert_if_any("metal", &[" metal", " метал", " deathcore"]);
    insert_if_any("pop", &[" pop", " поп"]);
    insert_if_any(
        "electronic",
        &[" electro", " электро", " edm", " electronic"],
    );
    insert_if_any(
        "hardstyle",
        &[
            " hardstyle",
            " хардстайл",
            " gymstyle",
            " frenchcore",
            " rawstyle",
            " gym hardstyle",
        ],
    );
    insert_if_any("house", &[" house", " хаус"]);
    insert_if_any("techno", &[" techno", " техно"]);
    insert_if_any("phonk", &[" phonk", " фонк"]);
    insert_if_any("lofi", &[" lofi", " lo-fi", " лоуфай", " лофи"]);
    insert_if_any("ambient", &[" ambient", " эмбиент"]);
    insert_if_any("jazz", &[" jazz", " джаз"]);
    insert_if_any("classical", &[" classical", " классика", " orches"]);
    insert_if_any("indie", &[" indie", " инди"]);
    insert_if_any("punk", &[" punk", " панк"]);
    insert_if_any("trap", &[" trap", " трэп", " треп"]);
    insert_if_any("dnb", &[" dnb", " drum and bass", " драм"]);
    insert_if_any("dubstep", &[" dubstep", " дабстеп"]);
    insert_if_any("rnb", &[" rnb", " r&b"]);
    insert_if_any("soul", &[" soul", " соул"]);
    insert_if_any("funk", &[" funk", " фанк"]);
    insert_if_any("chill", &[" chill", " чилл", " relaxed", " спокой"]);
    insert_if_any("sad", &[" sad", " груст", " печал"]);
    insert_if_any("dance", &[" dance", " танц", " club", " клуб"]);
    tags
}
