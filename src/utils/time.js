/**
 * Format an ISO timestamp string for display.
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Formatted date string (e.g., "24 Oct 2026, 7:46 PM")
 */
export function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date-only display.
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Formatted date (e.g., "24 Oct 2026")
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Get an ISO timestamp string for the current moment.
 * @returns {string} ISO 8601 date string
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Format a relative time description (e.g., "2 hours ago").
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Relative time string
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(isoString);
}
