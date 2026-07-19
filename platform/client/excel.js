// ============================================================================
// Octagon Commercial — Import / Export (P0.8)
//
// Pattern from ruoyi-vue-pro-master/yudao-module-wms/src/main/java/cn/iocoder/
// yudao/module/wms/controller/admin/order/shipment/WmsShipmentOrderController.java:
// export the current filtered worklist, with permission enforcement delegated
// to the normal data endpoint. Re-expressed for vanilla JS + SheetJS.
//
// Public hooks consumed by P0.6:
//   OX.excel.exportList(entity, { q, filter, sort, columns })
//   OX.excel.importInto(entity, { form, onDone })
//
// NEW FILE — add-only. The module never accesses legacy employee, timesheet,
// attendance, or payroll data. Imports call only /api/x/:entity/create.
// ============================================================================
(function () {
  'use strict';

  window.OX = window.OX || {};
  if (window.OX.excel) return;

  var API_BASE = '/api/x';
  var PAGE_SIZE = 500;
  var IMPORT_CONCURRENCY = 4;
  var BLOCKED_ENTITY_RE = /(?:^|_)(?:employee|employees|timesheet|attendance|payroll)(?:_|$)/i;
  var activeDialog = null;

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
    else if (type === 'error') console.error('[OX.excel] ' + message);
    else console.log('[OX.excel] ' + message);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isBlockedEntity(entity) {
    return BLOCKED_ENTITY_RE.test(String(entity || ''));
  }

  function normalizeRecord(row) {
    if (!row || typeof row !== 'object') return {};
    var data = row.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = null; } }
    return data && typeof data === 'object'
      ? Object.assign({ id: row.id, created_at: row.created_at, updated_at: row.updated_at }, data)
      : row;
  }

  function api(path, options) {
    var opts = Object.assign({ credentials: 'same-origin', headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      return res.json().catch(function () {
        return { success: false, error: 'استجابة غير صالحة من الخادم (' + res.status + ')' };
      });
    }).catch(function (err) {
      return { success: false, error: 'تعذر الاتصال بالخادم: ' + (err && err.message ? err.message : err) };
    });
  }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (typeof window.loadOctagonBootLib === 'function') return window.loadOctagonBootLib('xlsx', 'XLSX');
    if (window.__oxExcelXlsxPromise) return window.__oxExcelXlsxPromise;
    window.__oxExcelXlsxPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.async = true;
      script.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('تعذر تحميل مكتبة Excel')); };
      script.onerror = function () { reject(new Error('تعذر تحميل مكتبة Excel')); };
      document.head.appendChild(script);
    });
    return window.__oxExcelXlsxPromise;
  }

  function normalized(value) {
    return String(value == null ? '' : value).toLowerCase().trim()
      .replace(/[\s_\-./\\()\[\]{}:]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  function protectSpreadsheetValue(value) {
    if (typeof value !== 'string') return value == null ? '' : value;
    return /^[=+\-@]/.test(value) ? "'" + value : value;
  }

  function displayColumns(options, records) {
    var known = [];
    (options.columns || []).forEach(function (col) {
      if (col && col.key && !known.some(function (x) { return x.key === col.key; })) known.push(col);
    });
    (options.form || []).forEach(function (field) {
      if (field && field.key && !known.some(function (x) { return x.key === field.key; })) known.push(field);
    });
    if (!known.length) {
      var keys = {};
      records.forEach(function (record) { Object.keys(record || {}).forEach(function (key) { keys[key] = true; }); });
      Object.keys(keys).filter(function (key) { return !/^(id|created_at|updated_at|created_by|removed)$/i.test(key); })
        .forEach(function (key) { known.push({ key: key, label_ar: key }); });
    }
    return known.filter(function (col) { return !/^(id|created_at|updated_at|created_by|removed)$/i.test(col.key); });
  }

  function buildListQuery(options, page) {
    var parts = ['page=' + page, 'limit=' + PAGE_SIZE];
    if (options.sort && options.sort.key) parts.push('sort=' + encodeURIComponent(options.sort.key + ':' + (options.sort.dir || 'asc')));
    else if (typeof options.sort === 'string' && options.sort) parts.push('sort=' + encodeURIComponent(options.sort));
    if (options.q) parts.push('q=' + encodeURIComponent(options.q));
    if (options.filter && Object.keys(options.filter).length) parts.push('filter=' + encodeURIComponent(JSON.stringify(options.filter)));
    return '?' + parts.join('&');
  }

  function fetchAll(entity, options) {
    var all = [];
    var page = 1;
    function next() {
      return api('/' + encodeURIComponent(entity) + '/list' + buildListQuery(options, page)).then(function (env) {
        if (!env.success) throw new Error(env.error || 'تعذر قراءة السجلات للتصدير');
        var rows = Array.isArray(env.data) ? env.data : (env.data && Array.isArray(env.data.items) ? env.data.items : []);
        all = all.concat(rows.map(normalizeRecord));
        var total = Number(env.meta && env.meta.total);
        if (rows.length && (!Number.isFinite(total) || all.length < total)) { page += 1; return next(); }
        return all;
      });
    }
    return next();
  }

  function fileSafeName(entity) {
    return String(entity || 'records').replace(/[^a-z0-9_-]/gi, '_') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  }

  function exportList(entity, options) {
    options = options || {};
    if (isBlockedEntity(entity)) { toast('لا يمكن تصدير بيانات الموارد البشرية المجمدة من هذه الأداة', 'error'); return Promise.resolve(false); }
    toast('جارٍ تجهيز ملف Excel…', 'info');
    return Promise.all([loadXlsx(), fetchAll(entity, options)]).then(function (result) {
      var XLSX = result[0];
      var records = result[1];
      var columns = displayColumns(options, records);
      var rows = records.map(function (record) {
        var out = {};
        columns.forEach(function (col) { out[col.label_ar || col.label || col.key] = protectSpreadsheetValue(record[col.key]); });
        return out;
      });
      var sheet = XLSX.utils.json_to_sheet(rows, { header: columns.map(function (c) { return c.label_ar || c.label || c.key; }) });
      sheet['!cols'] = columns.map(function (col) {
        var title = String(col.label_ar || col.label || col.key);
        var max = rows.reduce(function (size, row) { return Math.max(size, String(row[title] == null ? '' : row[title]).length); }, title.length);
        return { wch: Math.min(48, Math.max(12, max + 2)) };
      });
      sheet['!views'] = [{ rightToLeft: true }];
      var book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'البيانات');
      XLSX.writeFile(book, fileSafeName(entity), { compression: true });
      toast('تم تصدير ' + records.length + ' سجل إلى Excel', 'success');
      return true;
    }).catch(function (error) {
      toast(error && error.message ? error.message : 'فشل تصدير ملف Excel', 'error');
      return false;
    });
  }

  function ensureStyles() {
    if (document.getElementById('ox-excel-styles')) return;
    var style = document.createElement('style');
    style.id = 'ox-excel-styles';
    style.textContent = '' +
      '.oxx-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(4,10,25,.68);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl}' +
      '.oxx-dialog{width:min(1040px,100%);max-height:min(86vh,880px);overflow:auto;background:var(--bg-card,var(--bg-primary,#101827));color:var(--text-primary,#eef2ff);border:1px solid var(--border-glass,rgba(255,255,255,.14));border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.42);padding:20px}' +
      '.oxx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:1px solid var(--border-glass,rgba(255,255,255,.1));padding-bottom:14px;margin-bottom:16px}.oxx-head h3{margin:0;font-size:1.15rem}.oxx-head p{margin:5px 0 0;color:var(--text-secondary,#aab6cf);font-size:.86rem}.oxx-close{border:0;background:transparent;color:inherit;font-size:1.5rem;cursor:pointer}' +
      '.oxx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:10px}.oxx-field{display:grid;gap:5px;font-size:.86rem}.oxx-field select,.oxx-field input{width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid var(--border-glass,rgba(255,255,255,.15));background:var(--input-bg,rgba(255,255,255,.06));color:inherit;font:inherit}.oxx-card{background:var(--bg-glass,rgba(255,255,255,.035));border:1px solid var(--border-glass,rgba(255,255,255,.09));border-radius:10px;padding:12px;margin:12px 0}.oxx-card h4{margin:0 0 9px;font-size:.95rem}.oxx-muted{color:var(--text-secondary,#aab6cf);font-size:.84rem}.oxx-tablewrap{overflow:auto;max-height:310px;border:1px solid var(--border-glass,rgba(255,255,255,.1));border-radius:9px}.oxx-table{width:100%;border-collapse:collapse;font-size:.8rem}.oxx-table th,.oxx-table td{padding:8px;text-align:right;border-bottom:1px solid var(--border-glass,rgba(255,255,255,.08));vertical-align:top}.oxx-table th{position:sticky;top:0;background:var(--bg-card,#101827)}.oxx-ok{color:var(--accent-green,#4ade80)}.oxx-bad{color:var(--accent-red,#fb7185)}.oxx-actions{display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap;margin-top:16px}.oxx-btn{padding:9px 14px;border-radius:8px;border:1px solid var(--border-glass,rgba(255,255,255,.14));background:var(--bg-glass,rgba(255,255,255,.06));color:inherit;cursor:pointer;font:inherit}.oxx-btn-primary{background:var(--accent-blue,#2563eb);border-color:transparent;color:white}.oxx-btn:disabled{opacity:.55;cursor:not-allowed}.oxx-progress{height:7px;background:rgba(255,255,255,.09);border-radius:99px;overflow:hidden}.oxx-progress i{display:block;height:100%;background:var(--accent-blue,#38bdf8);width:0;transition:width .15s ease}.oxx-summary{display:flex;gap:12px;flex-wrap:wrap;font-size:.88rem}' +
      '@media(max-width:620px){.oxx-backdrop{padding:8px}.oxx-dialog{padding:14px;border-radius:12px}.oxx-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function closeDialog() {
    if (activeDialog) activeDialog.remove();
    activeDialog = null;
  }

  function fieldLabel(field) { return field.label_ar || field.label || field.key; }

  function fileColumns(rows) {
    var keys = {};
    rows.forEach(function (row) { Object.keys(row || {}).forEach(function (key) { keys[key] = true; }); });
    return Object.keys(keys);
  }

  function guessMapping(fields, headers) {
    var used = {};
    var map = {};
    fields.forEach(function (field) {
      var alternatives = [field.key, fieldLabel(field)].map(normalized);
      var found = headers.find(function (header) { return !used[header] && alternatives.indexOf(normalized(header)) >= 0; });
      map[field.key] = found || '';
      if (found) used[found] = true;
    });
    return map;
  }

  function coerce(value, field) {
    if (value == null || value === '') return '';
    if (field.type === 'number') {
      var parsed = Number(String(value).replace(/,/g, '').trim());
      return Number.isFinite(parsed) ? parsed : value;
    }
    if (field.type === 'checkbox' || field.type === 'boolean') return /^(true|1|yes|نعم)$/i.test(String(value).trim());
    return typeof value === 'string' ? value.trim() : value;
  }

  function makePreview(rows, fields, mapping) {
    return rows.map(function (row, index) {
      var values = {};
      var errors = [];
      fields.forEach(function (field) {
        var header = mapping[field.key];
        if (!header) return;
        var value = coerce(row[header], field);
        values[field.key] = value;
        if (field.required && (value === '' || value == null)) errors.push('«' + fieldLabel(field) + '» حقل مطلوب');
        if (field.type === 'number' && value !== '' && !Number.isFinite(value)) errors.push('«' + fieldLabel(field) + '» يجب أن يكون رقماً');
      });
      return { rowNumber: index + 2, values: values, errors: errors, state: errors.length ? 'invalid' : 'ready', serverError: '' };
    });
  }

  function importInto(entity, options) {
    options = options || {};
    if (isBlockedEntity(entity)) { toast('لا يمكن استيراد بيانات الموارد البشرية المجمدة من هذه الأداة', 'error'); return; }
    ensureStyles();
    closeDialog();

    var fields = (options.form || []).filter(function (field) { return field && field.key && field.type !== 'relation'; });
    var state = { entity: entity, fields: fields, headers: [], rows: [], mapping: {}, preview: [], importing: false, done: 0 };
    var backdrop = document.createElement('div');
    backdrop.className = 'oxx-backdrop';
    backdrop.setAttribute('dir', 'rtl');
    backdrop.innerHTML = '<section class="oxx-dialog" role="dialog" aria-modal="true" aria-label="استيراد Excel"><div class="oxx-head"><div><h3>استيراد بيانات من Excel</h3><p>اربط الأعمدة، راجع الصفوف، ثم استورد السجلات الصالحة فقط.</p></div><button class="oxx-close" type="button" title="إغلاق">×</button></div><div data-role="content"></div></section>';
    activeDialog = backdrop;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.oxx-close').addEventListener('click', closeDialog);
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop && !state.importing) closeDialog(); });

    function content() { return backdrop.querySelector('[data-role="content"]'); }
    function render() {
      if (!state.rows.length) {
        content().innerHTML = '<div class="oxx-card"><h4>١. اختر ملفاً</h4><p class="oxx-muted">يدعم ملفات Excel بصيغة XLSX أو XLS. الصف الأول يجب أن يحتوي أسماء الأعمدة.</p><input class="oxx-file" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"><p class="oxx-muted">لا تتضمن الأداة حقول المعرف أو بيانات الموظفين/الحضور/الرواتب.</p></div>';
        content().querySelector('.oxx-file').addEventListener('change', loadFile);
        return;
      }
      var valid = state.preview.filter(function (item) { return item.state === 'ready' || item.state === 'done'; }).length;
      var invalid = state.preview.filter(function (item) { return item.state === 'invalid'; }).length;
      var failed = state.preview.filter(function (item) { return item.state === 'failed'; }).length;
      content().innerHTML = '<div class="oxx-card"><h4>١. ربط الأعمدة</h4><div class="oxx-grid">' + state.fields.map(function (field) {
        return '<label class="oxx-field"><span>' + esc(fieldLabel(field)) + (field.required ? ' *' : '') + '</span><select data-map="' + esc(field.key) + '"><option value="">— تجاهل العمود —</option>' + state.headers.map(function (header) { return '<option value="' + esc(header) + '"' + (state.mapping[field.key] === header ? ' selected' : '') + '>' + esc(header) + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div></div>' +
        '<div class="oxx-card"><h4>٢. معاينة قبل الحفظ</h4><div class="oxx-summary"><span class="oxx-ok">صالح: ' + valid + '</span><span class="oxx-bad">يحتاج تصحيحاً: ' + invalid + '</span>' + (failed ? '<span class="oxx-bad">رفضه الخادم: ' + failed + '</span>' : '') + '</div><div class="oxx-tablewrap"><table class="oxx-table"><thead><tr><th>الصف</th><th>الحالة</th><th>البيانات</th><th>الملاحظات</th></tr></thead><tbody>' + state.preview.slice(0, 100).map(function (item) {
          var note = item.serverError || item.errors.join('، ');
          var klass = item.state === 'ready' || item.state === 'done' ? 'oxx-ok' : 'oxx-bad';
          var label = item.state === 'done' ? 'تم' : (item.state === 'failed' ? 'مرفوض' : (item.state === 'invalid' ? 'غير صالح' : 'صالح'));
          return '<tr><td>' + item.rowNumber + '</td><td class="' + klass + '">' + label + '</td><td><code>' + esc(JSON.stringify(item.values)) + '</code></td><td>' + esc(note) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (state.preview.length > 100 ? '<p class="oxx-muted">تظهر أول 100 صف للمعاينة؛ سيُعالج كل الملف.</p>' : '') + '</div>' +
        '<div class="oxx-actions"><button class="oxx-btn oxx-btn-primary" data-act="start"' + (state.importing || !valid ? ' disabled' : '') + '>استيراد ' + valid + ' سجل صالح</button><button class="oxx-btn" data-act="replace"' + (state.importing ? ' disabled' : '') + '>اختيار ملف آخر</button></div>' +
        (state.importing ? '<div class="oxx-card"><div class="oxx-progress"><i style="width:' + (state.preview.length ? Math.round(state.done / state.preview.length * 100) : 0) + '%"></i></div><p class="oxx-muted">جارٍ معالجة ' + state.done + ' من ' + state.preview.length + ' صف…</p></div>' : '');
      Array.prototype.forEach.call(content().querySelectorAll('[data-map]'), function (select) {
        select.addEventListener('change', function () { state.mapping[select.getAttribute('data-map')] = select.value; rebuild(); });
      });
      var start = content().querySelector('[data-act="start"]');
      if (start) start.addEventListener('click', runImport);
      var replace = content().querySelector('[data-act="replace"]');
      if (replace) replace.addEventListener('click', function () { state.rows = []; state.preview = []; state.headers = []; render(); });
    }

    function rebuild() { state.preview = makePreview(state.rows, state.fields, state.mapping); render(); }
    function loadFile(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      toast('جارٍ قراءة ملف Excel…', 'info');
      loadXlsx().then(function (XLSX) {
        return file.arrayBuffer().then(function (buffer) {
          var workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
          var first = workbook.SheetNames[0];
          var raw = first ? XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: '', raw: false }) : [];
          if (!raw.length) throw new Error('ملف Excel لا يحتوي على صفوف بيانات');
          state.rows = raw;
          state.headers = fileColumns(raw);
          state.mapping = guessMapping(state.fields, state.headers);
          rebuild();
        });
      }).catch(function (error) { toast(error && error.message ? error.message : 'تعذر قراءة ملف Excel', 'error'); });
    }

    function runImport() {
      var queue = state.preview.filter(function (item) { return item.state === 'ready'; });
      if (!queue.length || state.importing) return;
      state.importing = true;
      state.done = 0;
      render();
      var cursor = 0;
      function worker() {
        var item = queue[cursor++];
        if (!item) return Promise.resolve();
        return api('/' + encodeURIComponent(entity) + '/create', { method: 'POST', body: item.values }).then(function (env) {
          if (env && env.success) item.state = 'done';
          else { item.state = 'failed'; item.serverError = (env && env.error) || 'رفض الخادم السجل'; }
          state.done += 1;
          render();
          return worker();
        });
      }
      var workers = [];
      for (var i = 0; i < Math.min(IMPORT_CONCURRENCY, queue.length); i += 1) workers.push(worker());
      Promise.all(workers).then(function () {
        state.importing = false;
        render();
        var completed = state.preview.filter(function (item) { return item.state === 'done'; }).length;
        var rejected = state.preview.filter(function (item) { return item.state === 'failed'; }).length;
        toast('اكتمل الاستيراد: ' + completed + ' سجل' + (rejected ? '، تعذر ' + rejected : ''), rejected ? 'info' : 'success');
        if (completed && typeof options.onDone === 'function') options.onDone();
      });
    }

    render();
  }

  window.OX.excel = {
    exportList: exportList,
    importInto: importInto,
    _internals: { normalizeRecord: normalizeRecord, guessMapping: guessMapping, makePreview: makePreview, isBlockedEntity: isBlockedEntity }
  };
})();
