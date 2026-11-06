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

#[cfg(windows)]
pub fn hold() {
    use windows::core::w;
    use windows::Win32::System::Threading::CreateMutexW;

    unsafe {
        // binitialowner = false : on ne demande pas la propriété, juste l'existence.
        // Le handle renvoyé n'est volontairement pas fermé : il reste ouvert
        // jusqu'à la fin du process, ce qui maintient le mutex en vie.
        let _ = CreateMutexW(None, false, w!("ROBLOX_singletonEvent"));
    }
}

#[cfg(not(windows))]
pub fn hold() {}
