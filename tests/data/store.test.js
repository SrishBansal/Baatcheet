import { describe, it, expect, beforeEach } from 'vitest';

// In-memory mock for localStorage in Node test environment
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new LocalStorageMock();

// Dynamically import store after setting up localStorage mock
const { store } = await import('../../src/data/store.js');

describe('store', () => {
  beforeEach(() => {
    store.jobs.clear();
  });

  describe('jobs collection', () => {
    it('starts empty after clear', () => {
      expect(store.jobs.getAll()).toEqual([]);
      expect(store.jobs.count()).toBe(0);
    });

    it('adds an item and retrieves it', () => {
      const job = { id: 'test-1', title: 'Frontend Engineer' };
      const added = store.jobs.add(job);

      expect(added).toEqual(job);
      expect(store.jobs.count()).toBe(1);
      expect(store.jobs.getById('test-1')).toEqual(job);
    });

    it('throws error when adding an item without id', () => {
      expect(() => {
        store.jobs.add({ title: 'No ID' });
      }).toThrow(/Cannot add item without an id/);
    });

    it('throws error when adding an item with duplicate id', () => {
      const job = { id: 'dup-1', title: 'First' };
      store.jobs.add(job);
      expect(() => {
        store.jobs.add(job);
      }).toThrow(/already exists/);
    });

    it('updates an existing item without altering its id', () => {
      store.jobs.add({ id: 'update-1', title: 'Old Title', status: 'draft' });
      const updated = store.jobs.update('update-1', { title: 'New Title', id: 'hacked-id' });

      expect(updated.id).toBe('update-1');
      expect(updated.title).toBe('New Title');
      expect(updated.status).toBe('draft');
      expect(store.jobs.getById('update-1').title).toBe('New Title');
    });

    it('throws error when updating a non-existent item', () => {
      expect(() => {
        store.jobs.update('missing-id', { title: 'New' });
      }).toThrow(/not found/);
    });

    it('removes an item by id', () => {
      store.jobs.add({ id: 'del-1', title: 'To Delete' });
      expect(store.jobs.count()).toBe(1);

      const removed = store.jobs.remove('del-1');
      expect(removed).toBe(true);
      expect(store.jobs.count()).toBe(0);
      expect(store.jobs.getById('del-1')).toBeNull();
    });

    it('returns false when removing a non-existent item', () => {
      const removed = store.jobs.remove('non-existent');
      expect(removed).toBe(false);
    });
  });
});
