/**
 * Generate a unique identifier.
 * Uses crypto.randomUUID() which is available in all modern browsers
 * and Node.js 19+.
 * @returns {string} A UUID v4 string
 */
export function generateId() {
  return crypto.randomUUID();
}
