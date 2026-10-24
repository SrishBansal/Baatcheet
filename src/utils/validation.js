/**
 * Validate a value against a simple schema definition.
 *
 * Schema format:
 * {
 *   fieldName: { type: 'string' | 'number' | 'boolean' | 'array' | 'object', required: true/false },
 *   ...
 * }
 *
 * @param {object} value - The object to validate
 * @param {object} schema - The schema definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(value, schema) {
  const errors = [];

  if (typeof value !== 'object' || value === null) {
    return { valid: false, errors: ['Value must be a non-null object'] };
  }

  for (const [field, rules] of Object.entries(schema)) {
    const fieldValue = value[field];
    const isPresent = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';

    if (rules.required && !isPresent) {
      errors.push(`${field} is required`);
      continue;
    }

    if (!isPresent) continue;

    if (rules.type === 'array') {
      if (!Array.isArray(fieldValue)) {
        errors.push(`${field} must be an array`);
      } else if (rules.minLength !== undefined && fieldValue.length < rules.minLength) {
        errors.push(`${field} must have at least ${rules.minLength} item(s)`);
      }
    } else if (rules.type && typeof fieldValue !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
    }

    if (rules.type === 'string' && typeof fieldValue === 'string') {
      if (rules.minLength !== undefined && fieldValue.trim().length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} character(s)`);
      }
      if (rules.maxLength !== undefined && fieldValue.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} character(s)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a string is non-empty after trimming.
 * @param {string} str
 * @returns {boolean}
 */
export function isNonEmpty(str) {
  return typeof str === 'string' && str.trim().length > 0;
}
