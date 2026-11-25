use thiserror::Error;

#[derive(Error, Debug)]
pub enum OtiumError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Image processing error: {0}")]
    ImageProcessing(String),
}

pub type Result<T> = std::result::Result<T, OtiumError>;
