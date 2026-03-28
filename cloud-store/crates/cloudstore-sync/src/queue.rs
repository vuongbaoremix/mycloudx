use cloudstore_common::PathId;
use tokio::sync::mpsc;
use tracing::{debug, warn};

/// A sync job to be processed by a worker.
#[derive(Debug, Clone)]
pub struct SyncJob {
    pub path_id: PathId,
    pub retry_count: u32,
}

impl SyncJob {
    pub fn new(path_id: PathId) -> Self {
        Self {
            path_id,
            retry_count: 0,
        }
    }
}

/// MPSC-based sync job queue.
#[derive(Clone)]
pub struct SyncQueue {
    sender: mpsc::Sender<SyncJob>,
}

impl SyncQueue {
    /// Create a new queue with the given buffer capacity.
    /// Returns the queue (for sending) and receiver (for workers).
    pub fn new(capacity: usize) -> (Self, mpsc::Receiver<SyncJob>) {
        let (sender, receiver) = mpsc::channel(capacity);
        (Self { sender }, receiver)
    }

    /// Enqueue a new sync job.
    pub async fn enqueue(&self, job: SyncJob) -> Result<(), String> {
        self.sender.send(job).await.map_err(|e| {
            warn!("Failed to enqueue sync job: {}", e);
            format!("Queue send failed: {}", e)
        })?;
        debug!("Sync job enqueued");
        Ok(())
    }
}
