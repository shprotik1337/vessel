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
    equalizer: Arc<crate::audio::equalizer::SharedEqualizer>,
    preamp_db: Arc<AtomicU32>,
    speed_rate: Arc<AtomicU32>,
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
                equalizer,
                preamp_db,
                speed_rate,
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
    equalizer: Arc<crate::audio::equalizer::SharedEqualizer>,
    preamp_db: Arc<AtomicU32>,
    speed_rate: Arc<AtomicU32>,
) -> Result<Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let error_events = events.clone();
    let mut current: Vec<f32> = Vec::new();
    let mut chunk_generation = 0u64;
    let mut audible = false;

    // Эквалайзер (10-полосный RBJ IIR каскад) и ресемплер скорости (без аллокаций в колбэке)
    let sample_rate = config.sample_rate;
    let channels = usize::from(config.channels).max(1);
    let mut eq_dsp = crate::audio::equalizer::EqualizerDSP::new(sample_rate as f32, channels);
    let mut prev_frame = vec![0.0f32; channels];
    let mut has_prev_frame = false;
    let mut frame_pos = 0.0f64;
    let mut frame_buf = vec![0.0f32; channels];
    let mut frame_ready = false;
    let mut out_ch = 0usize;
    let mut source_sample_frac = 0.0f64;

    // Нормализация громкости (AGC): скользящий RMS и сглаженное усиление
    let mut rms_sum = 0.0f32;
    let mut sample_count = 0usize;
    let mut current_gain = 1.0f32;
    let samples_per_sec = (sample_rate as usize) * channels;

    let stream = device.build_output_stream(
        *config,
        move |output: &mut [T], _: &OutputCallbackInfo| {
            let active_generation = generation.load(Ordering::Acquire);
            if chunk_generation != active_generation {
                current.clear();
                has_prev_frame = false;
                frame_pos = 0.0;
                frame_ready = false;
                out_ch = 0;
                source_sample_frac = 0.0;
                chunk_generation = active_generation;
                audible = false;
            }
            if paused.load(Ordering::Acquire) {
                output.fill(T::from_sample(0.0));
                return;
            }
            let mut consumed = 0u64;
            let is_agc = agc_enabled.load(Ordering::Relaxed);
            let raw_vol = (volume.load(Ordering::Relaxed) as f32 / 100.0).clamp(0.0, 1.0);
            let vol_mul = raw_vol * raw_vol;
            let cf_ms = crossfade_ms.load(Ordering::Relaxed) as u64;
            let dur_ms = duration_ms.load(Ordering::Relaxed);
            let base_played = played_samples.load(Ordering::Relaxed);
            let rate = f64::from(f32::from_bits(speed_rate.load(Ordering::Relaxed))).clamp(0.5, 2.0);
            let preamp_val_db = f32::from_bits(preamp_db.load(Ordering::Relaxed)).clamp(0.0, 12.0);
            let preamp_mul = if preamp_val_db > 0.01 {
                10.0f32.powf(preamp_val_db / 20.0)
            } else {
                1.0
            };
            eq_dsp.sync_from_shared(&equalizer);

            for target in output.iter_mut() {
                if out_ch == 0 {
                    frame_ready = false;
                    loop {
                        let total_frames = current.len() / channels;
                        if total_frames > 0 && frame_pos <= (total_frames - 1) as f64 {
                            if frame_pos < 0.0 {
                                if has_prev_frame {
                                    let t = (frame_pos + 1.0).clamp(0.0, 1.0) as f32;
                                    for ch in 0..channels {
                                        let s0 = prev_frame[ch];
                                        let s1 = current[ch];
                                        frame_buf[ch] = s0 + (s1 - s0) * t;
                                    }
                                } else {
                                    frame_buf[..channels].copy_from_slice(&current[..channels]);
                                }
                            } else {
                                let idx0 = frame_pos.floor() as usize;
                                let frac = (frame_pos - (idx0 as f64)) as f32;
                                let base0 = idx0 * channels;
                                if frac <= 1e-6 || idx0 + 1 >= total_frames {
                                    frame_buf[..channels]
                                        .copy_from_slice(&current[base0..base0 + channels]);
                                } else {
                                    let base1 = base0 + channels;
                                    for ch in 0..channels {
                                        let s0 = current[base0 + ch];
                                        let s1 = current[base1 + ch];
                                        frame_buf[ch] = s0 + (s1 - s0) * frac;
                                    }
                                }
                            }

                            frame_pos += rate;
                            source_sample_frac += rate * (channels as f64);
                            let whole = source_sample_frac.floor() as u64;
                            source_sample_frac -= whole as f64;
                            consumed += whole;
                            frame_ready = true;
                            break;
                        }

                        if total_frames > 0 {
                            let last_base = (total_frames - 1) * channels;
                            prev_frame[..channels]
                                .copy_from_slice(&current[last_base..last_base + channels]);
                            has_prev_frame = true;
                            frame_pos -= total_frames as f64;
                            current.clear();
                        }

                        match chunks.try_recv() {
                            Ok(chunk) if chunk.generation != active_generation => continue,
                            Ok(chunk) if chunk.end => {
                                let _ = events.send(AudioEvent::Ended);
                                audible = false;
                                has_prev_frame = false;
                                frame_pos = 0.0;
                                break;
                            }
                            Ok(chunk) => {
                                chunk_generation = chunk.generation;
                                current = chunk.samples;
                            }
                            Err(TryRecvError::Empty) => {
                                if audible {
                                    audible = false;
                                    let _ = events.send(AudioEvent::Buffering);
                                }
                                break;
                            }
                            Err(TryRecvError::Disconnected) => {
                                break;
                            }
                        }
                    }
                }

                if !frame_ready {
                    *target = T::from_sample(0.0);
                    out_ch = (out_ch + 1) % channels;
                    continue;
                }

                let mut value = frame_buf[out_ch];

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

                // Применяем 10-полосный эквалайзер
                value = eq_dsp.process_sample(out_ch, value);

                // Применяем пользовательское усиление (preamp 0..+12 дБ) независимо от полос EQ
                if preamp_mul > 1.001 {
                    value *= preamp_mul;
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
                    value *= current_gain;
                }

                // Плавный C1 soft limiter при AGC или усилении (без хрипа и жёсткого клиппинга)
                if is_agc || preamp_mul > 1.001 {
                    let abs = value.abs();
                    if abs > 0.75 {
                        let over = (abs - 0.75) / 0.25;
                        value = value.signum() * (0.75 + 0.25 * over.tanh());
                    }
                }

                *target = T::from_sample((value * vol_mul).clamp(-1.0, 1.0));
                if !audible {
                    audible = true;
                    let _ = events.send(AudioEvent::Playing);
                }
                out_ch = (out_ch + 1) % channels;
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
