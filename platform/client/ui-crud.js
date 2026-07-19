/**
 * OCTAGON COMMERCIAL — Platform: config-driven CRUD UI (P0.6).
 *
 * `OX.crud.mount(el, config)` renders a full entity worklist against the /api/x
 * contract (build-book §4): summary cards, filter bar + saved-views hook,
 * server-side sorted/paginated DataTable, side-drawer create/edit form,
 * detail drawer w/ chatter container, row menu + toolbar placeholders.
 *
 * Concept from idurar-erp-crm frontend/src/modules/{CrudModule,ErpPanelModule}
 * (config-driven panel) — re-expressed in vanilla JS for Octagon (no build step).
 *
 * Envelope: {success, data, error, meta:{total,page,limit}}
 * Routes:   POST /api/x/:e/create · GET /read/:id · PATCH /update/:id
 *           DELETE /delete/:id · GET /list?page&limit&sort&q&filter=<json> · GET /summary
 *
 * Optional collaborators (feature-detected, never required):
 *   OX.views (P0.7) · OX.excel (P0.8) · OX.print (P0.9) · OX.chatter (P0.3)
 *
 * NEW FILE — add-only. Never touches app.js / index.html / modules/*.
 */
(function () {
  'use strict';

  window.OX = window.OX || {};

  var API_BASE = '/api/x';
  var DEFAULT_PAGE_SIZE = 20;
  var SEARCH_DEBOUNCE_MS = 300;
  var RELATION_DEBOUNCE_MS = 250;
  var RELATION_RESULT_LIMIT = 10;

  /* ------------------------------------------------------------------ utils */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type || 'info'); return; }
    try { console[type === 'error' ? 'error' : 'log']('[OX.crud] ' + msg); } catch (_) {}
  }

  function fmtNum(v) {
    var n = Number(v);
    if (!isFinite(n)) return esc(v);
    return n.toLocaleString('en-US');
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  }

  /** fetch wrapper — always resolves to an envelope, never throws. */
  function api(path, opts) {
    var options = Object.assign({ headers: {} }, opts || {});
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
      options.headers['Content-Type'] = 'application/json';
    }
    return fetch(API_BASE + path, options)
      .then(function (res) {
        return res.json().catch(function () {
          return { success: false, error: 'استجابة غير صالحة من الخادم (' + res.status + ')' };
        });
      })
      .then(function (env) {
        if (!env || typeof env !== 'object') return { success: false, error: 'استجابة فارغة من الخادم' };
        return env;
      })
      .catch(function (err) {
        return { success: false, error: 'تعذر الاتصال بالخادم: ' + (err && err.message ? err.message : err) };
      });
  }

  /**
   * x_records rows arrive as {entity,id,data:{...json...},created_at,...}.
   * Normalize to a flat object; tolerate already-flat rows and string JSON.
   */
  function normalizeRecord(row) {
    if (!row || typeof row !== 'object') return {};
    var data = row.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = null; } }
    if (data && typeof data === 'object') {
      return Object.assign(
        { id: row.id, created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by },
        data
      );
    }
    return row;
  }

  /** Normalize /summary payload shapes: {total|count, byStatus|by_status|statuses}. */
  function normalizeSummary(data) {
    data = data || {};
    var byStatus = data.byStatus || data.by_status || data.statuses || {};
    if (Array.isArray(byStatus)) {
      var map = {};
      byStatus.forEach(function (r) {
        if (r && r.status != null) map[r.status] = r.count != null ? r.count : r.total;
      });
      byStatus = map;
    }
    var total = data.total != null ? data.total : (data.count != null ? data.count : null);
    return { total: total, byStatus: byStatus };
  }

  /* --------------------------------------------------------------- instance */

  function CrudInstance(rootEl, config) {
    this.root = rootEl;
    this.cfg = config || {};
    this.entity = this.cfg.entity;
    this.state = {
      page: 1,
      limit: this.cfg.pageSize || DEFAULT_PAGE_SIZE,
      sort: this.cfg.defaultSort || null,   // {key, dir:'asc'|'desc'}
      q: '',
      filters: {},                          // key → value (equality)
      rows: [],
      meta: { total: 0, page: 1, limit: this.cfg.pageSize || DEFAULT_PAGE_SIZE },
      summary: null,
      loading: false,
      error: null
    };
    this._seq = 0; // stale-response guard
  }

  CrudInstance.prototype.init = function () {
    if (!this.root || !this.entity) {
      toast('OX.crud.mount: يلزم عنصر وحاوية إعداد entity', 'error');
      return;
    }
    this.root.classList.add('oxc-root');
    this.root.setAttribute('dir', 'rtl');
    this.renderSkeleton();
    this.bindEvents();
    this.loadViews();
    this.refresh();
  };

  /* ---------------------------------------------------------- skeleton HTML */

  CrudInstance.prototype.renderSkeleton = function () {
    var cfg = this.cfg;
    var title = cfg.label_ar || this.entity;
    var filtersHtml = (cfg.filters || []).map(function (f) {
      var opts = ['<option value="">' + esc(f.label_ar) + ': الكل</option>'];
      (f.options || []).forEach(function (o) {
        opts.push('<option value="' + esc(o.value) + '">' + esc(o.label_ar || o.label) + '</option>');
      });
      return '<select class="oxc-input oxc-filter" data-filter-key="' + esc(f.key) + '">' + opts.join('') + '</select>';
    }).join('');

    this.root.innerHTML =
      '<div class="oxc-head">' +
        '<h2 class="oxc-title">' + esc(title) + '</h2>' +
        '<div class="oxc-toolbar">' +
          '<button type="button" class="btn-primary oxc-btn" data-act="new">➕ جديد</button>' +
          '<button type="button" class="oxc-btn oxc-btn-ghost" data-act="export">📤 تصدير</button>' +
          '<button type="button" class="oxc-btn oxc-btn-ghost" data-act="import">📥 استيراد</button>' +
          '<button type="button" class="oxc-btn oxc-btn-ghost" data-act="reload" title="تحديث">🔄</button>' +
        '</div>' +
      '</div>' +
      '<div class="oxc-cards" data-role="cards"></div>' +
      '<div class="oxc-filterbar">' +
        '<input type="search" class="oxc-input oxc-search" data-role="search" placeholder="🔍 بحث..." autocomplete="off">' +
        filtersHtml +
        '<select class="oxc-input oxc-views" data-role="views" title="طرق العرض المحفوظة">' +
          '<option value="">طرق العرض</option>' +
        '</select>' +
      '</div>' +
      '<div class="oxc-tablewrap" data-role="tablewrap"></div>' +
      '<div class="oxc-pager" data-role="pager"></div>' +
      '<div class="oxc-overlay" data-role="overlay" hidden></div>' +
      '<div class="oxc-drawer" data-role="drawer" hidden></div>' +
      '<div class="oxc-rowmenu" data-role="rowmenu" hidden></div>';
  };

  /* ----------------------------------------------------------------- events */

  CrudInstance.prototype.bindEvents = function () {
    var self = this;

    // Re-mount safety: detach any listeners a previous mount left on this element.
    if (this.root.__oxcOnClick) this.root.removeEventListener('click', this.root.__oxcOnClick);
    if (this.root.__oxcOnChange) this.root.removeEventListener('change', this.root.__oxcOnChange);
    if (this.root.__oxcDocClick) document.removeEventListener('click', this.root.__oxcDocClick);

    var onClick = function (ev) { self.onClick(ev); };
    this.root.__oxcOnClick = onClick;
    this.root.addEventListener('click', onClick);

    var search = this.root.querySelector('[data-role="search"]');
    if (search) {
      search.addEventListener('input', debounce(function () {
        self.state.q = search.value.trim();
        self.state.page = 1;
        self.loadList();
      }, SEARCH_DEBOUNCE_MS));
    }

    var onChange = function (ev) {
      var t = ev.target;
      if (t.matches('.oxc-filter')) {
        var key = t.getAttribute('data-filter-key');
        if (t.value === '') delete self.state.filters[key];
        else self.state.filters[key] = t.value;
        self.state.page = 1;
        self.loadList();
      } else if (t.matches('[data-role="views"]')) {
        self.applyView(t.value);
      }
    };
    this.root.__oxcOnChange = onChange;
    this.root.addEventListener('change', onChange);

    // Close the floating row menu on any outside click.
    var onDocClick = function (ev) {
      var menu = self.root.querySelector('[data-role="rowmenu"]');
      if (menu && !menu.hidden && !menu.contains(ev.target) && !ev.target.closest('[data-act="rowmenu"]')) {
        menu.hidden = true;
      }
    };
    this.root.__oxcDocClick = onDocClick;
    document.addEventListener('click', onDocClick);
  };

  CrudInstance.prototype.onClick = function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn || !this.root.contains(btn)) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    switch (act) {
      case 'new': this.openForm(null); break;
      case 'reload': this.refresh(); break;
      case 'export': this.doExport(); break;
      case 'import': this.doImport(); break;
      case 'sort': this.toggleSort(btn.getAttribute('data-key')); break;
      case 'page': this.gotoPage(Number(btn.getAttribute('data-page'))); break;
      case 'rowmenu': ev.stopPropagation(); this.openRowMenu(btn, id); break;
      case 'view': this.openDetail(id); break;
      case 'edit': this.openForm(id); break;
      case 'delete': this.doDelete(id); break;
      case 'print': this.doPrint(id); break;
      case 'chatter': this.openDetail(id, true); break;
      case 'drawer-close': this.closeDrawer(); break;
      case 'drawer-save': this.saveForm(); break;
      case 'detail-edit': this.closeDrawer(); this.openForm(id); break;
      case 'rel-pick': this.pickRelation(btn); break;
    }
  };

  /* ------------------------------------------------------------ data loading */

  CrudInstance.prototype.refresh = function () {
    this.loadSummary();
    this.loadList();
  };

  CrudInstance.prototype.buildListQuery = function () {
    var s = this.state;
    var parts = ['page=' + s.page, 'limit=' + s.limit];
    if (s.sort && s.sort.key) parts.push('sort=' + encodeURIComponent(s.sort.key + ':' + s.sort.dir));
    if (s.q) parts.push('q=' + encodeURIComponent(s.q));
    if (Object.keys(s.filters).length) parts.push('filter=' + encodeURIComponent(JSON.stringify(s.filters)));
    return '?' + parts.join('&');
  };

  CrudInstance.prototype.loadList = function () {
    var self = this;
    var seq = ++this._seq;
    this.state.loading = true;
    this.state.error = null;
    this.renderTable();

    api('/' + this.entity + '/list' + this.buildListQuery()).then(function (env) {
      if (seq !== self._seq) return; // stale
      self.state.loading = false;
      if (!env.success) {
        self.state.error = env.error || 'خطأ غير معروف';
        self.state.rows = [];
      } else {
        var data = env.data;
        var rows = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
        self.state.rows = rows.map(normalizeRecord);
        var meta = env.meta || {};
        self.state.meta = {
          total: meta.total != null ? meta.total : self.state.rows.length,
          page: meta.page != null ? Number(meta.page) : self.state.page,
          limit: meta.limit != null ? Number(meta.limit) : self.state.limit
        };
      }
      self.renderTable();
      self.renderPager();
    });
  };

  CrudInstance.prototype.loadSummary = function () {
    var self = this;
    api('/' + this.entity + '/summary').then(function (env) {
      self.state.summary = env.success ? normalizeSummary(env.data) : null;
      self.renderCards();
    });
  };

  /* ------------------------------------------------------------ summary cards */

  CrudInstance.prototype.renderCards = function () {
    var host = this.root.querySelector('[data-role="cards"]');
    if (!host) return;
    var sum = this.state.summary;
    if (!sum) { host.innerHTML = ''; return; }

    var cfg = this.cfg;
    var cards = [];
    var specs = cfg.summaryCards;
    if (!specs || !specs.length) {
      // Auto: total + one card per known status badge.
      specs = [{ key: 'total', label_ar: 'الإجمالي', accent: 'blue' }];
      var statusCol = (cfg.columns || []).filter(function (c) { return c.badge; })[0];
      if (statusCol) {
        Object.keys(statusCol.badge).forEach(function (val) {
          specs.push({ key: 'status:' + val, label_ar: statusCol.badge[val].label, accent: statusCol.badge[val].color });
        });
      }
    }
    specs.forEach(function (spec) {
      var val;
      if (spec.key === 'total') val = sum.total;
      else if (spec.key.indexOf('status:') === 0) val = sum.byStatus[spec.key.slice(7)];
      else val = sum.byStatus[spec.key];
      if (val == null) val = 0;
      cards.push(
        '<div class="oxc-card oxc-card-' + esc(spec.accent || 'gray') + '">' +
          '<div class="oxc-card-val">' + fmtNum(val) + '</div>' +
          '<div class="oxc-card-label">' + esc(spec.label_ar) + '</div>' +
        '</div>'
      );
    });
    host.innerHTML = cards.join('');
  };

  /* -------------------------------------------------------------- data table */

  CrudInstance.prototype.badgeHtml = function (col, value) {
    var b = col.badge && col.badge[value];
    if (!b) return esc(value == null ? '—' : value);
    return '<span class="oxc-badge oxc-b-' + esc(b.color || 'gray') + '">' + esc(b.label) + '</span>';
  };

  CrudInstance.prototype.cellHtml = function (col, record) {
    var v = record[col.key];
    if (typeof col.render === 'function') {
      try { return col.render(v, record); } catch (_) { return esc(v); }
    }
    if (col.badge) return this.badgeHtml(col, v);
    if (col.type === 'number') return '<span class="oxc-num">' + fmtNum(v == null ? 0 : v) + '</span>';
    if (v == null || v === '') return '<span class="oxc-muted">—</span>';
    return esc(v);
  };

  CrudInstance.prototype.renderTable = function () {
    var host = this.root.querySelector('[data-role="tablewrap"]');
    if (!host) return;
    var s = this.state;

    if (s.loading) {
      host.innerHTML = '<div class="oxc-state oxc-state-loading"><span class="oxc-spinner"></span> جاري التحميل...</div>';
      return;
    }
    if (s.error) {
      host.innerHTML =
        '<div class="oxc-state oxc-state-error">⚠️ ' + esc(s.error) +
        ' <button type="button" class="oxc-btn oxc-btn-ghost" data-act="reload">إعادة المحاولة</button></div>';
      return;
    }
    if (!s.rows.length) {
      host.innerHTML =
        '<div class="oxc-state oxc-state-empty">لا توجد سجلات' +
        (s.q || Object.keys(s.filters).length ? ' مطابقة للبحث/التصفية' : '') +
        '<br><button type="button" class="btn-primary oxc-btn" data-act="new">➕ إنشاء أول سجل</button></div>';
      return;
    }

    var self = this;
    var cols = this.cfg.columns || [];
    var ths = cols.map(function (c) {
      var sortable = c.sortable !== false;
      var arrow = '';
      if (s.sort && s.sort.key === c.key) arrow = s.sort.dir === 'asc' ? ' ▲' : ' ▼';
      if (!sortable) return '<th>' + esc(c.label_ar) + '</th>';
      return '<th class="oxc-th-sort" data-act="sort" data-key="' + esc(c.key) + '">' + esc(c.label_ar) + arrow + '</th>';
    }).join('') + '<th class="oxc-th-actions"></th>';

    var trs = s.rows.map(function (r) {
      var tds = cols.map(function (c) { return '<td>' + self.cellHtml(c, r) + '</td>'; }).join('');
      tds += '<td class="oxc-td-actions">' +
        '<button type="button" class="oxc-menu-btn" data-act="rowmenu" data-id="' + esc(r.id) + '" title="إجراءات">⋮</button></td>';
      return '<tr data-row-id="' + esc(r.id) + '">' + tds + '</tr>';
    }).join('');

    host.innerHTML =
      '<div class="table-container oxc-table-container"><div class="table-scroll">' +
        '<table class="data-table oxc-table"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>' +
      '</div></div>';
  };

  CrudInstance.prototype.toggleSort = function (key) {
    var s = this.state;
    if (s.sort && s.sort.key === key) s.sort = { key: key, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' };
    else s.sort = { key: key, dir: 'asc' };
    s.page = 1;
    this.loadList();
  };

  /* ------------------------------------------------------------------- pager */

  CrudInstance.prototype.renderPager = function () {
    var host = this.root.querySelector('[data-role="pager"]');
    if (!host) return;
    var m = this.state.meta;
    var pages = Math.max(1, Math.ceil((m.total || 0) / (m.limit || 1)));
    if (this.state.error || (!this.state.rows.length && m.total === 0)) { host.innerHTML = ''; return; }

    var cur = m.page || 1;
    var btns = [];
    btns.push('<button type="button" class="oxc-page-btn" data-act="page" data-page="' + (cur - 1) + '"' + (cur <= 1 ? ' disabled' : '') + '>السابق</button>');
    var from = Math.max(1, cur - 2), to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    for (var p = from; p <= to; p++) {
      btns.push('<button type="button" class="oxc-page-btn' + (p === cur ? ' oxc-page-cur' : '') + '" data-act="page" data-page="' + p + '">' + p + '</button>');
    }
    btns.push('<button type="button" class="oxc-page-btn" data-act="page" data-page="' + (cur + 1) + '"' + (cur >= pages ? ' disabled' : '') + '>التالي</button>');

    host.innerHTML =
      '<span class="oxc-pager-info">إجمالي: ' + fmtNum(m.total) + ' — صفحة ' + cur + ' من ' + pages + '</span>' +
      '<span class="oxc-pager-btns">' + btns.join('') + '</span>';
  };

  CrudInstance.prototype.gotoPage = function (p) {
    var pages = Math.max(1, Math.ceil((this.state.meta.total || 0) / (this.state.meta.limit || 1)));
    if (!p || p < 1 || p > pages || p === this.state.meta.page) return;
    this.state.page = p;
    this.loadList();
  };

  /* ---------------------------------------------------------------- row menu */

  CrudInstance.prototype.openRowMenu = function (anchorBtn, id) {
    var menu = this.root.querySelector('[data-role="rowmenu"]');
    if (!menu) return;
    menu.innerHTML = [
      ['view', '👁️ عرض'],
      ['edit', '✏️ تعديل'],
      ['print', '🖨️ طباعة'],
      ['chatter', '💬 محادثة'],
      ['delete', '🗑️ حذف']
    ].map(function (a) {
      return '<button type="button" class="oxc-rowmenu-item' + (a[0] === 'delete' ? ' oxc-danger' : '') +
        '" data-act="' + a[0] + '" data-id="' + esc(id) + '">' + a[1] + '</button>';
    }).join('');
    menu.hidden = false;
    // Position under the anchor, relative to the (positioned) root.
    var rootRect = this.root.getBoundingClientRect();
    var btnRect = anchorBtn.getBoundingClientRect();
    menu.style.top = (btnRect.bottom - rootRect.top + 4) + 'px';
    var left = btnRect.left - rootRect.left - menu.offsetWidth + btnRect.width;
    menu.style.left = Math.max(4, left) + 'px';
  };

  /* -------------------------------------------------------- drawer (generic) */

  CrudInstance.prototype.openDrawerShell = function (titleHtml, bodyHtml, footHtml) {
    var overlay = this.root.querySelector('[data-role="overlay"]');
    var drawer = this.root.querySelector('[data-role="drawer"]');
    drawer.innerHTML =
      '<div class="oxc-drawer-head">' +
        '<div class="oxc-drawer-title">' + titleHtml + '</div>' +
        '<button type="button" class="oxc-drawer-x" data-act="drawer-close" title="إغلاق">✕</button>' +
      '</div>' +
      '<div class="oxc-drawer-body">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="oxc-drawer-foot">' + footHtml + '</div>' : '');
    overlay.hidden = false;
    drawer.hidden = false;
    var self = this;
    overlay.onclick = function () { self.closeDrawer(); };
    requestAnimationFrame(function () { drawer.classList.add('oxc-drawer-open'); overlay.classList.add('oxc-overlay-open'); });
  };

  CrudInstance.prototype.closeDrawer = function () {
    var overlay = this.root.querySelector('[data-role="overlay"]');
    var drawer = this.root.querySelector('[data-role="drawer"]');
    drawer.classList.remove('oxc-drawer-open');
    overlay.classList.remove('oxc-overlay-open');
    var self = this;
    setTimeout(function () { drawer.hidden = true; overlay.hidden = true; self._editingId = null; }, 200);
  };

  /* ------------------------------------------------------------ create / edit */

  CrudInstance.prototype.fieldHtml = function (f, value, record) {
    var req = f.required ? ' <span class="oxc-req">*</span>' : '';
    var label = '<label class="oxc-flabel">' + esc(f.label_ar) + req + '</label>';
    var v = value == null ? '' : value;
    var name = ' data-fkey="' + esc(f.key) + '"';

    switch (f.type) {
      case 'textarea':
        return label + '<textarea class="oxc-input oxc-finput" rows="3"' + name + '>' + esc(v) + '</textarea>';
      case 'number':
        return label + '<input type="number" step="any" class="oxc-input oxc-finput"' + name + ' value="' + esc(v) + '">';
      case 'date':
        return label + '<input type="date" class="oxc-input oxc-finput"' + name + ' value="' + esc(v) + '">';
      case 'select':
        var opts = ['<option value="">— اختر —</option>'];
        (f.options || []).forEach(function (o) {
          var val = o.value != null ? o.value : o;
          var lab = o.label_ar || o.label || o;
          opts.push('<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>');
        });
        return label + '<select class="oxc-input oxc-finput"' + name + '>' + opts.join('') + '</select>';
      case 'relation':
        var labelKey = (f.relation && f.relation.labelKey) || 'name';
        var relEntity = (f.relation && f.relation.entity) || f.key;
        var curLabel = record ? (record[f.key + '_label'] || '') : '';
        return label +
          '<div class="oxc-rel" data-rel-entity="' + esc(relEntity) + '" data-rel-labelkey="' + esc(labelKey) + '" data-rel-key="' + esc(f.key) + '">' +
            '<input type="text" class="oxc-input oxc-rel-search" placeholder="ابحث في ' + esc(f.label_ar) + '..." value="' + esc(curLabel) + '" autocomplete="off">' +
            '<input type="hidden" class="oxc-finput oxc-rel-value" data-fkey="' + esc(f.key) + '" value="' + esc(v) + '">' +
            '<input type="hidden" class="oxc-finput" data-fkey="' + esc(f.key) + '_label" value="' + esc(curLabel) + '">' +
            '<div class="oxc-rel-list" hidden></div>' +
          '</div>';
      default: // text
        return label + '<input type="text" class="oxc-input oxc-finput"' + name + ' value="' + esc(v) + '">';
    }
  };

  CrudInstance.prototype.openForm = function (id) {
    var self = this;
    this._editingId = id || null;
    var record = id ? this.state.rows.filter(function (r) { return String(r.id) === String(id); })[0] : null;

    var buildAndShow = function (rec) {
      var fields = (self.cfg.form || []).map(function (f) {
        return '<div class="oxc-field">' + self.fieldHtml(f, rec ? rec[f.key] : (f.default != null ? f.default : ''), rec) + '</div>';
      }).join('');
      var title = (id ? '✏️ تعديل ' : '➕ إنشاء ') + esc(self.cfg.label_singular_ar || self.cfg.label_ar || self.entity);
      self.openDrawerShell(
        title,
        '<form class="oxc-form" onsubmit="return false">' + fields + '<div class="oxc-form-err" data-role="formerr" hidden></div></form>',
        '<button type="button" class="btn-primary oxc-btn" data-act="drawer-save">💾 حفظ</button>' +
        '<button type="button" class="oxc-btn oxc-btn-ghost" data-act="drawer-close">إلغاء</button>'
      );
      self.bindRelationInputs();
    };

    if (id && !record) {
      // Not in the current page — fetch it.
      api('/' + this.entity + '/read/' + encodeURIComponent(id)).then(function (env) {
        if (!env.success) { toast(env.error || 'تعذر تحميل السجل', 'error'); return; }
        buildAndShow(normalizeRecord(env.data));
      });
    } else {
      buildAndShow(record);
    }
  };

  CrudInstance.prototype.bindRelationInputs = function () {
    var self = this;
    var rels = this.root.querySelectorAll('.oxc-rel');
    Array.prototype.forEach.call(rels, function (relBox) {
      var search = relBox.querySelector('.oxc-rel-search');
      var list = relBox.querySelector('.oxc-rel-list');
      var relEntity = relBox.getAttribute('data-rel-entity');
      var labelKey = relBox.getAttribute('data-rel-labelkey');

      var run = debounce(function () {
        var q = search.value.trim();
        api('/' + relEntity + '/list?page=1&limit=' + RELATION_RESULT_LIMIT + (q ? '&q=' + encodeURIComponent(q) : ''))
          .then(function (env) {
            if (!env.success) { list.innerHTML = '<div class="oxc-rel-empty">' + esc(env.error || 'خطأ') + '</div>'; list.hidden = false; return; }
            var rows = (Array.isArray(env.data) ? env.data : []).map(normalizeRecord);
            if (!rows.length) { list.innerHTML = '<div class="oxc-rel-empty">لا نتائج</div>'; list.hidden = false; return; }
            list.innerHTML = rows.map(function (r) {
              var lab = r[labelKey] != null ? r[labelKey] : r.id;
              return '<button type="button" class="oxc-rel-item" data-act="rel-pick" data-rel-id="' + esc(r.id) + '" data-rel-label="' + esc(lab) + '">' + esc(lab) + '</button>';
            }).join('');
            list.hidden = false;
          });
      }, RELATION_DEBOUNCE_MS);

      search.addEventListener('input', function () {
        // typing invalidates the previous pick
        relBox.querySelector('.oxc-rel-value').value = '';
        run();
      });
      search.addEventListener('focus', run);
      search.addEventListener('blur', function () { setTimeout(function () { list.hidden = true; }, 250); });
    });
  };

  CrudInstance.prototype.pickRelation = function (btn) {
    var relBox = btn.closest('.oxc-rel');
    if (!relBox) return;
    relBox.querySelector('.oxc-rel-value').value = btn.getAttribute('data-rel-id');
    relBox.querySelector('[data-fkey$="_label"]').value = btn.getAttribute('data-rel-label');
    relBox.querySelector('.oxc-rel-search').value = btn.getAttribute('data-rel-label');
    relBox.querySelector('.oxc-rel-list').hidden = true;
  };

  CrudInstance.prototype.collectForm = function () {
    var self = this;
    var out = {};
    var errors = [];
    (this.cfg.form || []).forEach(function (f) {
      var input = self.root.querySelector('.oxc-finput[data-fkey="' + f.key + '"]');
      if (!input) return;
      var v = input.value;
      if (f.type === 'number') {
        v = v === '' ? null : Number(v);
        if (v != null && !isFinite(v)) { errors.push('«' + f.label_ar + '» يجب أن يكون رقماً'); v = null; }
      } else {
        v = String(v).trim();
      }
      if (f.required && (v == null || v === '')) errors.push('«' + f.label_ar + '» حقل مطلوب');
      out[f.key] = v;
      // carry the human label of relations for display without a join
      if (f.type === 'relation') {
        var lab = self.root.querySelector('.oxc-finput[data-fkey="' + f.key + '_label"]');
        if (lab) out[f.key + '_label'] = String(lab.value || '').trim();
      }
    });
    return { values: out, errors: errors };
  };

  CrudInstance.prototype.saveForm = function () {
    var self = this;
    var res = this.collectForm();
    var errBox = this.root.querySelector('[data-role="formerr"]');
    if (res.errors.length) {
      if (errBox) { errBox.innerHTML = res.errors.map(esc).join('<br>'); errBox.hidden = false; }
      toast('يرجى تصحيح الحقول المطلوبة', 'error');
      return;
    }
    if (errBox) errBox.hidden = true;

    var id = this._editingId;
    var req = id
      ? api('/' + this.entity + '/update/' + encodeURIComponent(id), { method: 'PATCH', body: res.values })
      : api('/' + this.entity + '/create', { method: 'POST', body: res.values });

    req.then(function (env) {
      if (!env.success) { toast(env.error || 'فشل الحفظ', 'error'); return; }
      toast(id ? 'تم تحديث السجل' : 'تم إنشاء السجل', 'success');
      self.closeDrawer();
      self.refresh();
    });
  };

  /* ---------------------------------------------------------- detail + chatter */

  CrudInstance.prototype.openDetail = function (id, scrollToChatter) {
    var self = this;
    api('/' + this.entity + '/read/' + encodeURIComponent(id)).then(function (env) {
      if (!env.success) { toast(env.error || 'تعذر تحميل السجل', 'error'); return; }
      var rec = normalizeRecord(env.data);
      var cols = self.cfg.columns || [];
      var formFields = self.cfg.form || [];
      // Union of column + form fields for the detail view (columns first).
      var seen = {};
      var fields = [];
      cols.concat(formFields).forEach(function (f) {
        if (seen[f.key]) return;
        seen[f.key] = true;
        fields.push(f);
      });

      var rowsHtml = fields.map(function (f) {
        var valHtml;
        if (f.badge) valHtml = self.badgeHtml(f, rec[f.key]);
        else if (f.type === 'relation') valHtml = esc(rec[f.key + '_label'] || rec[f.key] || '—');
        else if (f.type === 'number') valHtml = fmtNum(rec[f.key] == null ? 0 : rec[f.key]);
        else valHtml = esc(rec[f.key] == null || rec[f.key] === '' ? '—' : rec[f.key]);
        return '<div class="oxc-detail-row"><span class="oxc-detail-k">' + esc(f.label_ar) + '</span><span class="oxc-detail-v">' + valHtml + '</span></div>';
      }).join('');

      var chatterId = 'chatter-' + self.entity + '-' + rec.id;
      var body =
        '<div class="oxc-detail">' + rowsHtml + '</div>' +
        '<div class="oxc-chatter-wrap"><h4 class="oxc-chatter-title">💬 المحادثة والسجل</h4>' +
          '<div id="' + esc(chatterId) + '" class="oxc-chatter-host"></div>' +
        '</div>';

      self.openDrawerShell(
        '👁️ ' + esc(self.cfg.label_singular_ar || self.cfg.label_ar || self.entity) + ' <span class="oxc-muted">#' + esc(rec.id) + '</span>',
        body,
        '<button type="button" class="btn-primary oxc-btn" data-act="detail-edit" data-id="' + esc(rec.id) + '">✏️ تعديل</button>' +
        '<button type="button" class="oxc-btn oxc-btn-ghost" data-act="drawer-close">إغلاق</button>'
      );

      var chatterEl = self.root.querySelector('#' + CSS.escape(chatterId));
      if (window.OX.chatter && typeof window.OX.chatter.mount === 'function') {
        try { window.OX.chatter.mount(chatterEl, self.entity, rec.id); } catch (e) { toast('تعذر تحميل المحادثة', 'error'); }
      } else if (chatterEl) {
        chatterEl.innerHTML = '<div class="oxc-muted oxc-chatter-placeholder">وحدة المحادثة غير محمّلة بعد (OX.chatter)</div>';
      }
      if (scrollToChatter && chatterEl) chatterEl.scrollIntoView({ block: 'nearest' });
    });
  };

  /* -------------------------------------------------------- delete / print / xlsx */

  CrudInstance.prototype.doDelete = function (id) {
    var self = this;
    if (!window.confirm('حذف السجل نهائياً من القائمة؟ (حذف ناعم قابل للاسترجاع من قاعدة البيانات)')) return;
    api('/' + this.entity + '/delete/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (env) {
      if (!env.success) { toast(env.error || 'فشل الحذف', 'error'); return; }
      toast('تم حذف السجل', 'success');
      self.refresh();
    });
  };

  CrudInstance.prototype.doPrint = function (id) {
    if (window.OX.print && typeof window.OX.print.record === 'function') {
      window.OX.print.record(this.entity, id);
      return;
    }
    toast('وحدة الطباعة (OX.print) غير محمّلة بعد — ستتوفر مع حزمة قوالب الطباعة', 'info');
  };

  CrudInstance.prototype.doExport = function () {
    if (window.OX.excel && typeof window.OX.excel.exportList === 'function') {
      window.OX.excel.exportList(this.entity, {
        q: this.state.q, filter: this.state.filters, sort: this.state.sort, columns: this.cfg.columns
      });
      return;
    }
    toast('وحدة التصدير (OX.excel) غير محمّلة بعد — ستتوفر مع حزمة الاستيراد/التصدير', 'info');
  };

  CrudInstance.prototype.doImport = function () {
    if (window.OX.excel && typeof window.OX.excel.importInto === 'function') {
      window.OX.excel.importInto(this.entity, { form: this.cfg.form, onDone: this.refresh.bind(this) });
      return;
    }
    toast('وحدة الاستيراد (OX.excel) غير محمّلة بعد — ستتوفر مع حزمة الاستيراد/التصدير', 'info');
  };

  /* ------------------------------------------------------------- saved views */

  CrudInstance.prototype.loadViews = function () {
    var sel = this.root.querySelector('[data-role="views"]');
    if (!sel) return;
    if (!(window.OX.views && typeof window.OX.views.list === 'function')) {
      sel.disabled = true;
      sel.title = 'طرق العرض المحفوظة — تتوفر مع حزمة P0.7';
      return;
    }
    var self = this;
    Promise.resolve(window.OX.views.list(this.entity)).then(function (views) {
      self._views = Array.isArray(views) ? views : [];
      sel.innerHTML = '<option value="">طرق العرض</option>' + self._views.map(function (v) {
        return '<option value="' + esc(v.id) + '">' + esc(v.name) + '</option>';
      }).join('');
      sel.disabled = false;
    }).catch(function () { sel.disabled = true; });
  };

  CrudInstance.prototype.applyView = function (viewId) {
    if (!viewId || !this._views) return;
    var v = this._views.filter(function (x) { return String(x.id) === String(viewId); })[0];
    if (!v || !v.config) return;
    var c = v.config;
    this.state.q = c.q || '';
    this.state.filters = Object.assign({}, c.filters || {});
    this.state.sort = c.sort || null;
    this.state.page = 1;
    var search = this.root.querySelector('[data-role="search"]');
    if (search) search.value = this.state.q;
    var self = this;
    Array.prototype.forEach.call(this.root.querySelectorAll('.oxc-filter'), function (f) {
      var key = f.getAttribute('data-filter-key');
      f.value = self.state.filters[key] != null ? self.state.filters[key] : '';
    });
    this.loadList();
  };

  /* ----------------------------------------------------------------- exports */

  window.OX.crud = {
    mount: function (el, config) {
      var inst = new CrudInstance(el, config);
      inst.init();
      return inst;
    },
    /** Convenience: mount by registry key (entity-ui-registry.js). */
    mountEntity: function (el, entityKey) {
      var reg = window.OX.entityUI || {};
      var cfg = reg[entityKey];
      if (!cfg) { toast('لا يوجد إعداد واجهة للكيان: ' + entityKey, 'error'); return null; }
      return this.mount(el, cfg);
    },
    _internals: { esc: esc, normalizeRecord: normalizeRecord, normalizeSummary: normalizeSummary }
  };
})();
