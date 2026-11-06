use std::path::Path;
use redb::{Database, ReadableTable, TableDefinition};

use crate::crypto::VaultCrypto;
use otium_core::{OtiumError, Result};

const DOC_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("documents");
const PROGRESS_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("progress");
const SETTINGS_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("settings");

pub struct SovereignVault {
    db: Database,
    key: Option<[u8; 32]>,
}

impl SovereignVault {
    /// Open or create an embedded Redb database file
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = Database::create(path)
            .map_err(|e| OtiumError::Vault(format!("Failed to open database: {e}")))?;

        // Ensure tables exist
        let write_txn = db
            .begin_write()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;
        {
            let _ = write_txn.open_table(DOC_TABLE);
            let _ = write_txn.open_table(PROGRESS_TABLE);
            let _ = write_txn.open_table(SETTINGS_TABLE);
        }
        write_txn
            .commit()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        Ok(Self { db, key: None })
    }

    /// Unlock the vault with master encryption key
    pub fn unlock(&mut self, key: [u8; 32]) {
        self.key = Some(key);
    }

    pub fn lock(&mut self) {
        self.key = None;
    }

    pub fn is_unlocked(&self) -> bool {
        self.key.is_some()
    }

    /// Store an encrypted document payload
    pub fn put_document(&self, doc_id: &str, data: &[u8]) -> Result<()> {
        let payload = if let Some(ref key) = self.key {
            VaultCrypto::encrypt(key, data)?
        } else {
            data.to_vec()
        };

        let write_txn = self
            .db
            .begin_write()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;
        {
            let mut table = write_txn
                .open_table(DOC_TABLE)
                .map_err(|e| OtiumError::Vault(e.to_string()))?;
            table
                .insert(doc_id, payload.as_slice())
                .map_err(|e| OtiumError::Vault(e.to_string()))?;
        }
        write_txn
            .commit()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        Ok(())
    }

    /// Retrieve and decrypt a document payload
    pub fn get_document(&self, doc_id: &str) -> Result<Option<Vec<u8>>> {
        let read_txn = self
            .db
            .begin_read()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;
        let table = read_txn
            .open_table(DOC_TABLE)
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        if let Some(entry) = table.get(doc_id).map_err(|e| OtiumError::Vault(e.to_string()))? {
            let val = entry.value();
            let decrypted = if let Some(ref key) = self.key {
                VaultCrypto::decrypt(key, val)?
            } else {
                val.to_vec()
            };
            Ok(Some(decrypted))
        } else {
            Ok(None)
        }
    }

    /// List all document IDs stored in the vault
    pub fn list_documents(&self) -> Result<Vec<String>> {
        let read_txn = self
            .db
            .begin_read()
            .map_err(|e| OtiumError::Vault(e.to_string()))?;
        let table = read_txn
            .open_table(DOC_TABLE)
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        let mut list = Vec::new();
        let iter = table.iter().map_err(|e| OtiumError::Vault(e.to_string()))?;
        for item in iter {
            let (key, _) = item.map_err(|e| OtiumError::Vault(e.to_string()))?;
            list.push(key.value().to_string());
        }
        Ok(list)
    }
}
