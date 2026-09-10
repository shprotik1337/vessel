// Без консольного окна в release-сборке (debug остаётся с консолью).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vessel::run()
}
