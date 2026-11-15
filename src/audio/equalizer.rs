use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

pub const EQ_BANDS: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];
pub const EQ_BAND_Q: f32 = 1.4;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        // Wire / passthrough filter
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct BiquadState {
    pub s1: f32,
    pub s2: f32,
}

impl BiquadState {
    #[inline(always)]
    pub fn process(&mut self, x: f32, c: &BiquadCoeffs) -> f32 {
        let y = c.b0 * x + self.s1;
        self.s1 = c.b1 * x - c.a1 * y + self.s2;
        self.s2 = c.b2 * x - c.a2 * y;
        y
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

/// Вычисление коэффициентов RBJ Audio EQ Cookbook
pub fn compute_biquad_coeffs(
    band_idx: usize,
    freq: f32,
    sample_rate: f32,
    gain_db: f32,
    q: f32,
) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 {
        return BiquadCoeffs::default();
    }

    let clamped_gain = gain_db.clamp(-12.0, 12.0);
    let a = 10.0f32.powf(clamped_gain / 40.0);
    let nyquist = sample_rate * 0.5;
    let clamped_freq = freq.clamp(10.0, nyquist - 100.0);
    let w0 = 2.0 * std::f32::consts::PI * clamped_freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    if band_idx == 0 {
        // Low shelf (32 Hz)
        let beta = 2.0 * a.sqrt() * alpha;
        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + beta);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - beta);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + beta;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - beta;

        let inv_a0 = 1.0 / a0;
        BiquadCoeffs {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    } else if band_idx == EQ_BANDS.len() - 1 {
        // High shelf (16000 Hz)
        let beta = 2.0 * a.sqrt() * alpha;
        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + beta);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - beta);
        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + beta;
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - beta;

        let inv_a0 = 1.0 / a0;
        BiquadCoeffs {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    } else {
        // Peaking EQ (64 .. 8000 Hz)
        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha / a;

        let inv_a0 = 1.0 / a0;
        BiquadCoeffs {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }
}

pub struct SharedEqualizer {
    pub enabled: AtomicBool,
    pub gains: [AtomicU32; 10],
}

impl Default for SharedEqualizer {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            gains: [
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
                AtomicU32::new(0.0f32.to_bits()),
            ],
        }
    }
}

impl SharedEqualizer {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn set_params(&self, enabled: bool, gains: &[f32]) {
        let is_any_gain = gains.iter().any(|g| g.abs() > 0.01);
        self.enabled.store(enabled && is_any_gain, Ordering::Release);

        for (i, slot) in self.gains.iter().enumerate() {
            let gain = gains.get(i).copied().unwrap_or(0.0).clamp(-12.0, 12.0);
            slot.store(gain.to_bits(), Ordering::Release);
        }
    }

    pub fn get_params(&self) -> (bool, Vec<f32>) {
        let enabled = self.enabled.load(Ordering::Acquire);
        let gains = self
            .gains
            .iter()
            .map(|g| f32::from_bits(g.load(Ordering::Acquire)))
            .collect();
        (enabled, gains)
    }
}

pub struct EqualizerDSP {
    sample_rate: f32,
    channels: usize,
    enabled: bool,
    cached_gains: [f32; 10],
    preamp_gain: f32,
    coeffs: [BiquadCoeffs; 10],
    channel_states: Vec<[BiquadState; 10]>,
}

impl EqualizerDSP {
    pub fn new(sample_rate: f32, channels: usize) -> Self {
        let ch = channels.max(1);
        Self {
            sample_rate,
            channels: ch,
            enabled: false,
            cached_gains: [0.0; 10],
            preamp_gain: 1.0,
            coeffs: [BiquadCoeffs::default(); 10],
            channel_states: vec![[BiquadState::default(); 10]; ch],
        }
    }

    #[inline]
    pub fn sync_from_shared(&mut self, shared: &SharedEqualizer) {
        let new_enabled = shared.enabled.load(Ordering::Relaxed);
        let mut gains_changed = false;
        let mut new_gains = [0.0f32; 10];

        for i in 0..10 {
            new_gains[i] = f32::from_bits(shared.gains[i].load(Ordering::Relaxed));
            if (new_gains[i] - self.cached_gains[i]).abs() > 0.01 {
                gains_changed = true;
            }
        }

        if gains_changed || (new_enabled != self.enabled && new_enabled) {
            self.cached_gains = new_gains;
            let max_boost = new_gains.iter().copied().fold(0.0f32, f32::max);
            let preamp_db = -max_boost;
            self.preamp_gain = 10.0f32.powf(preamp_db / 20.0);

            for (i, &freq) in EQ_BANDS.iter().enumerate() {
                self.coeffs[i] = compute_biquad_coeffs(
                    i,
                    freq,
                    self.sample_rate,
                    new_gains[i],
                    EQ_BAND_Q,
                );
            }
        }

        if !new_enabled && self.enabled {
            for states in &mut self.channel_states {
                for s in states.iter_mut() {
                    s.reset();
                }
            }
        }

        self.enabled = new_enabled;
    }

    #[inline(always)]
    pub fn process_sample(&mut self, channel: usize, mut sample: f32) -> f32 {
        if !self.enabled {
            return sample;
        }

        sample *= self.preamp_gain;
        let ch = channel % self.channels;
        let states = &mut self.channel_states[ch];

        for i in 0..10 {
            sample = states[i].process(sample, &self.coeffs[i]);
        }

        sample
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flat_coeffs_passthrough() {
        let coeffs = BiquadCoeffs::default();
        let mut state = BiquadState::default();
        let out = state.process(0.5, &coeffs);
        assert!((out - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_shared_equalizer_update() {
        let shared = SharedEqualizer::new();
        shared.set_params(true, &[3.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
        let (enabled, gains) = shared.get_params();
        assert!(enabled);
        assert!((gains[0] - 3.0).abs() < 1e-4);

        let mut dsp = EqualizerDSP::new(44100.0, 2);
        dsp.sync_from_shared(&shared);
        assert!(dsp.enabled);
        assert!(dsp.preamp_gain < 1.0); // -3 dB preamp
    }
}
