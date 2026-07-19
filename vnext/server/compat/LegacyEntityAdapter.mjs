// clean-room; behavior modeled on octagon-erp collections JSON storage shape (proprietary self, not copied)
import { LegacySnapshotStore } from './LegacySnapshotStore.mjs';

export class LegacyEntityAdapter {
  constructor({ snapshotPath } = {}) { this.store = new LegacySnapshotStore(snapshotPath); }

  list(collectionName) {
    return this.store.listCollection(collectionName).map((row) => ({
      source: 'legacy-sanitized-fixture',
      entityType: collectionName,
      legacyId: row.legacyId,
      attributes: row.attributes,
    }));
  }

  get(collectionName, legacyId) {
    return this.list(collectionName).find((row) => row.legacyId === legacyId) || null;
  }

  close() { this.store.close(); }
}
