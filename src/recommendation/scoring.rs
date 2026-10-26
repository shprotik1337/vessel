use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::SystemTime,
};

use crate::{
    model::{ProviderKind, TrackRef},
    provider::CollectionItem,
    wave::track_semantic_key,
};

pub fn normalize_album_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn balance_providers_organic(
    tracks: Vec<TrackRef>,
    target_count: usize,
    allowed: &[ProviderKind],
) -> Vec<TrackRef> {
    if tracks.is_empty() || allowed.is_empty() {
        return tracks.into_iter().take(target_count).collect();
    }

    let mut buckets: HashMap<ProviderKind, Vec<TrackRef>> = HashMap::new();
    let mut seen_keys = HashSet::new();

    for t in tracks {
        if !allowed.contains(&t.provider) {
            continue;
        }
        let sk = track_semantic_key(&t);
        if seen_keys.insert(sk) {
            buckets.entry(t.provider).or_default().push(t);
        }
    }

    let available_providers: Vec<ProviderKind> = allowed
        .iter()
        .copied()
        .filter(|p| buckets.get(p).map(|l| !l.is_empty()).unwrap_or(false))
        .collect();

    if available_providers.is_empty() {
        return Vec::new();
    }
    if available_providers.len() == 1 {
        let p = available_providers[0];
        return buckets
            .remove(&p)
            .unwrap_or_default()
            .into_iter()
            .take(target_count)
            .collect();
    }

    const MAX_PROVIDER_STREAK: usize = 2;

    let target_per_prov =
        (target_count + available_providers.len() - 1) / available_providers.len();
    let mut indices: HashMap<ProviderKind, usize> = HashMap::new();
    for &p in &available_providers {
        indices.insert(p, 0);
    }

    let mut result = Vec::new();
    let mut last_prov: Option<ProviderKind> = None;
    let mut current_streak = 0;
    let mut rng_seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(12345);

    let mut next_rand = move || -> usize {
        rng_seed = rng_seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (rng_seed >> 32) as usize
    };

    while result.len() < target_count {
        let mut available: Vec<ProviderKind> = available_providers
            .iter()
            .copied()
            .filter(|p| {
                let cur = indices.get(p).copied().unwrap_or(0);
                let total = buckets.get(p).map(|l| l.len()).unwrap_or(0);
                cur < total && cur < target_per_prov
            })
            .collect();

        if available.is_empty() {
            available = available_providers
                .iter()
                .copied()
                .filter(|p| {
                    let cur = indices.get(p).copied().unwrap_or(0);
                    let total = buckets.get(p).map(|l| l.len()).unwrap_or(0);
                    cur < total
                })
                .collect();
        }

        if available.is_empty() {
            break;
        }

        // Если текущий провайдер исчерпал streak и есть альтернативы с доступными треками,
        // исключаем его из пула выбора на этом шаге
        let candidate_pool: Vec<ProviderKind> = if let Some(last) = last_prov {
            if current_streak >= MAX_PROVIDER_STREAK {
                let others: Vec<ProviderKind> =
                    available.iter().copied().filter(|p| *p != last).collect();
                if !others.is_empty() {
                    others
                } else {
                    available.clone()
                }
            } else {
                available.clone()
            }
        } else {
            available.clone()
        };

        let next_prov = if candidate_pool.len() == 1 {
            candidate_pool[0]
        } else {
            let min_picks = candidate_pool
                .iter()
                .map(|p| indices.get(p).copied().unwrap_or(0))
                .min()
                .unwrap_or(0);
            let viable: Vec<ProviderKind> = candidate_pool
                .iter()
                .copied()
                .filter(|p| indices.get(p).copied().unwrap_or(0) == min_picks)
                .collect();
            let choices: Vec<ProviderKind> = if let Some(last) = last_prov {
                let others: Vec<ProviderKind> =
                    viable.iter().copied().filter(|p| *p != last).collect();
                if !others.is_empty() { others } else { viable }
            } else {
                viable
            };
            choices[next_rand() % choices.len()]
        };

        if Some(next_prov) != last_prov {
            current_streak = 0;
            last_prov = Some(next_prov);
        }

        let list = buckets.get(&next_prov).unwrap();
        let cur_idx = indices.get(&next_prov).copied().unwrap_or(0);
        let remaining_in_bucket = list.len() - cur_idx;
        let remaining_to_target = target_count - result.len();
        let other_available_count = available_providers
            .iter()
            .filter(|p| {
                **p != next_prov
                    && indices.get(p).copied().unwrap_or(0)
                        < buckets.get(p).map(|l| l.len()).unwrap_or(0)
            })
            .count();

        let remaining_in_streak = if other_available_count > 0 {
            MAX_PROVIDER_STREAK.saturating_sub(current_streak).max(1)
        } else {
            remaining_to_target
        };

        let desired_burst = if other_available_count > 0 {
            (next_rand() % MAX_PROVIDER_STREAK) + 1 // 1 or 2
        } else {
            MAX_PROVIDER_STREAK
        };

        let quota_headroom = if other_available_count > 0 {
            target_per_prov.saturating_sub(cur_idx).max(1)
        } else {
            remaining_to_target
        };

        let min_other_active = available
            .iter()
            .filter(|p| **p != next_prov)
            .map(|p| indices.get(p).copied().unwrap_or(0))
            .min();

        let balance_headroom = if let Some(min_other) = min_other_active {
            (min_other + MAX_PROVIDER_STREAK)
                .saturating_sub(cur_idx)
                .max(1)
        } else {
            remaining_to_target
        };

        let max_burst = desired_burst
            .min(remaining_in_bucket)
            .min(remaining_to_target)
            .min(remaining_in_streak)
            .min(quota_headroom)
            .min(balance_headroom)
            .max(1);
        let burst = desired_burst.min(max_burst);

        for i in 0..burst {
            result.push(list[cur_idx + i].clone());
        }
        indices.insert(next_prov, cur_idx + burst);
        current_streak += burst;
    }

    result
}

pub fn balance_collections(
    items: Vec<CollectionItem>,
    target_count: usize,
    allowed: &[ProviderKind],
) -> Vec<CollectionItem> {
    if items.is_empty() || allowed.is_empty() {
        return items.into_iter().take(target_count).collect();
    }

    let mut by_prov: HashMap<ProviderKind, Vec<CollectionItem>> = HashMap::new();
    for item in items {
        by_prov.entry(item.provider).or_default().push(item);
    }

    let mut result = Vec::new();
    let mut changed = true;
    while result.len() < target_count && changed {
        changed = false;
        for prov in allowed {
            if let Some(list) = by_prov.get_mut(prov) {
                if !list.is_empty() {
                    result.push(list.remove(0));
                    changed = true;
                    if result.len() >= target_count {
                        break;
                    }
                }
            }
        }
    }

    result
}

static RECENT_SERVED_RECS: Mutex<Option<Vec<String>>> = Mutex::new(None);

pub fn remember_served_recs(keys: &[String]) {
    if let Ok(mut guard) = RECENT_SERVED_RECS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        for k in keys {
            if !list.contains(k) {
                list.push(k.clone());
            }
        }
        if list.len() > 64 {
            let overflow = list.len() - 64;
            list.drain(0..overflow);
        }
    }
}

pub fn get_recently_served_recs() -> HashSet<String> {
    if let Ok(guard) = RECENT_SERVED_RECS.lock() {
        if let Some(list) = guard.as_ref() {
            return list.iter().cloned().collect();
        }
    }
    HashSet::new()
}

static RECENT_SMART_SHUFFLE_KEYS: Mutex<Option<Vec<String>>> = Mutex::new(None);

pub fn remember_smart_shuffle_keys(keys: &[String]) {
    if let Ok(mut guard) = RECENT_SMART_SHUFFLE_KEYS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        for k in keys {
            if !list.contains(k) {
                list.push(k.clone());
            }
        }
        if list.len() > 64 {
            let overflow = list.len() - 64;
            list.drain(0..overflow);
        }
    }
}

pub fn get_recently_smart_shuffle_keys() -> HashSet<String> {
    if let Ok(guard) = RECENT_SMART_SHUFFLE_KEYS.lock() {
        if let Some(list) = guard.as_ref() {
            return list.iter().cloned().collect();
        }
    }
    HashSet::new()
}

#[cfg(test)]
pub fn clear_smart_shuffle_memory_for_tests() {
    if let Ok(mut guard) = RECENT_SMART_SHUFFLE_KEYS.lock() {
        *guard = None;
    }
}
