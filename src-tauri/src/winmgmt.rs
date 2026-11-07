//! Gestion système des clients Roblox (Windows) :
//! - arranger les fenêtres (grille « Fit » ou vignettes « Tiny »),
//! - changer la priorité CPU d'un process,
//! - détecter les fenêtres figées,
//! - couper / rétablir le son d'un process.

#[cfg(windows)]
mod win {
    use std::collections::HashSet;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetSystemMetrics, GetWindowTextLengthW, GetWindowThreadProcessId,
        IsHungAppWindow, IsWindowVisible, MoveWindow, ShowWindow, SystemParametersInfoW,
        SM_CXSCREEN, SM_CYSCREEN, SPI_GETWORKAREA, SW_RESTORE, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };

    struct Ctx {
        pids: HashSet<u32>,
        hwnds: Vec<(HWND, u32)>,
    }

    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut Ctx);
        if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if ctx.pids.contains(&pid) {
                ctx.hwnds.push((hwnd, pid));
            }
        }
        BOOL(1)
    }

    /// Fenêtres visibles appartenant aux PID donnés.
    fn windows_of(pids: Vec<u32>) -> Vec<(HWND, u32)> {
        let mut ctx = Ctx { pids: pids.into_iter().collect(), hwnds: Vec::new() };
        unsafe {
            let _ = EnumWindows(Some(cb), LPARAM(&mut ctx as *mut Ctx as isize));
        }
        ctx.hwnds
    }

    /// Zone utile de l'écran (sans la barre des tâches).
    fn work_area() -> (i32, i32, i32, i32) {
        unsafe {
            let mut r = RECT::default();
            let ok = SystemParametersInfoW(
                SPI_GETWORKAREA,
                0,
                Some(&mut r as *mut RECT as *mut core::ffi::c_void),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .is_ok();
            if ok && r.right > r.left && r.bottom > r.top {
                (r.left, r.top, r.right - r.left, r.bottom - r.top)
            } else {
                (0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN))
            }
        }
    }

    pub fn arrange(pids: Vec<u32>, layout: &str) {
        let wins = windows_of(pids);
        let n = wins.len() as i32;
        if n == 0 {
            return;
        }
        let (x0, y0, sw, sh) = work_area();

        // (colonnes, largeur, hauteur) selon la disposition
        let (cols, cw, ch) = if layout == "tiny" {
            // vignettes 384×240 posées en rangées depuis le coin haut-gauche
            let (tw, th) = (384, 240);
            ((sw / tw).max(1), tw, th)
        } else {
            // « Fit » : grille qui remplit tout l'écran utile
            let cols = ((n as f64).sqrt().ceil() as i32).max(1);
            let rows = ((n + cols - 1) / cols).max(1);
            (cols, sw / cols, sh / rows)
        };

        unsafe {
            for (i, (hwnd, _)) in wins.into_iter().enumerate() {
                let i = i as i32;
                let col = i % cols;
                let row = i / cols;
                let _ = ShowWindow(hwnd, SW_RESTORE);
                let _ = MoveWindow(hwnd, x0 + col * cw, y0 + row * ch, cw, ch, true);
            }
        }
    }

    /// PID dont la fenêtre principale ne répond plus.
    pub fn hung_pids(pids: Vec<u32>) -> Vec<u32> {
        let mut out: Vec<u32> = Vec::new();
        for (hwnd, pid) in windows_of(pids) {
            if unsafe { IsHungAppWindow(hwnd).as_bool() } && !out.contains(&pid) {
                out.push(pid);
            }
        }
        out
    }

    pub fn set_priority(pid: u32, level: &str) -> bool {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{
            OpenProcess, SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS, IDLE_PRIORITY_CLASS,
            NORMAL_PRIORITY_CLASS, PROCESS_SET_INFORMATION,
        };

        let class = match level {
            "idle" => IDLE_PRIORITY_CLASS,
            "below" => BELOW_NORMAL_PRIORITY_CLASS,
            _ => NORMAL_PRIORITY_CLASS,
        };

        unsafe {
            match OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
                Ok(h) => {
                    let ok = SetPriorityClass(h, class).is_ok();
                    let _ = CloseHandle(h);
                    ok
                }
                Err(_) => false,
            }
        }
    }

    /// Coupe (ou rétablit) le son des sessions audio des PID donnés.
    /// Renvoie le nombre de sessions modifiées.
    pub fn mute_pids(pids: &[u32], mute: bool) -> usize {
        use windows::core::Interface;
        use windows::Win32::Media::Audio::{
            eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2,
            IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
        };

        if pids.is_empty() {
            return 0;
        }
        let mut changed = 0usize;
        unsafe {
            // S_FALSE / RPC_E_CHANGED_MODE sont sans gravité ici
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let run = || -> windows::core::Result<usize> {
                let mut n = 0usize;
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
                let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
                let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
                let sessions = mgr.GetSessionEnumerator()?;
                for i in 0..sessions.GetCount()? {
                    let ctrl = sessions.GetSession(i)?;
                    let ctrl2: IAudioSessionControl2 = ctrl.cast()?;
                    let pid = ctrl2.GetProcessId().unwrap_or(0);
                    if pid != 0 && pids.contains(&pid) {
                        let vol: ISimpleAudioVolume = ctrl.cast()?;
                        if vol.SetMute(mute, std::ptr::null()).is_ok() {
                            n += 1;
                        }
                    }
                }
                Ok(n)
            };
            if let Ok(n) = run() {
                changed = n;
            }
        }
        changed
    }

    /// Affiche (restaure + premier plan) ou réduit les fenêtres des PID donnés.
    pub fn show_windows(pids: Vec<u32>, minimize: bool) -> usize {
        use windows::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, SW_MINIMIZE};
        let wins = windows_of(pids);
        let n = wins.len();
        unsafe {
            for (hwnd, _) in wins {
                if minimize {
                    let _ = ShowWindow(hwnd, SW_MINIMIZE);
                } else {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetForegroundWindow(hwnd);
                }
            }
        }
        n
    }

    /// PID du process qui possède la fenêtre au premier plan.
    pub fn foreground_pid() -> u32 {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        unsafe {
            let hwnd = GetForegroundWindow();
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            pid
        }
    }

    /// Décharge la mémoire de travail d'un process sur le disque.
    pub fn trim_memory(pid: u32) -> bool {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA};
        unsafe {
            match OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, false, pid) {
                Ok(h) => {
                    let ok = EmptyWorkingSet(h).is_ok();
                    let _ = CloseHandle(h);
                    ok
                }
                Err(_) => false,
            }
        }
    }

    /// Limite un process à certains cœurs (masque de bits).
    pub fn set_affinity(pid: u32, mask: usize) -> bool {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, SetProcessAffinityMask, PROCESS_SET_INFORMATION};
        unsafe {
            match OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
                Ok(h) => {
                    let ok = SetProcessAffinityMask(h, mask).is_ok();
                    let _ = CloseHandle(h);
                    ok
                }
                Err(_) => false,
            }
        }
    }
}

#[cfg(windows)]
pub use win::{arrange, foreground_pid, hung_pids, mute_pids, set_affinity, set_priority, show_windows, trim_memory};

#[cfg(not(windows))]
pub fn arrange(_pids: Vec<u32>, _layout: &str) {}
#[cfg(not(windows))]
pub fn hung_pids(_pids: Vec<u32>) -> Vec<u32> {
    Vec::new()
}
#[cfg(not(windows))]
pub fn mute_pids(_pids: &[u32], _mute: bool) -> usize {
    0
}
#[cfg(not(windows))]
pub fn set_priority(_pid: u32, _level: &str) -> bool {
    false
}
#[cfg(not(windows))]
pub fn show_windows(_pids: Vec<u32>, _minimize: bool) -> usize {
    0
}
#[cfg(not(windows))]
pub fn foreground_pid() -> u32 {
    0
}
#[cfg(not(windows))]
pub fn trim_memory(_pid: u32) -> bool {
    false
}
#[cfg(not(windows))]
pub fn set_affinity(_pid: u32, _mask: usize) -> bool {
    false
}
