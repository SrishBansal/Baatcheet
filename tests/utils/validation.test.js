import { describe, it, expect } from 'vitest';
import { validate, isNonEmpty } from '../../src/utils/validation.js';

describe('validation utils', () => {
  describe('isNonEmpty', () => {
    it('returns true for non-empty string', () => {
      expect(isNonEmpty('hello')).toBe(true);
      expect(isNonEmpty(' a ')).toBe(true);
    });

    it('returns false for empty string, whitespace, or non-strings', () => {
      expect(isNonEmpty('')).toBe(false);
      expect(isNonEmpty('   ')).toBe(false);
      expect(isNonEmpty(null)).toBe(false);
      expect(isNonEmpty(undefined)).toBe(false);
      expect(isNonEmpty(123)).toBe(false);
    });
  });

  describe('validate', () => {
    const schema = {
      title: { type: 'string', required: true, minLength: 2, maxLength: 50 },
      count: { type: 'number', required: false },
      tags: { type: 'array', required: false, minLength: 1 },
    };

    it('validates valid object successfully', () => {
      const res = validate({ title: 'Engineer', count: 5, tags: ['react'] }, schema);
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('flags required field missing', () => {
      const res = validate({ count: 5 }, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('title is required');
    });

    it('flags string minLength violation', () => {
      const res = validate({ title: 'A' }, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('title must be at least 2 character(s)');
    });

    it('flags string maxLength violation', () => {
      const longTitle = 'A'.repeat(55);
      const res = validate({ title: longTitle }, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('title must be at most 50 character(s)');
    });

    it('flags invalid type', () => {
      const res = validate({ title: 123 }, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('title must be of type string');
    });

    it('flags array minLength violation', () => {
      const res = validate({ title: 'Engineer', tags: [] }, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('tags must have at least 1 item(s)');
    });

    it('handles non-object input gracefully', () => {
      const res = validate(null, schema);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Value must be a non-null object');
    });
  });
});
