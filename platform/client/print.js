/**
 * Octagon Commercial — client template print (P0.9).
 * Pattern from erp-research/nocobase-main/docs/docs/en/template-print/ and
 * erp-research/idurar-erp-crm-master/backend/src/controllers/pdfController/
 * (template + model -> printable document), re-expressed as browser HTML.
 *
 * `OX.print.record(entity, id)` is called by the existing P0.6 row menu.
 * It loads a record and its matching `print_template`, renders only escaped
 * {{field}} / {{nested.field}} placeholders, and prints an isolated iframe.
 */
(function () {
  'use strict';

  window.OX = window.OX || {};
  var API = '/api/x';
  var FRAME_ID = 'ox-print-frame';

  function toast(message, type) {
    if (typeof window.showToast === 'function') return window.showToast(message, type || 'info');
    if (window.console) window.console[type === 'error' ? 'error' : 'log']('[OX.print] ' + message);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function request(path) {
    return window.fetch(API + path, { credentials: 'same-origin' })
      .then(function (response) { return response.json().catch(function () { return { success: false, error: 'استجابة غير صالحة من الخادم' }; }); })
      .catch(function (error) { return { success: false, error: 'تعذر الاتصال بالخادم: ' + (error && error.message || error) }; });
  }

  function pathValue(source, path) {
    if (!path) return '';
    var current = source;
    String(path).split('.').forEach(function (part) {
      if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) { current = ''; return; }
      current = current[part];
    });
    if (current == null) return '';
    if (typeof current === 'object') return Array.isArray(current) ? current.map(String).join('، ') : JSON.stringify(current);
    return current;
  }

  function render(template, record) {
    return String(template || '').replace(/{{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g, function (_, path) {
      return esc(pathValue(record, path));
    });
  }

  function titleFor(entity, record) {
    var name = record.name || record.title || record.id || '';
    return 'طباعة — ' + (name || entity || 'سجل');
  }

  function genericTemplate(entity) {
    return {
      id: 'generic-' + entity,
      name: 'طباعة السجل',
      format: 'A4',
      html: '<section class="ox-print-doc"><header><h1>تفاصيل السجل</h1><p>{{name}}</p></header><table class="ox-print-table">{{__rows}}</table><footer>تمت الطباعة من أوكتاغون التجاري</footer></section>'
    };
  }

  function genericRows(record) {
    return Object.keys(record || {}).filter(function (key) {
      return ['id', 'entity', 'created_at', 'updated_at', 'created_by', 'removed', 'custom'].indexOf(key) === -1 && typeof record[key] !== 'object';
    }).map(function (key) {
      return '<tr><th>' + esc(key.replace(/_/g, ' ')) + '</th><td>' + esc(record[key]) + '</td></tr>';
    }).join('') || '<tr><td>لا توجد حقول قابلة للطباعة</td></tr>';
  }

  function documentHtml(content, title, format) {
    var pageSize = String(format || 'A4').toUpperCase() === 'A5' ? 'A5' : 'A4';
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      '@page{size:' + pageSize + ';margin:14mm}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:Tahoma,"Segoe UI",Arial,sans-serif;font-size:12pt;line-height:1.65}.ox-print-doc{width:100%}.ox-print-doc header{border-bottom:2px solid var(--ox-print-accent,#0f766e);padding-bottom:12px;margin-bottom:18px}.ox-print-doc h1{font-size:23pt;margin:0;color:var(--ox-print-accent,#0f766e)}.ox-print-doc h2{font-size:15pt;margin:20px 0 6px}.ox-print-doc p{margin:4px 0}.ox-print-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 22px}.ox-print-grid p{border-bottom:1px solid #dce4e7;padding:4px 0}.ox-print-table{width:100%;border-collapse:collapse;margin-top:12px}.ox-print-table th,.ox-print-table td{padding:8px 10px;border:1px solid #cbd5e1;text-align:right;vertical-align:top}.ox-print-table th{width:34%;background:#f1f5f9}.ox-print-doc footer{margin-top:28px;padding-top:10px;border-top:1px solid #dce4e7;color:#52606d;font-size:10pt}@media print{body{background:#fff}.ox-print-doc{break-inside:avoid}}@media(max-width:500px){.ox-print-grid{grid-template-columns:1fr}}' +
      '</style></head><body>' + content + '</body></html>';
  }

  function frame() {
    var existing = document.getElementById(FRAME_ID);
    if (existing) existing.remove();
    var element = document.createElement('iframe');
    element.id = FRAME_ID;
    element.title = 'معاينة الطباعة';
    element.setAttribute('aria-hidden', 'true');
    // The document layout may contain administrator-authored HTML. Keep it
    // scriptless and cross-origin from the host while allowing the print UI.
    element.setAttribute('sandbox', 'allow-modals');
    element.style.cssText = 'position:fixed;width:1px;height:1px;border:0;right:-10px;bottom:-10px;opacity:0;pointer-events:none';
    document.body.appendChild(element);
    return element;
  }

  function preview(input) {
    var entity = input && input.entity || '';
    var record = input && input.record || {};
    var template = input && input.template || genericTemplate(entity);
    var html = template.html || genericTemplate(entity).html;
    var rows = genericRows(record);
    html = html.replace(/{{\s*__rows\s*}}/g, rows);
    html = render(html, record);
    var printFrame = frame();
    printFrame.onload = function () {
      try {
        var win = printFrame.contentWindow;
        win.focus();
        win.print();
      } catch (error) { toast('تعذر فتح معاينة الطباعة: ' + (error.message || error), 'error'); }
    };
    printFrame.srcdoc = documentHtml(html, titleFor(entity, record), template.format);
    return printFrame;
  }

  function normalizeRecord(data) {
    if (!data || typeof data !== 'object') return {};
    return Object.assign({}, data, data.data && typeof data.data === 'object' ? data.data : {});
  }

  function firstTemplate(data) {
    var templates = Array.isArray(data) ? data : [];
    return templates[0] || null;
  }

  function record(entity, id) {
    if (!entity || !id) { toast('بيانات السجل المطلوب طباعته غير مكتملة', 'error'); return Promise.resolve(null); }
    return Promise.all([
      request('/' + encodeURIComponent(entity) + '/read/' + encodeURIComponent(id)),
      request('/print/templates?entity=' + encodeURIComponent(entity))
    ]).then(function (results) {
      var recordResponse = results[0];
      var templatesResponse = results[1];
      if (!recordResponse.success) { toast(recordResponse.error || 'تعذر تحميل السجل للطباعة', 'error'); return null; }
      var template = templatesResponse.success ? firstTemplate(templatesResponse.data) : null;
      return preview({ entity: entity, record: normalizeRecord(recordResponse.data), template: template || genericTemplate(entity) });
    });
  }

  window.OX.print = {
    record: record,
    preview: preview,
    render: render,
    genericTemplate: genericTemplate,
  };
}());
