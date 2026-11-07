//! Multi-instance Roblox.
//!
//! Roblox applique un verrou d'instance unique via un mutex nommé
//! `ROBLOX_singletonEvent` : le premier client le crée et devient « l'instance
//! unique » ; les suivants voient qu'il existe et refusent de démarrer.
//!
//! En créant ce mutex nous-mêmes au lancement de RoAccount et en gardant le
//! handle ouvert pour toute la vie du process, Roblox ne devient jamais le
//! créateur : il n'endosse donc pas le rôle d'instance unique, et plusieurs
//! clients peuvent tourner côte à côte.

use std::sync::atomic::{AtomicU8, Ordering};

/// 0 = non demandé · 1 = verrou pris par RoAccount · 2 = le mutex existait déjà (un Roblox tournait avant nous)
/// · 3 = échec de la création.
static STATE: AtomicU8 = AtomicU8::new(0);

/// État du verrou multi-instance (voir `STATE`).
pub fn state() -> u8 {
    STATE.load(Ordering::Relaxed)
}

#[cfg(windows)]
pub fn hold() {
    use windows::core::w;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    unsafe {
        // binitialowner = false : on ne demande pas la propriété, juste l'existence.
        // Le handle renvoyé n'est volontairement pas fermé : il reste ouvert
        // jusqu'à la fin du process, ce qui maintient le mutex en vie.
        match CreateMutexW(None, false, w!("ROBLOX_singletonEvent")) {
            Ok(_) => {
                let already = GetLastError() == ERROR_ALREADY_EXISTS;
                STATE.store(if already { 2 } else { 1 }, Ordering::Relaxed);
            }
            Err(_) => STATE.store(3, Ordering::Relaxed),
        }
        // même verrou sous le nom utilisé par les clients plus anciens
        let _ = CreateMutexW(None, false, w!("ROBLOX_singletonMutex"));
    }
}

#[cfg(not(windows))]
pub fn hold() {}
