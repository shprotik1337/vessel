use crate::model::TrackRef;

pub fn artist_id(track: &TrackRef) -> String {
    normalize_search_text(&track.display_artist())
}

pub fn track_key(track: &TrackRef) -> String {
    track.provider_key()
}

pub fn normalize_search_text(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut needs_space = false;
    for symbol in value.chars().flat_map(char::to_lowercase) {
        if symbol.is_alphanumeric() {
            if needs_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push(symbol);
            needs_space = false;
        } else {
            needs_space = true;
        }
    }
    normalized
}

pub fn clean_artist_name(name: &str) -> String {
    normalize_search_text(name.trim())
}

pub fn is_junk_artist(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    lower.is_empty()
        || lower.len() < 2
        || lower == "unknown"
        || lower == "various artists"
        || lower == "various"
        || lower == "sound cloud"
        || lower == "soundcloud"
        || lower == "va"
        || lower.contains("podcast")
        || lower.contains("подкаст")
        || lower.contains("audiobook")
        || lower.contains("аудиокнига")
        || lower.contains("meeting")
        || lower.contains("интервью")
}

pub fn is_valid_artist_name(name: &str) -> bool {
    let clean = name.trim();
    clean.len() >= 2 && clean.len() <= 60 && !is_junk_artist(clean)
}

pub fn clean_track_title(title: &str) -> String {
    let mut cleaned = title.trim().to_lowercase();
    // Убираем частые суффиксы в скобках
    for pattern in &[
        "(remastered",
        "[remastered",
        "(remaster",
        "[remaster",
        "(official video",
        "[official video",
        "(official audio",
        "[official audio",
        "(music video",
        "[music video",
        "(lyric video",
        "[lyric video",
        "(lyrics",
        "[lyrics",
        "(audio",
        "[audio",
        "(hd",
        "[hd",
        "(hq",
        "[hq",
        "(visualizer",
        "[visualizer",
        "(prod.",
        "[prod.",
        "(feat.",
        "[feat.",
        "(ft.",
        "[ft.",
    ] {
        if let Some(pos) = cleaned.find(pattern) {
            cleaned.truncate(pos);
            cleaned = cleaned.trim().to_string();
        }
    }
    normalize_search_text(&cleaned)
}

pub fn track_semantic_key(track: &TrackRef) -> String {
    let artist_str = if let Some(first) = track.artists.first() {
        first.clone()
    } else {
        track.display_artist()
    };
    let clean_art = clean_artist_name(&artist_str);
    let clean_tit = clean_track_title(&track.title);
    format!("{clean_art}:::{clean_tit}")
}
