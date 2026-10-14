use aes::{
    Aes128,
    cipher::{BlockEncrypt, KeyInit as AesKeyInit, generic_array::GenericArray},
};
use anyhow::{Context, Result, bail};
use blowfish::Blowfish;
use cbc::{
    Decryptor,
    cipher::{BlockDecryptMut, KeyIvInit, block_padding::NoPadding},
};
use serde_json::Value;

use super::mapping::raw_value;

pub const LEGACY_AES_KEY: &[u8; 16] = b"jo6aey6haid2Teih";
pub const BF_SECRET: &[u8; 16] = b"g4el58wc0zvf9na1";
pub const BF_IV: [u8; 8] = [0, 1, 2, 3, 4, 5, 6, 7];
pub const ENCRYPTED_CHUNK: usize = 2048;

pub fn decrypt_audio(encrypted: &[u8], track_id: &str) -> Result<Vec<u8>> {
    let key = blowfish_key(track_id);
    let mut output = Vec::with_capacity(encrypted.len());
    for (index, chunk) in encrypted.chunks(ENCRYPTED_CHUNK).enumerate() {
        if chunk.len() == ENCRYPTED_CHUNK && index % 3 == 0 {
            let mut buffer = chunk.to_vec();
            let decryptor = Decryptor::<Blowfish>::new_from_slices(&key, &BF_IV)
                .map_err(|error| anyhow::anyhow!("Deezer Blowfish init: {error}"))?;
            let decoded = decryptor
                .decrypt_padded_mut::<NoPadding>(&mut buffer)
                .map_err(|error| anyhow::anyhow!("Deezer Blowfish decrypt: {error}"))?;
            output.extend_from_slice(decoded);
        } else {
            output.extend_from_slice(chunk);
        }
    }
    Ok(output)
}

pub fn blowfish_key(track_id: &str) -> [u8; 16] {
    let digest = format!("{:x}", md5::compute(track_id.as_bytes()));
    let bytes = digest.as_bytes();
    let mut key = [0; 16];
    for index in 0..16 {
        key[index] = bytes[index] ^ bytes[index + 16] ^ BF_SECRET[index];
    }
    key
}

pub fn legacy_urls(raw: &Value, format: &str) -> Result<Vec<String>> {
    let track_id = raw_value(raw, "SNG_ID");
    let md5_origin = raw_value(raw, "MD5_ORIGIN");
    let media_version = raw_value(raw, "MEDIA_VERSION");
    let format_code = match format {
        "MP3_128" => "1",
        "MP3_320" => "3",
        "FLAC" => "9",
        _ => bail!("неподдерживаемый Deezer legacy format: {format}"),
    };
    if track_id.is_empty()
        || md5_origin.is_empty()
        || md5_origin == "0"
        || media_version.is_empty()
    {
        bail!("не хватает legacy-метаданных Deezer")
    }
    [b'.', 0]
        .into_iter()
        .map(|padding| legacy_url(&track_id, &md5_origin, &media_version, format_code, padding))
        .collect()
}

pub fn legacy_url(
    track_id: &str,
    md5_origin: &str,
    media_version: &str,
    format_code: &str,
    padding: u8,
) -> Result<String> {
    let mut step = Vec::new();
    for (index, value) in [md5_origin, format_code, track_id, media_version]
        .into_iter()
        .enumerate()
    {
        if index > 0 {
            step.push(0xa4);
        }
        step.extend_from_slice(value.as_bytes());
    }
    let checksum = format!("{:x}", md5::compute(&step));
    let mut encrypted = Vec::new();
    encrypted.extend_from_slice(checksum.as_bytes());
    encrypted.push(0xa4);
    encrypted.extend_from_slice(&step);
    encrypted.push(0xa4);
    let remainder = encrypted.len() % 16;
    let padding_len = if remainder == 0 {
        if padding == b'.' { 16 } else { 0 }
    } else {
        16 - remainder
    };
    encrypted.extend(std::iter::repeat_n(padding, padding_len));
    let cipher = Aes128::new(GenericArray::from_slice(LEGACY_AES_KEY));
    for chunk in encrypted.chunks_exact_mut(16) {
        cipher.encrypt_block(GenericArray::from_mut_slice(chunk));
    }
    let shard = md5_origin.chars().next().context("нет Deezer CDN shard")?;
    Ok(format!(
        "https://e-cdns-proxy-{shard}.dzcdn.net/mobile/1/{}",
        hex::encode(encrypted)
    ))
}
