use crate::model::TrackRef;

/// Запрос к чужому каталогу: артисты + название.
/// Скобки тут вырезать НЕЛЬЗЯ: титл YouTube = титл Spotify один в один
/// (включая with/feat) — чистка ломает нишевые релизы (breecore/электроника).
/// Всё сглаживание — только в speed (match_confidence: with/contains-ступени).
pub fn search_query(track: &TrackRef) -> String {
    if track.artists.is_empty() {
        track.title.clone()
    } else {
        format!("{} - {}", track.artists.join(", "), track.title)
    }
}

/// Очищенный запрос: артист + название без (feat. ...), [remaster], и т.д.
/// Используется как фолбэк при пустой выдаче чужого каталога (например, Deezer).
pub fn clean_search_query(track: &TrackRef) -> String {
    let mut title = track.title.clone();
    for marker in ["feat", "ft", "featuring", "with", "remix", "remaster"] {
        strip_parenthesized(&mut title, marker);
    }
    title = strip_feat_suffix(&title);
    let title = title.trim();
    if track.artists.is_empty() {
        title.to_string()
    } else {
        let first_artist = track.artists.first().map(|s| s.as_str()).unwrap_or("");
        if title.is_empty() {
            first_artist.to_string()
        } else {
            format!("{} - {}", first_artist, title)
        }
    }
}

/// Нормализация названия: скобки с фичами/ремиксами, feat/ft-суффиксы,
/// пунктуация, регистр, ё→е, затем транслитерация кириллицы в фонетический
/// ключ. Каталоги пишут имена в разных алфавитах («Eldzhey» в Spotify,
/// «Элджей» в Deezer/YT) — сравнивать надо в одном алфавите.
pub fn normalize_title(raw: &str) -> String {
    // ё→е до lowercasing: normalize падежей кириллицы в каталогах разный
    let s: String = raw
        .chars()
        .map(|c| match c {
            'ё' | 'Ё' => 'е',
            other => other,
        })
        .collect();
    let mut s = s.to_lowercase();
    // убираем содержимое скобок с типовыми маркерами
    for marker in [
        "official",
        "audio",
        "video",
        "lyric",
        "remaster",
        "remix",
        "feat",
        "ft",
        "featuring",
        "with",
        "live",
        "prod",
        "deluxe",
        "instrumental",
    ] {
        // (…marker…) и […]marker…]
        strip_parenthesized(&mut s, marker);
    }
    // " - topic" (авто-каналы YouTube/Spotify)
    if s.ends_with(" - topic") {
        s.truncate(s.len() - " - topic".len());
    }
    // feat/ft/featuring вне скобок: «баста feat. тима белорусских» → «баста».
    // Режем по первому самостоятельному токену-маркеру, но не в начале.
    s = strip_feat_suffix(&s);
    // пунктуация и лишние пробелы
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    // Кириллица → фонетический латинский ключ (только для сравнения,
    // не для поисковых запросов — те уходят в API в оригинале)
    transliterate(&cleaned)
}

/// Практическая транслитерация кириллицы (похоже на то, как каталоги
/// сами латинизируют имена: элджей→eldzhey, багз→baga, юра→yura).
pub(crate) fn transliterate(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let rest: String = chars[i..].iter().collect();
        // Многосимвольные правила — первыми (жадно)
        let multi: [(&str, &str); 26] = [
            ("дж", "dzh"),
            ("дз", "dz"),
            ("кс", "x"),
            ("ий", "y"),
            ("ый", "y"),
            ("ье", "ye"),
            ("ья", "ya"),
            ("ью", "yu"),
            ("ай", "ay"),
            ("ей", "ey"),
            ("ой", "oy"),
            ("ый", "y"),
            ("тс", "ts"),
            ("ть", "t"),
            ("ь", ""),
            ("ъ", ""),
            ("шч", "shch"),
            ("yo", "yo"),
            // одиночные на случай, если многосимвольные не сработали
            ("а", "a"),
            ("б", "b"),
            ("в", "v"),
            ("г", "g"),
            ("д", "d"),
            ("е", "e"),
            ("ж", "zh"),
            ("з", "z"),
        ];
        let mut matched = false;
        for (cy, lat) in multi {
            if rest.starts_with(cy) {
                out.push_str(lat);
                i += cy.chars().count();
                matched = true;
                break;
            }
        }
        if matched {
            continue;
        }
        let c = chars[i];
        let single = match c {
            'и' => "i",
            'й' => "y",
            'к' => "k",
            'л' => "l",
            'м' => "m",
            'н' => "n",
            'о' => "o",
            'п' => "p",
            'р' => "r",
            'с' => "s",
            'т' => "t",
            'у' => "u",
            'ф' => "f",
            'х' => "h",
            'ц' => "ts",
            'ч' => "ch",
            'ш' => "sh",
            'щ' => "shch",
            'ы' => "y",
            'э' => "e",
            'ю' => "yu",
            'я' => "ya",
            other => {
                out.push(other);
                i += 1;
                continue;
            }
        };
        out.push_str(single);
        i += 1;
    }
    out
}

/// «Баста feat. X», «Song ft X», «Track featuring Y» → часть до маркера.
pub(crate) fn strip_feat_suffix(s: &str) -> String {
    let words: Vec<&str> = s.split_whitespace().collect();
    for (index, word) in words.iter().enumerate().skip(1) {
        let bare = word.trim_end_matches(['.', ',', ';', '!', '?']);
        if matches!(bare, "feat" | "ft" | "featuring" | "ft." | "feat.") {
            return words[..index].join(" ");
        }
    }
    s.to_string()
}

pub(crate) fn strip_parenthesized(s: &mut String, marker: &str) {
    for (open, close) in [('(', ')'), ('[', ']')] {
        let mut search_from = 0;
        while let Some(rel_start) = s[search_from..].find(open) {
            let start = search_from + rel_start;
            let Some(rel_end) = s[start..].find(close) else {
                break;
            };
            let end = start + rel_end + close.len_utf8();
            let inner = s[start..end].to_lowercase();
            if inner.contains(marker) {
                s.replace_range(start..end, " ");
                // не сдвигаемся: на этом месте теперь пробел
            } else {
                // скобка без маркера — ищем следующую после неё
                search_from = end;
            }
        }
    }
}

/// Известные двойные написания артистов в YTM/Spotify (Allj = Элджей,
/// Skryptonite = Скриптонит и т.п.). Транслитерация их не сводит —
/// это просто разные имена. Расширяется по мере обнаружения.
pub(crate) fn artist_alias_keys(norm: &str) -> Vec<String> {
    match norm {
        "eldzhey" => vec!["eldzhey".into(), "allj".into()],
        "allj" => vec!["allj".into(), "eldzhey".into()],
        "skriptonit" => vec!["skriptonit".into(), "skryptonite".into()],
        "skryptonite" => vec!["skryptonite".into(), "skriptonit".into()],
        other => vec![other.to_string()],
    }
}
