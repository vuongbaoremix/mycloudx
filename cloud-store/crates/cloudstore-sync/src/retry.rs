use std::time::Duration;

/// Compute delay for exponential backoff.
/// delay = base_delay * 2^attempt (capped at max_delay)
pub fn backoff_delay(attempt: u32, base_delay: Duration, max_delay: Duration) -> Duration {
    let delay = base_delay.saturating_mul(2u32.saturating_pow(attempt));
    std::cmp::min(delay, max_delay)
}

/// Check if a job should be retried.
pub fn should_retry(attempt: u32, max_retries: u32) -> bool {
    attempt < max_retries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backoff_delay() {
        let base = Duration::from_secs(2);
        let max = Duration::from_secs(60);

        assert_eq!(backoff_delay(0, base, max), Duration::from_secs(2));
        assert_eq!(backoff_delay(1, base, max), Duration::from_secs(4));
        assert_eq!(backoff_delay(2, base, max), Duration::from_secs(8));
        assert_eq!(backoff_delay(3, base, max), Duration::from_secs(16));
        assert_eq!(backoff_delay(5, base, max), Duration::from_secs(60)); // capped
    }

    #[test]
    fn test_should_retry() {
        assert!(should_retry(0, 5));
        assert!(should_retry(4, 5));
        assert!(!should_retry(5, 5));
        assert!(!should_retry(6, 5));
    }
}
