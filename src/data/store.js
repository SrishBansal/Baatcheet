/**
 * Persistence adapter — localStorage-backed CRUD store.
 *
 * This module provides a typed collection interface over localStorage.
 * The adapter pattern means consumers call store.jobs.getAll(), etc.,
 * and the underlying storage mechanism can be swapped (to IndexedDB,
 * REST API, etc.) without changing calling code.
 *
 * Data is stored as JSON under namespaced keys: "hirepilot:<collection>".
 */

const STORAGE_PREFIX = 'hirepilot:';

/**
 * Create a collection adapter for a given entity type.
 * @param {string} collectionName
 * @returns {object} CRUD interface
 */
function createCollection(collectionName) {
  const key = STORAGE_PREFIX + collectionName;

  function _read() {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error(`[store] Failed to read ${collectionName}:`, err);
      return [];
    }
  }

  function _write(items) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (err) {
      console.error(`[store] Failed to write ${collectionName}:`, err);
      throw new Error(`Failed to save ${collectionName}. Storage may be full.`);
    }
  }

  return {
    /**
     * Get all items in the collection.
     * @returns {object[]}
     */
    getAll() {
      return _read();
    },

    /**
     * Get a single item by ID.
     * @param {string} id
     * @returns {object | null}
     */
    getById(id) {
      const items = _read();
      return items.find((item) => item.id === id) || null;
    },

    /**
     * Add a new item to the collection.
     * @param {object} item - Must have an `id` field
     * @returns {object} The added item
     */
    add(item) {
      if (!item || !item.id) {
        throw new Error(`Cannot add item without an id to ${collectionName}`);
      }
      const items = _read();
      const exists = items.some((existing) => existing.id === item.id);
      if (exists) {
        throw new Error(`Item with id ${item.id} already exists in ${collectionName}`);
      }
      items.push(item);
      _write(items);
      return item;
    },

    /**
     * Update an existing item. Merges the update into the existing item.
     * @param {string} id
     * @param {object} updates - Partial updates to merge
     * @returns {object} The updated item
     */
    update(id, updates) {
      const items = _read();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error(`Item with id ${id} not found in ${collectionName}`);
      }
      items[index] = { ...items[index], ...updates, id }; // Prevent id overwrite
      _write(items);
      return items[index];
    },

    /**
     * Remove an item by ID.
     * @param {string} id
     * @returns {boolean} True if the item was found and removed
     */
    remove(id) {
      const items = _read();
      const filtered = items.filter((item) => item.id !== id);
      if (filtered.length === items.length) return false;
      _write(filtered);
      return true;
    },

    /**
     * Remove all items from the collection.
     */
    clear() {
      _write([]);
    },

    /**
     * Get the count of items in the collection.
     * @returns {number}
     */
    count() {
      return _read().length;
    },
  };
}

/**
 * The application data store.
 * Add new collections here as the application grows.
 */
export const store = {
  jobs: createCollection('jobs'),
  // Future collections:
  // interviews: createCollection('interviews'),
  // transcripts: createCollection('transcripts'),
  // reports: createCollection('reports'),
};
