use serde::Serialize;

/// Erreur unifiée du backend. Sérialisable pour remonter proprement côté UI.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("vault locked")]
    VaultLocked,

    #[error("incorrect password")]
    BadPassword,

    #[error("account not found")]
    AccountNotFound,

    #[error("invalid or expired .ROBLOSECURITY cookie")]
    InvalidCookie,

    #[error("invalid launch target: {0}")]
    BadTarget(String),

    #[error("network error: {0}")]
    Network(String),

    #[error("encryption error")]
    Crypto,

    #[error("I/O error: {0}")]
    Io(String),

    #[error("launch failed: {0}")]
    Launch(String),

    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Network(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

/// Tauri exige que l'erreur d'une commande soit Serialize.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
