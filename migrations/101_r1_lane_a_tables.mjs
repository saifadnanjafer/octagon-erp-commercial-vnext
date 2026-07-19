// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.1 collection registry (proprietary self, not copied)
export const migration = {
  id: '101_r1_lane_a_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_records (
        entity     TEXT NOT NULL,
        id         TEXT NOT NULL,
        company_id TEXT REFERENCES r0_tenant_root(company_id),
        data       TEXT NOT NULL DEFAULT '{}',
        created_at TEXT,
        updated_at TEXT,
        created_by TEXT,
        removed    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (entity, id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_records_entity_removed ON x_records (entity, removed);
      CREATE INDEX IF NOT EXISTS idx_x_records_company ON x_records (company_id);

      CREATE TABLE IF NOT EXISTS collection_registry (
        collection TEXT PRIMARY KEY,
        label_ar TEXT NOT NULL,
        label_ar_plural TEXT NOT NULL,
        section TEXT,
        sequence TEXT,
        seq_field TEXT,
        chatter INTEGER DEFAULT 0,
        acl TEXT,
        status_key TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS field_registry (
        collection TEXT NOT NULL,
        field TEXT NOT NULL,
        type TEXT NOT NULL,
        label_ar TEXT NOT NULL,
        required INTEGER DEFAULT 0,
        options TEXT,
        def_val TEXT,
        PRIMARY KEY (collection, field),
        FOREIGN KEY (collection) REFERENCES collection_registry(collection) ON DELETE CASCADE
      ) STRICT;
    `);

    // Seed crm_lead
    db.prepare(`INSERT INTO collection_registry (collection, label_ar, label_ar_plural, section, sequence, seq_field, chatter, acl, status_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'crm_lead', 'عميل محتمل', 'العملاء المحتملون', 'sales', 'LEAD-{YYYY}-{#####}', 'seq', 1, 'sales:crm_lead', 'status'
      );
    const leadFields = [
      ['name', 'text', 'الاسم', 1, null, null],
      ['company', 'text', 'الشركة', 0, null, null],
      ['phone', 'text', 'الهاتف', 0, null, null],
      ['email', 'text', 'البريد الإلكتروني', 0, null, null],
      ['source', 'select', 'المصدر', 0, JSON.stringify(['موقع', 'إحالة', 'اتصال بارد', 'معرض', 'أخرى']), null],
      ['status', 'select', 'الحالة', 0, JSON.stringify(['new', 'contacted', 'qualified', 'won', 'lost']), 'new'],
      ['owner', 'text', 'المسؤول', 0, null, null],
      ['value', 'number', 'القيمة المتوقعة', 0, null, null],
      ['notes', 'textarea', 'ملاحظات', 0, null, null]
    ];
    const insField = db.prepare(`INSERT INTO field_registry (collection, field, type, label_ar, required, options, def_val)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const f of leadFields) {
      insField.run('crm_lead', f[0], f[1], f[2], f[3], f[4], f[5]);
    }

    // Seed helpdesk_ticket
    db.prepare(`INSERT INTO collection_registry (collection, label_ar, label_ar_plural, section, sequence, seq_field, chatter, acl, status_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'helpdesk_ticket', 'تذكرة دعم', 'تذاكر الدعم', 'sales', 'TKT-{YYYY}{MM}-{####}', 'seq', 1, 'support:helpdesk_ticket', 'status'
      );
    const ticketFields = [
      ['subject', 'text', 'الموضوع', 1, null, null],
      ['customer', 'text', 'العميل', 0, null, null],
      ['priority', 'select', 'الأولوية', 0, JSON.stringify(['low', 'medium', 'high', 'urgent']), 'medium'],
      ['status', 'select', 'الحالة', 0, JSON.stringify(['open', 'in_progress', 'waiting', 'resolved', 'closed']), 'open'],
      ['assignee', 'text', 'المكلَّف', 0, null, null],
      ['body', 'textarea', 'الوصف', 0, null, null]
    ];
    for (const f of ticketFields) {
      insField.run('helpdesk_ticket', f[0], f[1], f[2], f[3], f[4], f[5]);
    }

    // Seed product
    db.prepare(`INSERT INTO collection_registry (collection, label_ar, label_ar_plural, section, sequence, seq_field, chatter, acl, status_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'product', 'منتج', 'المنتجات', 'supply', 'PRD-{#####}', 'seq', 1, 'supply:product', 'status'
      );
    const productFields = [
      ['name', 'text', 'اسم المنتج', 1, null, null],
      ['sku', 'text', 'رمز المنتج', 0, null, null],
      ['category', 'text', 'الفئة', 0, null, null],
      ['uom', 'text', 'وحدة القياس', 0, null, 'قطعة'],
      ['cost_price', 'number', 'سعر الكلفة', 0, null, null],
      ['sale_price', 'number', 'سعر البيع', 0, null, null],
      ['status', 'select', 'الحالة', 0, JSON.stringify(['active', 'inactive']), 'active']
    ];
    for (const f of productFields) {
      insField.run('product', f[0], f[1], f[2], f[3], f[4], f[5]);
    }
  },
  down(db) {
    db.exec(`
      DROP TABLE field_registry;
      DROP TABLE collection_registry;
      DROP TABLE x_records;
    `);
  }
};
