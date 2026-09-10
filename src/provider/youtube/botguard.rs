//! Mint content-bound PO token через BotGuard (метод Kopuz, EUPL-1.2).
//!
//! Анонимные (и free-tier) запросы ANDROID_VR без POT отдают стримы,
//! rate-limited до первого MiB — глубокие range-запросы 403. Content-bound
//! PO token в `serviceIntegrityDimensions.poToken` снимает лимит.
//! Крейт `rustypipe-botguard` (MIT): V8-изолят в выделенном потоке.
//!
//! ВАЖНО: **POT не кэшируется** — токен одноразово привязывается к
//! player-запросу, повторное использование отклоняется. Минтим свежий на
//! каждый resolve; изолят Botguard живёт в отдельном потоке постоянно
//! (дорогой init ~2-5 сек один раз, затем mint быстрый — модель Kopuz).

use std::sync::OnceLock;

use anyhow::{Context, Result};
use tokio::sync::{mpsc, oneshot};

struct MintRequest {
    video_id: String,
    reply: oneshot::Sender<Result<String>>,
}

static MINTER: OnceLock<mpsc::UnboundedSender<MintRequest>> = OnceLock::new();

/// Mint content-bound PO token для video_id. Свежий токен на каждый вызов.
pub async fn mint_content_pot(video_id: &str) -> Result<String> {
    let tx = MINTER.get_or_init(|| {
        let (tx, rx) = mpsc::unbounded_channel::<MintRequest>();
        std::thread::Builder::new()
            .name("vessel-botguard".into())
            .spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("botguard runtime");
                rt.block_on(run_minter(rx));
            })
            .expect("spawn botguard thread");
        tx
    });

    let (reply_tx, reply_rx) = oneshot::channel();
    tx.send(MintRequest { video_id: video_id.to_string(), reply: reply_tx })
        .map_err(|_| anyhow::anyhow!("botguard channel closed"))?;
    reply_rx.await.context("botguard mint dropped")?
}

async fn run_minter(mut rx: mpsc::UnboundedReceiver<MintRequest>) {
    let mut bg = match rustypipe_botguard::BotguardBuilder::new().init().await {
        Ok(bg) => bg,
        Err(e) => {
            crate::dlog!("[POT] botguard init failed: {e}");
            while let Ok(req) = rx.try_recv() {
                let _ = req.reply.send(Err(anyhow::anyhow!("botguard init: {e}")));
            }
            return;
        }
    };
    crate::dlog!("[POT] botguard ready");
    while let Some(req) = rx.recv().await {
        match bg.mint_token(&req.video_id).await {
            Ok(token) => {
                crate::dlog!("[POT] minted len={} for {}", token.len(), req.video_id);
                let _ = req.reply.send(Ok(token));
            }
            Err(e) => {
                crate::dlog!("[POT] mint failed for {}: {e}", req.video_id);
                let _ = req.reply.send(Err(anyhow::anyhow!("botguard mint: {e}")));
            }
        }
    }
}
