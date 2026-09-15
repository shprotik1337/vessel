// Без консольного окна в release-сборке (debug остаётся с консолью).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}\n");
        eprintln!("{msg}");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("vessel-panic.log") {
            use std::io::Write;
            let _ = f.write_all(msg.as_bytes());
        }
    }));
    vessel::run().expect("failed to run vessel")
}
