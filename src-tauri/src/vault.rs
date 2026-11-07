//! Coffre local chiffré.
//!
//! Les comptes (cookies inclus) sont sérialisés en JSON, puis chiffrés avec
//! AES-256-GCM. La clé est dérivée du mot de passe maître via Argon2id.
//! Le fichier final ne contient que : sel Argon2 + nonce + texte chiffré.
//! Rien n'est jamais écrit en clair sur le disque.

use crate::error::{AppError, Result};
use crate::models::{AccountMeta, StoredAccount, VaultStatus};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use rand::RngCore;
use std::path::PathBuf;
use zeroize::Zeroize;

const MAGIC: &[u8; 4] = b"ROA1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

/// Le coffre en mémoire. `key`/`accounts` ne sont présents qu'une fois déverrouillé.
pub struct Vault {
    path: PathBuf,
    key: Option<[u8; KEY_LEN]>,
    /// Sel Argon2 associé à la clé en mémoire. Réutilisé à chaque écriture pour
    /// que la clé dérivée reste cohérente avec le fichier.
    salt: Option<[u8; SALT_LEN]>,
    accounts: Vec<StoredAccount>,
    unlocked: bool,
}

impl Vault {
    pub fn new() -> Result<Self> {
        let mut dir = dirs::data_local_dir()
            .ok_or_else(|| AppError::Io("dossier de données local introuvable".into()))?;
        dir.push("RoAccount");
        std::fs::create_dir_all(&dir)?;
        dir.push("vault.bin");
        Ok(Vault {
            path: dir,
            key: None,
            salt: None,
            accounts: Vec::new(),
            unlocked: false,
        })
    }

    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    pub fn file_path(&self) -> std::path::PathBuf {
        self.path.clone()
    }

    /// Change le mot de passe maître (après vérification de l'ancien).
    pub fn change_password(&mut self, old: &str, new: &str) -> Result<()> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        let salt = self.salt.ok_or(AppError::VaultLocked)?;
        let key_old = Self::derive_key(old, &salt)?;
        if Some(key_old) != self.key {
            return Err(AppError::BadPassword);
        }
        let mut new_salt = [0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut new_salt);
        let new_key = Self::derive_key(new, &new_salt)?;
        self.salt = Some(new_salt);
        self.key = Some(new_key);
        self.persist()
    }

    pub fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    pub fn status(&self) -> VaultStatus {
        VaultStatus {
            exists: self.exists(),
            unlocked: self.unlocked,
            count: self.accounts.len(),
        }
    }

    /// Dérive une clé AES-256 depuis le mot de passe et le sel.
    fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN]> {
        let mut key = [0u8; KEY_LEN];
        Argon2::default()
            .hash_password_into(password.as_bytes(), salt, &mut key)
            .map_err(|_| AppError::Crypto)?;
        Ok(key)
    }

    /// Crée un nouveau coffre vide protégé par ce mot de passe.
    pub fn create(&mut self, password: &str) -> Result<()> {
        let mut salt = [0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut salt);
        let key = Self::derive_key(password, &salt)?;
        self.salt = Some(salt);
        self.key = Some(key);
        self.accounts = Vec::new();
        self.unlocked = true;
        self.persist()
    }

    /// Déverrouille un coffre existant. Échoue si le mot de passe est faux.
    pub fn unlock(&mut self, password: &str) -> Result<()> {
        let raw = std::fs::read(&self.path)?;
        if raw.len() < 4 + SALT_LEN + NONCE_LEN || &raw[0..4] != MAGIC {
            return Err(AppError::Io("fichier coffre corrompu".into()));
        }
        let salt = &raw[4..4 + SALT_LEN];
        let nonce_bytes = &raw[4 + SALT_LEN..4 + SALT_LEN + NONCE_LEN];
        let ciphertext = &raw[4 + SALT_LEN + NONCE_LEN..];

        let key = Self::derive_key(password, salt)?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let nonce = Nonce::from_slice(nonce_bytes);

        let plain = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| AppError::BadPassword)?;

        let accounts: Vec<StoredAccount> =
            serde_json::from_slice(&plain).map_err(|_| AppError::Crypto)?;

        let mut salt_arr = [0u8; SALT_LEN];
        salt_arr.copy_from_slice(salt);
        self.salt = Some(salt_arr);
        self.key = Some(key);
        self.accounts = accounts;
        self.unlocked = true;
        Ok(())
    }

    /// Verrouille le coffre : efface la clé et les comptes de la mémoire.
    pub fn lock(&mut self) {
        if let Some(mut k) = self.key.take() {
            k.zeroize();
        }
        self.salt = None;
        for a in self.accounts.iter_mut() {
            a.cookie.zeroize();
        }
        self.accounts.clear();
        self.unlocked = false;
    }

    /// Écrit le coffre chiffré sur le disque.
    fn persist(&self) -> Result<()> {
        let key = self.key.ok_or(AppError::VaultLocked)?;
        // Le même sel que celui ayant servi à dériver la clé — sinon le fichier
        // deviendrait indéchiffrable au prochain déverrouillage.
        let salt = self.salt.ok_or(AppError::VaultLocked)?;

        let plain = serde_json::to_vec(&self.accounts).map_err(|_| AppError::Crypto)?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plain.as_slice())
            .map_err(|_| AppError::Crypto)?;

        let mut out = Vec::with_capacity(4 + SALT_LEN + NONCE_LEN + ciphertext.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&salt);
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);

        // écriture atomique : fichier temporaire puis renommage
        let tmp = self.path.with_extension("tmp");
        std::fs::write(&tmp, &out)?;
        std::fs::rename(&tmp, &self.path)?;

        let mut plain = plain;
        plain.zeroize();
        Ok(())
    }

    // --- opérations sur les comptes ---

    pub fn metas(&self) -> Vec<AccountMeta> {
        self.accounts.iter().map(AccountMeta::from).collect()
    }

    pub fn cookie_for(&self, id: &str) -> Result<String> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        self.accounts
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.cookie.clone())
            .ok_or(AppError::AccountNotFound)
    }

    /// (cookie, roblox_id, username) — pour la boucle d'arrière-plan.
    pub fn cookie_meta(&self, id: &str) -> Result<(String, u64, String)> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        self.accounts
            .iter()
            .find(|a| a.id == id)
            .map(|a| (a.cookie.clone(), a.roblox_id, a.username.clone()))
            .ok_or(AppError::AccountNotFound)
    }

    /// Vrai si ce compte est marqué « MAIN ».
    pub fn is_main(&self, id: &str) -> bool {
        self.accounts.iter().any(|a| a.id == id && a.main)
    }

    /// (id, cookie, roblox_id, username) des comptes demandés, dans l'ordre demandé.
    /// MAIN n'est pas filtré ici : l'interface ne l'exclut que de « tout sélectionner »,
    /// un compte MAIN choisi à la main doit se lancer.
    pub fn bulk_targets(&self, ids: &[String]) -> Vec<(String, String, u64, String)> {
        ids.iter()
            .filter_map(|id| self.accounts.iter().find(|a| &a.id == id))
            .map(|a| (a.id.clone(), a.cookie.clone(), a.roblox_id, a.username.clone()))
            .collect()
    }

    pub fn add(&mut self, account: StoredAccount) -> Result<AccountMeta> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        // dédoublonnage par roblox_id
        if let Some(existing) = self
            .accounts
            .iter_mut()
            .find(|a| a.roblox_id == account.roblox_id)
        {
            existing.cookie = account.cookie.clone();
            existing.username = account.username.clone();
            existing.display_name = account.display_name.clone();
            let meta = AccountMeta::from(&*existing);
            self.persist()?;
            return Ok(meta);
        }
        self.accounts.push(account);
        let meta = AccountMeta::from(self.accounts.last().unwrap());
        self.persist()?;
        Ok(meta)
    }

    pub fn remove(&mut self, id: &str) -> Result<()> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        let before = self.accounts.len();
        self.accounts.retain(|a| a.id != id);
        if self.accounts.len() == before {
            return Err(AppError::AccountNotFound);
        }
        self.persist()
    }

    pub fn update_fields(
        &mut self,
        id: &str,
        group: Option<String>,
        alias: Option<String>,
        note: Option<String>,
        favorite: Option<bool>,
        color: Option<String>,
        main: Option<bool>,
    ) -> Result<AccountMeta> {
        if !self.unlocked {
            return Err(AppError::VaultLocked);
        }
        let a = self
            .accounts
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or(AppError::AccountNotFound)?;
        if let Some(g) = group {
            a.group = g;
        }
        if let Some(al) = alias {
            a.alias = al;
        }
        if let Some(n) = note {
            a.note = n;
        }
        if let Some(f) = favorite {
            a.favorite = f;
        }
        if let Some(c) = color {
            a.color = c;
        }
        if let Some(m) = main {
            a.main = m;
        }
        let meta = AccountMeta::from(&*a);
        self.persist()?;
        Ok(meta)
    }
}
