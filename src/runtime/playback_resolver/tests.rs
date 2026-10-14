use super::*;
use crate::model::{PlaybackCapability, ProviderKind, TrackOrigin, TrackRef};

fn track(provider: ProviderKind, id: &str, title: &str, artist: &str, dur: u64) -> TrackRef {
    TrackRef {
        provider,
        id: id.into(),
        title: title.into(),
        artists: vec![artist.into()],
        duration_ms: Some(dur),
        artwork_url: None,
        web_url: url::Url::parse("https://example.com/track").unwrap(),
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
        isrc: None,
        origin: TrackOrigin::Original,
        album_url: None,
        album_title: None,
    }
}

#[test]
fn normalize_strips_feat_and_parens() {
    assert_eq!(
        normalize_title("Get Lucky (feat. Pharrell Williams)"),
        "get lucky"
    );
    assert_eq!(
        normalize_title("TWIN TRIM (with Lil Uzi Vert)"),
        "twin trim"
    );
    assert_eq!(
        normalize_title("Harder, Better, Faster, Stronger [Official Audio]"),
        "harder better faster stronger"
    );
    assert_eq!(normalize_title("Around the World - Topic"), "around the world");
    assert_eq!(normalize_title("One More Time"), "one more time");
}

#[test]
fn normalize_cyrillic() {
    // ё/е должны сводиться к одному виду
    assert_eq!(normalize_title("Ёлка"), normalize_title("Елка"));
    assert_eq!(normalize_title("Три дня дождя"), "tri dnya dozhdya");
    // em dash, кавычки, двойные пробелы
    assert_eq!(
        normalize_title("Баста — «Сансара»"),
        normalize_title("Баста Сансара")
    );
    // feat вне скобок
    assert_eq!(
        normalize_title("Баста feat. Тима Белорусских"),
        normalize_title("Баста")
    );
    assert_eq!(normalize_title("Song ft X"), "song");
    assert_eq!(normalize_title("Song featuring Y"), "song");
    // но не в начале и не часть слова
    assert_eq!(normalize_title("Aftertaste"), "aftertaste");
}

#[test]
fn translit_merges_cyrillic_and_latin_names() {
    // Главное: одно и то же имя в разных алфавитах даёт один ключ
    assert_eq!(normalize_title("Элджей"), normalize_title("Eldzhey"));
    assert_eq!(normalize_title("Баста"), normalize_title("Basta"));
    assert_eq!(normalize_title("Кино"), normalize_title("Kino"));
    // и русские названия треков тоже сводятся
    assert_eq!(
        normalize_title("Рваные джинсы"),
        normalize_title("Rvanyе dzhinsy".replace('е', "е").as_str())
    );
}

#[test]
fn title_exact_artist_mismatch_still_matches_if_duration_exact() {
    // «Eldzhey» (латиница) vs «Другое Имя» — артист не совпал,
    // но название и длительность точные → ослабленный матч 0.75
    let spotify = track(ProviderKind::Spotify, "sp9", "Рваные джинсы", "Eldzhey", 180_000);
    let dz = track(ProviderKind::Deezer, "d9", "Рваные джинсы", "Совсем Другой", 180_000);
    let m = best_match(&spotify, &[dz], ProviderKind::Deezer).expect("ослабленный матч");
    assert!((m.confidence - 0.75).abs() < 0.001, "conf={}", m.confidence);
}

#[test]
fn title_exact_wrong_duration_no_match() {
    // Название совпало, артист нет, длительность далеко — отбраковка
    let spotify = track(ProviderKind::Spotify, "sp10", "Song", "Artist A", 180_000);
    let other = track(ProviderKind::Deezer, "d10", "Song", "Artist B", 240_000);
    assert!(best_match(&spotify, &[other], ProviderKind::Deezer).is_none());
}

#[test]
fn confidence_thresholds() {
    let spotify = track(
        ProviderKind::Spotify, "sp1",
        "Get Lucky (feat. Pharrell Williams)", "Daft Punk", 249_000,
    );
    let yt_exact = track(
        ProviderKind::YouTubeMusic, "yt1",
        "Get Lucky (Official Audio)", "Daft Punk", 248_000,
    );
    let m = best_match(&spotify, &[yt_exact], ProviderKind::YouTubeMusic).unwrap();
    assert!(m.confidence >= MIN_CONFIDENCE, "confidence={}", m.confidence);
    assert_eq!(m.track.id, "yt1");
}

#[test]
fn duration_mismatch_rejected() {
    let spotify = track(
        ProviderKind::Spotify, "sp2", "One More Time", "Daft Punk", 320_000,
    );
    let wrong = track(
        ProviderKind::Deezer, "d1", "One More Time (Live 2000)", "Daft Punk", 600_000,
    );
    assert!(best_match(&spotify, &[wrong], ProviderKind::Deezer).is_none());
}

#[test]
fn isrc_beats_title_similarity() {
    let spotify = track(
        ProviderKind::Spotify, "sp3", "Совершенно другое название", "Артист", 200_000,
    );
    let mut candidate = track(
        ProviderKind::Deezer, "d3", "Другое название", "Другой артист", 200_000,
    );
    candidate.isrc = Some("RUA1P2600001".into());
    let mut spotify = spotify;
    spotify.isrc = Some("rua1p2600001".into());
    let m = best_match(&spotify, &[candidate], ProviderKind::Deezer).unwrap();
    assert_eq!(m.confidence, 1.0);
}

#[test]
fn best_candidates_sorted_by_confidence() {
    let spotify = track(ProviderKind::Spotify, "sp4", "Song", "Artist", 200_000);
    let weaker = track(ProviderKind::Deezer, "d4a", "Song (Album Version)", "Artist", 200_000);
    let stronger = track(ProviderKind::Deezer, "d4b", "Song", "Artist", 200_000);
    let list = best_candidates(&spotify, &[weaker, stronger], ProviderKind::Deezer);
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].track.id, "d4b");
    assert!(list[0].confidence > list[1].confidence);
}

#[test]
fn auto_chain_is_ytm_then_deezer_manual_is_single() {
    assert_eq!(
        PlaybackSourceKind::Auto.chain(),
        vec![PlaybackSourceKind::YouTubeMusic, PlaybackSourceKind::Deezer]
    );
    assert_eq!(
        PlaybackSourceKind::Deezer.chain(),
        vec![PlaybackSourceKind::Deezer]
    );
    assert_eq!(
        PlaybackSourceKind::YouTubeMusic.chain(),
        vec![PlaybackSourceKind::YouTubeMusic]
    );
}

#[test]
fn video_match_finds_clip_with_alias_artist() {
    // «Розовое вино»: трек удалён из каталога, остался клип.
    // В YTM артист записан как Allj (не Eldzhey) — нужен алиас.
    let spotify = track(ProviderKind::Spotify, "spv1", "Розовое вино", "Eldzhey", 247_000);
    let mut clip = track(ProviderKind::YouTubeMusic, "ytv1", "Розовое вино", "Allj & FEDUK", 0);
    clip.duration_ms = None; // у видео-строк общего поиска длительности нет
    let list = best_candidates_video(&spotify, &[clip]);
    assert_eq!(list.len(), 1, "клип должен матчиться по алиасу Allj");
    assert!(list[0].confidence >= MIN_CONFIDENCE);
}

#[test]
fn video_match_artist_name_in_title() {
    // «Feduk & Элджей — Розовое вино (Official Video)»: артист в названии
    let spotify = track(ProviderKind::Spotify, "spv2", "Розовое вино", "Eldzhey", 247_000);
    let mut clip = track(
        ProviderKind::YouTubeMusic, "ytv2",
        "Feduk & Элджей — Розовое вино (Official Video)", "FEDUK", 0,
    );
    clip.duration_ms = None;
    let list = best_candidates_video(&spotify, &[clip]);
    assert_eq!(list.len(), 1);
}

#[test]
fn video_match_rejects_other_artists_and_junk() {
    let spotify = track(ProviderKind::Spotify, "spv3", "Розовое вино", "Eldzhey", 247_000);
    // Тот же title, но чужой артист и имя не в названии
    let mut foreign_cover = track(ProviderKind::YouTubeMusic, "ytv3", "Розовое Вино", "Гр.Одноклассники", 0);
    foreign_cover.duration_ms = None;
    // Текстовое видео: имя в названии есть, но названия нет
    let mut lyric = track(ProviderKind::YouTubeMusic, "ytv4", "Элджей & Feduk «Розовое Вино» (Текст)", "Play Muzic", 0);
    lyric.duration_ms = None;
    let list = best_candidates_video(&spotify, &[foreign_cover, lyric]);
    assert!(list.is_empty(), "чужие артисты не должны матчиться");
}

#[test]
fn video_match_duration_soft_window() {
    // Клип короче трека на 44с (3:23 vs 4:07) — принимается со штрафом
    let spotify = track(ProviderKind::Spotify, "spv5", "Song", "Artist", 247_000);
    let clip = track(ProviderKind::YouTubeMusic, "ytv5", "Song", "Artist", 203_000);
    let list = best_candidates_video(&spotify, &[clip]);
    assert_eq!(list.len(), 1);
    // Нарезка 60%+ — отбраковка
    let cut = track(ProviderKind::YouTubeMusic, "ytv6", "Song", "Artist", 90_000);
    assert!(best_candidates_video(&spotify, &[cut]).is_empty());
}

#[test]
fn source_kind_round_trip_and_aliases() {
    assert_eq!(
        PlaybackSourceKind::from_str("auto"),
        Some(PlaybackSourceKind::Auto)
    );
    assert_eq!(
        PlaybackSourceKind::from_str("deezer"),
        Some(PlaybackSourceKind::Deezer)
    );
    assert_eq!(
        PlaybackSourceKind::from_str("youtube_music"),
        Some(PlaybackSourceKind::YouTubeMusic)
    );
    // старый алиас «youtube» означает Music, а не отдельный провайдер
    assert_eq!(
        PlaybackSourceKind::from_str("youtube"),
        Some(PlaybackSourceKind::YouTubeMusic)
    );
    assert_eq!(PlaybackSourceKind::Auto.as_str(), "auto");
    assert_eq!(
        PlaybackSourceKind::from_str(PlaybackSourceKind::Auto.as_str()),
        Some(PlaybackSourceKind::Auto)
    );
}

#[test]
fn different_artist_same_title_rejected() {
    // Кавер: другой артист, та же длительность — ослабленный матч,
    // но приоритет ниже прямого совпадения по артисту
    let spotify = track(ProviderKind::Spotify, "sp5", "Кино", "Виктор Цой", 200_000);
    let cover = track(ProviderKind::YouTubeMusic, "yt5", "Кино", "Другая Группа", 200_000);
    let m = best_match(&spotify, &[cover], ProviderKind::YouTubeMusic)
        .expect("точный title+duration даёт ослабленный матч");
    assert!((m.confidence - 0.75).abs() < 0.001);
    // А кавер с другой длительностью отбраковывается полностью
    let long_cover = track(ProviderKind::YouTubeMusic, "yt5b", "Кино", "Другая Группа", 260_000);
    assert!(best_match(&spotify, &[long_cover], ProviderKind::YouTubeMusic).is_none());
}

#[test]
fn clean_search_query_strips_feat_and_remix() {
    let track1 = track(
        ProviderKind::Spotify,
        "sp_feat",
        "Twin Team (feat. Lil Uzi Vert)",
        "Playboi Carti",
        150_000,
    );
    assert_eq!(clean_search_query(&track1), "Playboi Carti - Twin Team");

    let track2 = track(
        ProviderKind::Spotify,
        "sp_remix",
        "Song Name [Remix]",
        "Artist",
        200_000,
    );
    assert_eq!(clean_search_query(&track2), "Artist - Song Name");
}

#[test]
fn multi_artist_and_soft_duration_matching() {
    // Трек с разницей в длительности 12 секунд (например, интро/аутро в YTM)
    let spotify = track(ProviderKind::Spotify, "sp_stranger", "stranger", "9mice", 130_000);
    let ytm = track(ProviderKind::YouTubeMusic, "yt_stranger", "stranger", "9mice", 142_000);
    let m = best_match(&spotify, &[ytm], ProviderKind::YouTubeMusic).expect("должен матчиться с мягкой длительностью");
    assert!(m.confidence >= MIN_CONFIDENCE);

    // Трек, где у Spotify два артиста, а у YTM второй артист первый
    let mut sp_collab = track(ProviderKind::Spotify, "sp_collab", "Collab Track", "Artist A", 180_000);
    sp_collab.artists = vec!["Artist A".into(), "Artist B".into()];
    let mut ytm_collab = track(ProviderKind::YouTubeMusic, "yt_collab", "Collab Track", "Artist B", 180_000);
    ytm_collab.artists = vec!["Artist B".into(), "Artist A".into()];
    let m2 = best_match(&sp_collab, &[ytm_collab], ProviderKind::YouTubeMusic).expect("должен матчиться при смене порядка артистов");
    assert!(m2.confidence >= 0.85);
}

#[test]
fn different_title_same_artist_rejected() {
    let track_target = track(ProviderKind::SoundCloud, "sc_otorvu", "Оторву руки", "THRILL PILL", 150_000);
    let track_wrong = track(ProviderKind::YouTubeMusic, "yt_shpric", "Наступил шприц", "THRILL PILL", 150_000);
    assert!(best_match(&track_target, &[track_wrong], ProviderKind::YouTubeMusic).is_none());
}

#[test]
fn exact_title_artist_allows_album_single_cut_difference() {
    // Spotify: альбомная версия 4:00 (240 007 мс)
    let spotify = track(ProviderKind::Spotify, "sp_center", "CENTER", "Lege-Cy", 240_007);
    // YTM: сингл/клип-версия 2:43 (163 000 мс) — разница 77 секунд
    let ytm = track(ProviderKind::YouTubeMusic, "yt_center", "CENTER", "Lege-Cy", 163_000);
    let m = best_match(&spotify, &[ytm], ProviderKind::YouTubeMusic)
        .expect("должен матчиться, так как название и артист совпадают точно");
    assert!(m.confidence >= MIN_CONFIDENCE);
}



