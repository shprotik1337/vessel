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

/// Удаляет всё содержимое любых круглых `(...)`, квадратных `[...]` и фигурных `{...}` скобок:
/// "Bohemian Rhapsody (2011 Mix) [Remastered]" -> "Bohemian Rhapsody"
pub fn strip_all_brackets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0;
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => {
                if depth > 0 {
                    depth -= 1;
                }
            }
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['-', '–', '—', ':', ',', '.'])
        .trim()
        .to_string()
}

/// Проверяет, является ли артист заглушкой / пустым / неизвестным
pub fn is_unknown_artist(artist: &str) -> bool {
    let trimmed = artist.trim();
    trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("unknown artist")
        || trimmed.eq_ignore_ascii_case("unknown")
        || trimmed.eq_ignore_ascii_case("неизвестный исполнитель")
        || trimmed.eq_ignore_ascii_case("неизвестный артист")
}

/// Получает имя первого/основного артиста (отсекая дубли в разных алфавитах через запятую: "Uchu Nekoko, 宇宙ネコ子" -> "Uchu Nekoko").
pub fn primary_artist(track: &TrackRef) -> String {
    if let Some(first) = track.artists.first() {
        let trimmed = first.trim();
        if is_unknown_artist(trimmed) {
            return String::new();
        }
        if let Some((before, _)) = trimmed.split_once(',') {
            let before_trimmed = before.trim();
            if is_unknown_artist(before_trimmed) {
                return String::new();
            }
            return before_trimmed.to_string();
        }
        trimmed.to_string()
    } else {
        String::new()
    }
}

/// Очищенный запрос: чистое название без скобок + основной артист через пробел (по стандарту Riff/Spotube).
/// Используется как фолбэк при пустой выдаче чужого каталога (например, Deezer или YTM).
pub fn clean_search_query(track: &TrackRef) -> String {
    let stripped = strip_all_brackets(&track.title);
    let title = if stripped.is_empty() {
        track.title.trim()
    } else {
        stripped.as_str()
    };
    let artist = primary_artist(track);
    if artist.is_empty() {
        title.to_string()
    } else {
        format!("{title} {artist}")
    }
}

/// Запрос только по чистому названию трека (без скобок и без артиста) — для сложных случаев и ремиксов.
pub fn clean_title_query(track: &TrackRef) -> String {
    let stripped = strip_all_brackets(&track.title);
    if stripped.is_empty() {
        track.title.trim().to_string()
    } else {
        stripped
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
