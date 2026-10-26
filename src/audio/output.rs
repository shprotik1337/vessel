use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
};

use anyhow::{Result, bail};
use cpal::{
    Device, FromSample, I24, OutputCallbackInfo, SampleFormat, SizedSample, Stream, StreamConfig,
    U24, traits::DeviceTrait,
};
use crossbeam_channel::{Receiver, Sender, TryRecvError};

use super::types::AudioEvent;

pub(super) struct AudioChunk {
    pub(super) generation: u64,
    pub(super) samples: Vec<f32>,
    pub(super) end: bool,
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_stream(
    device: &Device,
    config: &StreamConfig,
    format: SampleFormat,
    chunks: Receiver<AudioChunk>,
    events: Sender<AudioEvent>,
    generation: Arc<AtomicU64>,
    paused: Arc<AtomicBool>,
    volume: Arc<AtomicU32>,
    played_samples: Arc<AtomicU64>,
    buffered_samples: Arc<AtomicU64>,
    duration_ms: Arc<AtomicU64>,
    crossfade_ms: Arc<AtomicU32>,
    agc_enabled: Arc<AtomicBool>,
) -> Result<Stream> {
    macro_rules! typed_stream {
        ($sample:ty) => {
            sobrat_stream_dlya_tipa::<$sample>(
                device,
                config,
                chunks,
                events,
                generation,
                paused,
                volume,
                played_samples,
                buffered_samples,
                duration_ms,
                crossfade_ms,
                agc_enabled,
            )
        };
    }

    match format {
        SampleFormat::I8 => typed_stream!(i8),
        SampleFormat::I16 => typed_stream!(i16),
        SampleFormat::I24 => typed_stream!(I24),
        SampleFormat::I32 => typed_stream!(i32),
        SampleFormat::I64 => typed_stream!(i64),
        SampleFormat::U8 => typed_stream!(u8),
        SampleFormat::U16 => typed_stream!(u16),
        SampleFormat::U24 => typed_stream!(U24),
        SampleFormat::U32 => typed_stream!(u32),
        SampleFormat::U64 => typed_stream!(u64),
        SampleFormat::F32 => typed_stream!(f32),
        SampleFormat::F64 => typed_stream!(f64),
        _ => bail!("формат аудиовыхода {format} не поддерживается"),
    }
}

#[allow(clippy::too_many_arguments)]
fn sobrat_stream_dlya_tipa<T>(
    device: &Device,
    config: &StreamConfig,
    chunks: Receiver<AudioChunk>,
    events: Sender<AudioEvent>,
    generation: Arc<AtomicU64>,
    paused: Arc<AtomicBool>,
    volume: Arc<AtomicU32>,
    played_samples: Arc<AtomicU64>,
    buffered_samples: Arc<AtomicU64>,
    duration_ms: Arc<AtomicU64>,
    crossfade_ms: Arc<AtomicU32>,
    agc_enabled: Arc<AtomicBool>,
) -> Result<Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let error_events = events.clone();
    let mut current = Vec::new();
    let mut cursor = 0usize;
    let mut chunk_generation = 0u64;
    let mut audible = false;

    // Нормализация громкости (AGC): скользящий RMS и сглаженное усиление
    let mut rms_sum = 0.0f32;
    let mut sample_count = 0usize;
    let mut current_gain = 1.0f32;
    let sample_rate = config.sample_rate;
    let channels = usize::from(config.channels);
    let samples_per_sec = (sample_rate as usize) * channels;

    let stream = device.build_output_stream(
        *config,
        move |output: &mut [T], _: &OutputCallbackInfo| {
            let active_generation = generation.load(Ordering::Acquire);
            if chunk_generation != active_generation {
                current.clear();
                cursor = 0;
                chunk_generation = active_generation;
                audible = false;
            }
            if paused.load(Ordering::Acquire) {
                output.fill(T::from_sample(0.0));
                return;
            }
            let mut consumed = 0u64;
            let is_agc = agc_enabled.load(Ordering::Relaxed);
            let vol_mul = volume.load(Ordering::Relaxed) as f32 / 100.0;
            let cf_ms = crossfade_ms.load(Ordering::Relaxed) as u64;
            let dur_ms = duration_ms.load(Ordering::Relaxed);
            let base_played = played_samples.load(Ordering::Relaxed);

            for target in output.iter_mut() {
                loop {
                    if cursor < current.len() {
                        let mut value: f32 = current[cursor];
                        cursor += 1;

                        // Применяем Crossfade:
                        // Нарастание только в начале трека (0:00 -> 0:0N).
                        // Затухание только в конце трека (dur - N -> dur).
                        // При перемотке в середину трека громкость сразу 100%.
                        if cf_ms > 0 && samples_per_sec > 0 {
                            let cur_played = base_played + consumed;
                            let cur_pos_ms = (cur_played * 1000) / (samples_per_sec as u64);

                            let fade_in = if cur_pos_ms < cf_ms {
                                (cur_pos_ms as f32 / cf_ms as f32).clamp(0.0, 1.0)
                            } else {
                                1.0f32
                            };

                            let fade_out = if dur_ms > cf_ms * 2
                                && dur_ms >= 20_000
                                && cur_pos_ms >= dur_ms.saturating_sub(cf_ms)
                            {
                                let rem = dur_ms.saturating_sub(cur_pos_ms);
                                (rem as f32 / cf_ms as f32).clamp(0.0, 1.0)
                            } else {
                                1.0f32
                            };

                            let fade = fade_in.min(fade_out);
                            value *= fade;
                        }

                        // Применяем AGC нормализацию громкости
                        if is_agc {
                            rms_sum += value * value;
                            sample_count += 1;
                            if sample_count >= 2048 {
                                let rms = (rms_sum / sample_count as f32).sqrt();
                                rms_sum = 0.0;
                                sample_count = 0;
                                if rms > 0.005 {
                                    // Целевой RMS 0.18 (~ -15 dBFS)
                                    let target_gain = (0.18 / rms).clamp(0.35, 2.8);
                                    current_gain += (target_gain - current_gain) * 0.06;
                                } else {
                                    current_gain += (1.0 - current_gain) * 0.02;
                                }
                            }
                            let normalized: f32 = value * current_gain;
                            // Мягкий лимитер (soft clipper) без щелчков и перегрузки
                            value = if normalized.abs() < 0.75 {
                                normalized
                            } else {
                                (normalized / (1.0 + normalized * normalized * 0.5).sqrt())
                                    .clamp(-1.0, 1.0)
                            };
                        }

                        *target = T::from_sample(value * vol_mul);
                        consumed += 1;
                        if !audible {
                            audible = true;
                            let _ = events.send(AudioEvent::Playing);
                        }
                        break;
                    }
                    match chunks.try_recv() {
                        Ok(chunk) if chunk.generation != active_generation => continue,
                        Ok(chunk) if chunk.end => {
                            let _ = events.send(AudioEvent::Ended);
                            audible = false;
                            *target = T::from_sample(0.0);
                            break;
                        }
                        Ok(chunk) => {
                            chunk_generation = chunk.generation;
                            current = chunk.samples;
                            cursor = 0;
                        }
                        Err(TryRecvError::Empty) => {
                            if audible {
                                audible = false;
                                let _ = events.send(AudioEvent::Buffering);
                            }
                            *target = T::from_sample(0.0);
                            break;
                        }
                        Err(TryRecvError::Disconnected) => {
                            *target = T::from_sample(0.0);
                            break;
                        }
                    }
                }
            }
            played_samples.fetch_add(consumed, Ordering::Relaxed);
            let _ =
                buffered_samples.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |buffered| {
                    Some(buffered.saturating_sub(consumed))
                });
        },
        move |error| {
            let _ = error_events.send(AudioEvent::OutputFailed(error.to_string()));
        },
        None,
    )?;
    Ok(stream)
}
