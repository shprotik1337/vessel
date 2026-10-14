/// Свернуть окно
#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// Переключить разворачивание окна на весь экран
#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// Проверить, развернуто ли окно
#[tauri::command]
pub fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

/// Закрыть окно (свернуть в системный трей)
#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

/// Начать перемещение окна (drag)
#[tauri::command]
pub fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}
