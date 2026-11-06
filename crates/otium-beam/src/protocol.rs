use serde::{Deserialize, Serialize};
use uuid::Uuid;

use otium_ink::Stroke;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum BeamMessage {
    /// Initial pairing handshake from phone/tablet to host board
    Handshake {
        client_name: String,
        client_id: Uuid,
        pin: String,
    },
    /// Host board response confirming or rejecting pairing
    PairingResponse {
        accepted: bool,
        room_id: String,
        message: Option<String>,
    },
    /// Sync active document metadata and current page
    DocumentSync {
        doc_id: Uuid,
        doc_title: String,
        page_number: usize,
        total_pages: usize,
    },
    /// Page flip command
    PageTurn {
        target_page: usize,
    },
    /// Live ink stroke drawn on phone transmitted to board
    InkStroke {
        page_number: usize,
        stroke: Stroke,
    },
    /// Clear board command
    ClearBoard {
        page_number: usize,
    },
    /// Spotlight laser pointer position
    Spotlight {
        x_ratio: f32,
        y_ratio: f32,
        is_active: bool,
    },
    /// Delivery receipt acknowledging packet receipt
    Receipt {
        ack_message_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamPacket {
    pub message_id: Uuid,
    pub session_id: String,
    pub timestamp_ms: u64,
    pub message: BeamMessage,
}

impl BeamPacket {
    pub fn new(session_id: String, message: BeamMessage) -> Self {
        Self {
            message_id: Uuid::new_v4(),
            session_id,
            timestamp_ms: chrono::Utc::now().timestamp_millis() as u64,
            message,
        }
    }
}
