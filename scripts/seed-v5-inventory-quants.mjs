import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, 'database.json');
const CHECK_ONLY = process.argv.includes('--check');
const MAIN_LOCATION_ID = 'LOC_MAIN';
const SYSTEM_USER = 'system';

function timestampForFile(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function makeQuantId(materialId) {
  return `QUANT_${String(materialId || 'MAT').replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_${MAIN_LOCATION_ID}`;
}

function nowIso() {
  return new Date().toISOString();
}

function readDb() {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return { raw, db: JSON.parse(raw) };
}

function ensureAudit(record, timestamp) {
  record.created_at = record.created_at || timestamp;
  record.created_by = record.created_by || SYSTEM_USER;
  record.updated_at = record.updated_at || timestamp;
  record.updated_by = record.updated_by || SYSTEM_USER;
  record.is_active = record.is_active !== false;
}

function seedQuants(db) {
  const timestamp = nowIso();
  const report = {
    materials: Array.isArray(db.omni?.materials) ? db.omni.materials.length : 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  if (!Array.isArray(db.omni?.materials)) throw new Error('omni.materials[] is missing');
  if (!Array.isArray(db.locations) || !db.locations.some(location => location.id === MAIN_LOCATION_ID)) {
    throw new Error(`${MAIN_LOCATION_ID} location is missing`);
  }
  if (!Array.isArray(db.quants)) db.quants = [];

  db.omni.materials.forEach(material => {
    if (!material?.id) {
      report.skipped += 1;
      return;
    }

    const quantity = Number(material.stock || 0);
    const reserved = Number(material.reservedQty ?? material.reserved ?? 0);
    const id = makeQuantId(material.id);
    let quant = db.quants.find(item => item.id === id);

    if (!quant) {
      quant = {
        id,
        product_id: material.id,
        location_id: MAIN_LOCATION_ID,
        lot_id: '',
        quantity,
        reserved_quantity: reserved,
        available_quantity: quantity - reserved,
        unit: material.unit || '',
        source: 'omni.materials',
      };
      ensureAudit(quant, timestamp);
      db.quants.push(quant);
      report.created += 1;
      return;
    }

    const before = JSON.stringify({
      quantity: quant.quantity,
      reserved_quantity: quant.reserved_quantity,
      available_quantity: quant.available_quantity,
      unit: quant.unit,
    });
    quant.quantity = quantity;
    quant.reserved_quantity = reserved;
    quant.available_quantity = quantity - reserved;
    quant.unit = material.unit || quant.unit || '';
    quant.source = quant.source || 'omni.materials';
    ensureAudit(quant, timestamp);
    quant.updated_at = timestamp;

    const after = JSON.stringify({
      quantity: quant.quantity,
      reserved_quantity: quant.reserved_quantity,
      available_quantity: quant.available_quantity,
      unit: quant.unit,
    });
    if (before !== after) report.updated += 1;
    else report.skipped += 1;
  });

  return report;
}

function validate(db) {
  const errors = [];
  if (!Array.isArray(db.quants)) errors.push('quants[] missing');
  if (!Array.isArray(db.omni?.materials)) errors.push('omni.materials[] missing');
  const materialIds = new Set((db.omni?.materials || []).map(material => material.id).filter(Boolean));
  const mainQuants = (db.quants || []).filter(quant => quant.location_id === MAIN_LOCATION_ID);
  materialIds.forEach(id => {
    if (!mainQuants.some(quant => quant.product_id === id)) errors.push(`missing main quant for ${id}`);
  });
  return errors;
}

const { raw, db } = readDb();
const previewDb = JSON.parse(JSON.stringify(db));
const report = seedQuants(previewDb);
const errors = validate(previewDb);

console.log(`V5 inventory quant seed (${CHECK_ONLY ? 'check' : 'apply'})`);
console.log(`Materials inspected: ${report.materials}`);
console.log(`Quants created: ${report.created}`);
console.log(`Quants updated: ${report.updated}`);
console.log(`Quants unchanged/skipped: ${report.skipped}`);

if (errors.length) {
  console.error('Validation failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log('Validation result: PASSED');
  process.exit(0);
}

const backupPath = path.join(ROOT, `database.backup.inventory.${timestampForFile()}.json`);
fs.writeFileSync(backupPath, raw, 'utf8');
fs.writeFileSync(DB_FILE, `${JSON.stringify(previewDb, null, 2)}\n`, 'utf8');
console.log(`Backup path: ${backupPath}`);
console.log('Validation result: PASSED');
