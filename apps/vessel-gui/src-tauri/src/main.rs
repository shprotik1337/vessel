// Без консольного окна в release-сборке (debug остаётся с консолью).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod single_instance {
    use std::ptr::null_mut;

    extern "system" {
        fn CreateMutexW(lpMutexAttributes: *mut std::ffi::c_void, bInitialOwner: i32, lpName: *const u16) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut std::ffi::c_void;
        fn ShowWindow(hWnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
        fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
    }

    const ERROR_ALREADY_EXISTS: u32 = 183;
    const SW_RESTORE: i32 = 9;

    pub struct MutexGuard(*mut std::ffi::c_void);
    impl Drop for MutexGuard {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CloseHandle(self.0) };
            }
        }
    }

    pub fn acquire() -> Option<MutexGuard> {
        let name: Vec<u16> = "Local\\VesselMusicAppSingleInstanceMutex\0".encode_utf16().collect();
        unsafe {
            let handle = CreateMutexW(null_mut(), 1, name.as_ptr());
            let err = GetLastError();
            if err == ERROR_ALREADY_EXISTS {
                if !handle.is_null() {
                    CloseHandle(handle);
                }
                let title: Vec<u16> = "Vessel\0".encode_utf16().collect();
                let hwnd = FindWindowW(null_mut(), title.as_ptr());
                if !hwnd.is_null() {
                    ShowWindow(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd);
                }
                return None;
            }
            if handle.is_null() {
                return Some(MutexGuard(null_mut()));
            }
            Some(MutexGuard(handle))
        }
    }
}

fn main() {
    #[cfg(windows)]
    let _instance_guard = match single_instance::acquire() {
        Some(guard) => guard,
        None => {
            // Уже запущено другое окно приложения, вывели его на передний план
            return;
        }
    };

    let log_path = "C:\\Users\\smiling knight\\AppData\\Roaming\\vessel\\vessel\\data\\startup-debug.log";
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[startup] main entered at {:?}", std::time::SystemTime::now())
        });

    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}\n");
        eprintln!("{msg}");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("C:\\Users\\smiling knight\\AppData\\Roaming\\vessel\\vessel\\data\\startup-debug.log")
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(msg.as_bytes())
            });
    }));

    match vessel::run() {
        Ok(()) => {
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("C:\\Users\\smiling knight\\AppData\\Roaming\\vessel\\vessel\\data\\startup-debug.log")
                .and_then(|mut f| {
                    use std::io::Write;
                    f.write_all(b"[startup] vessel::run() returned Ok(())\n")
                });
        }
        Err(e) => {
            let msg = format!("[startup] vessel::run() returned Err: {e:?}\n");
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("C:\\Users\\smiling knight\\AppData\\Roaming\\vessel\\vessel\\data\\startup-debug.log")
                .and_then(|mut f| {
                    use std::io::Write;
                    f.write_all(msg.as_bytes())
                });
        }
    }
}
