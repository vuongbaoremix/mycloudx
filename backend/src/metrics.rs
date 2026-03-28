use serde::Serialize;
use std::sync::atomic::{AtomicUsize, AtomicU64, Ordering};
use std::sync::Arc;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Networks, RefreshKind, System};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppMetrics {
    pub jobs_pending: Arc<AtomicUsize>,
    pub jobs_processing: Arc<AtomicUsize>,
    pub jobs_completed: Arc<AtomicUsize>,
    pub bytes_processed: Arc<AtomicU64>,
    pub sys: Arc<Mutex<System>>,
    pub networks: Arc<Mutex<Networks>>,
}

#[derive(Serialize)]
pub struct ServerMetrics {
    pub cpu_usage_percent: f32,
    pub mem_total: u64,
    pub mem_used: u64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub jobs_pending: usize,
    pub jobs_processing: usize,
    pub jobs_completed: usize,
    pub bytes_processed: u64,
}

impl AppMetrics {
    pub fn new() -> Self {
        let mut sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );
        let mut networks = Networks::new_with_refreshed_list();

        // Initial refresh
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        networks.refresh_list();
        networks.refresh();

        let sys = Arc::new(Mutex::new(sys));
        let nets = Arc::new(Mutex::new(networks));

        // Start background refresher thread
        let sys_clone = sys.clone();
        let nets_clone = nets.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
            loop {
                interval.tick().await;
                {
                    let mut s = sys_clone.lock().await;
                    s.refresh_cpu_usage();
                    s.refresh_memory();
                }
                {
                    let mut n = nets_clone.lock().await;
                    n.refresh_list();
                    n.refresh();
                }
            }
        });

        Self {
            jobs_pending: Arc::new(AtomicUsize::new(0)),
            jobs_processing: Arc::new(AtomicUsize::new(0)),
            jobs_completed: Arc::new(AtomicUsize::new(0)),
            bytes_processed: Arc::new(AtomicU64::new(0)),
            sys,
            networks: nets,
        }
    }

    pub async fn snapshot(&self) -> ServerMetrics {
        let (cpu, mem_total, mem_used) = {
            let s = self.sys.lock().await;
            (
                s.global_cpu_info().cpu_usage(),
                s.total_memory(),
                s.used_memory()
            )
        };

        let (rx, tx) = {
            let n = self.networks.lock().await;
            let mut total_rx = 0;
            let mut total_tx = 0;
            for (_, current_network) in n.iter() {
                total_rx += current_network.received(); // Note: sysinfo Network::received() stores the bytes received between two refresh
                total_tx += current_network.transmitted();
            }
            (total_rx, total_tx)
        };

        ServerMetrics {
            cpu_usage_percent: cpu,
            mem_total,
            mem_used,
            network_rx_bytes: rx, // This is rate per refresh interval (2s)
            network_tx_bytes: tx, // Or total depending on sysinfo version, wait! sysinfo 0.30 returns bytes since last refresh.
            jobs_pending: self.jobs_pending.load(Ordering::Relaxed),
            jobs_processing: self.jobs_processing.load(Ordering::Relaxed),
            jobs_completed: self.jobs_completed.load(Ordering::Relaxed),
            bytes_processed: self.bytes_processed.load(Ordering::Relaxed),
        }
    }
}

impl Default for AppMetrics {
    fn default() -> Self {
        Self::new()
    }
}
