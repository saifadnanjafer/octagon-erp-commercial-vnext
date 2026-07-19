// ============================================================================
// Octagon Commercial P0.7 — OX.views and OX.customFields extension.
// Pattern from AureusERP table-views/fields models; field type stays separate
// from display metadata as documented by NocoBase data-modeling. Re-expressed
// for the existing vanilla OX.crud component without modifying its owner file.
// ============================================================================
(function () {
  'use strict';
  window.OX = window.OX || {};
  var OX = window.OX;
  var API = '/api/x';
  var esc = (OX.crud && OX.crud._internals && OX.crud._internals.esc) || function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); };

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
    else console[type === 'error' ? 'error' : 'log']('[OX.views] ' + message);
  }
  function request(path, opts) {
    opts = opts || {}; opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); opts.headers['Content-Type'] = 'application/json'; }
    return fetch(API + path, opts).then(function (res) { return res.json().catch(function () { return { success:false, error:'استجابة غير صالحة' }; }).then(function (body) { if (!res.ok || !body.success) throw new Error(body.error || ('HTTP ' + res.status)); return body.data; }); });
  }

  OX.views = {
    list: function (entity) { return request('/_views/' + encodeURIComponent(entity)); },
    create: function (entity, name, config) { return request('/_views/' + encodeURIComponent(entity), { method:'POST', body:{ name:name, config:config } }); },
    update: function (entity, id, patch) { return request('/_views/' + encodeURIComponent(entity) + '/' + encodeURIComponent(id), { method:'PATCH', body:patch }); },
    remove: function (entity, id) { return request('/_views/' + encodeURIComponent(entity) + '/' + encodeURIComponent(id), { method:'DELETE' }); }
  };
  OX.customFields = {
    list: function (entity) { return request('/_custom-fields/' + encodeURIComponent(entity)); },
    create: function (entity, field) { return request('/_custom-fields/' + encodeURIComponent(entity), { method:'POST', body:field }); },
    update: function (entity, key, patch) { return request('/_custom-fields/' + encodeURIComponent(entity) + '/' + encodeURIComponent(key), { method:'PATCH', body:patch }); },
    remove: function (entity, key) { return request('/_custom-fields/' + encodeURIComponent(entity) + '/' + encodeURIComponent(key), { method:'DELETE' }); }
  };

  function fieldName(field) { return 'custom__' + field.key; }
  function flatten(record, fields) {
    if (!record || !fields) return record;
    var custom = record.custom && typeof record.custom === 'object' ? record.custom : {};
    fields.forEach(function (field) { record[fieldName(field)] = custom[field.key]; });
    return record;
  }
  function customInput(field, value) {
    var common = ' class="oxc-input oxc-custom-input" data-custom-key="' + esc(field.key) + '"';
    value = value == null ? '' : value;
    var options = Array.isArray(field.options) ? field.options : [];
    var control;
    if (field.type === 'textarea') control = '<textarea' + common + ' rows="3">' + esc(value) + '</textarea>';
    else if (field.type === 'select') control = '<select' + common + '><option value="">— اختر —</option>' + options.map(function (option) { var val = option && typeof option === 'object' ? option.value : option; var label = option && typeof option === 'object' ? (option.label_ar || option.label || option.value) : option; return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>'; }).join('') + '</select>';
    else control = '<input' + common + ' type="' + (field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text') + '" value="' + esc(value) + '">';
    return '<label class="oxc-field oxc-custom-field"><span class="oxc-label">' + esc(field.label_ar) + '</span>' + control + '</label>';
  }
  function waitFor(root, selector, fn) {
    var found = root.querySelector(selector); if (found) return fn(found);
    var observer = new MutationObserver(function () { var node = root.querySelector(selector); if (node) { observer.disconnect(); fn(node); } });
    observer.observe(root, { childList:true, subtree:true });
    window.setTimeout(function () { observer.disconnect(); }, 1500);
  }
  function patchInstance(instance, fields) {
    if (!instance || instance.__oxViewsFieldsPatched) return;
    instance.__oxViewsFieldsPatched = true; instance._oxCustomFields = fields || [];
    instance.cfg.columns = (instance.cfg.columns || []).concat(instance._oxCustomFields.map(function (field) { return { key:fieldName(field), label_ar:field.label_ar, type:field.type }; }));
    var renderTable = instance.renderTable;
    instance.renderTable = function () { (this.state.rows || []).forEach(function (row) { flatten(row, instance._oxCustomFields); }); return renderTable.apply(this, arguments); };
    var originalOpenForm = instance.openForm;
    instance.openForm = function (id) {
      var result = originalOpenForm.apply(this, arguments);
      var self = this;
      waitFor(this.root, '.oxc-form-fields', function (form) {
        if (form.querySelector('.oxc-custom-field')) return;
        var record = (self.state.rows || []).filter(function (row) { return String(row.id) === String(id); })[0] || {};
        var custom = record.custom && typeof record.custom === 'object' ? record.custom : {};
        var host = document.createElement('div'); host.className = 'oxc-custom-fields';
        host.innerHTML = self._oxCustomFields.map(function (field) { return customInput(field, custom[field.key]); }).join(''); form.appendChild(host);
        if (id && !record.custom) request('/' + encodeURIComponent(self.entity) + '/read/' + encodeURIComponent(id)).then(function (fresh) { var values = fresh.custom || {}; host.querySelectorAll('[data-custom-key]').forEach(function (input) { input.value = values[input.getAttribute('data-custom-key')] == null ? '' : values[input.getAttribute('data-custom-key')]; }); }).catch(function () {});
      });
      return result;
    };
    var collectForm = instance.collectForm;
    instance.collectForm = function () {
      var result = collectForm.apply(this, arguments); var custom = {};
      this.root.querySelectorAll('[data-custom-key]').forEach(function (input) { var value = input.value; if (input.type === 'number') value = value === '' ? null : Number(value); custom[input.getAttribute('data-custom-key')] = value; });
      if (Object.keys(custom).length) result.values.custom = custom;
      return result;
    };
    var originalSkeleton = instance.renderSkeleton;
    // Existing skeleton is already built; add a save button to the view filter bar.
    var bar = instance.root.querySelector('.oxc-filterbar');
    if (bar && !bar.querySelector('.oxc-save-view')) {
      var save = document.createElement('button'); save.type = 'button'; save.className = 'oxc-btn oxc-btn-ghost oxc-save-view'; save.textContent = '💾 حفظ العرض';
      save.addEventListener('click', function () { var name = window.prompt('اسم طريقة العرض'); if (!name || !name.trim()) return; OX.views.create(instance.entity, name.trim(), { q:instance.state.q, filters:instance.state.filters, sort:instance.state.sort, columns:(instance.cfg.columns || []).map(function (column) { return column.key; }) }).then(function () { toast('تم حفظ طريقة العرض', 'success'); instance.loadViews(); }).catch(function (error) { toast(error.message || 'تعذر حفظ طريقة العرض', 'error'); }); });
      bar.appendChild(save);
    }
  }
  function installCrudExtension() {
    if (!OX.crud || OX.crud.__oxViewsFieldsExtension) return !!OX.crud;
    OX.crud.__oxViewsFieldsExtension = true;
    var baseMount = OX.crud.mount;
    OX.crud.mount = function (el, config) {
      var instance = baseMount.call(OX.crud, el, config);
      OX.customFields.list(config && config.entity).then(function (fields) { patchInstance(instance, fields); if (instance && typeof instance.refresh === 'function') instance.refresh(); }).catch(function () { patchInstance(instance, []); });
      return instance;
    };
    return true;
  }
  if (!installCrudExtension()) window.addEventListener('DOMContentLoaded', installCrudExtension, { once:true });
})();
