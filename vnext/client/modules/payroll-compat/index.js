// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.2 (proprietary self, not copied)
'use strict';
// R10.2 frozen payroll compatibility surface — read-only by construction.
// Renders the closed legacy payroll periods, their captured closing figures, and
// the golden-month replay verdict. There are no create/edit/state controls and
// no write call anywhere in this module: payroll, attendance, and timesheet
// mutation belongs exclusively to the legacy application, and the timesheet
// itself is reached through the existing read-only legacy workshop bridge rather
// than being duplicated here.
window.OctagonR3.register({
  key: 'payroll-compat',
  label: { ar: 'الرواتب المجمّدة (قراءة فقط)', en: 'Frozen payroll (read-only)' },
  resources: [],
  customRender(host, ctx) {
    const { api, esc } = ctx;
    const lang = ctx.lang;
    const T = (ar, en) => (lang === 'ar' ? ar : en);
    let summary = null;
    let openPeriodId = null;

    const money = (value) => {
      const number = Number(value) || 0;
      return number.toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-US');
    };

    function fidelityChip(fidelity) {
      const label = fidelity === 'closing_detail'
        ? T('تفصيل لكل موظف', 'per-employee detail')
        : T('إجماليات الفترة', 'period totals');
      return `<span class="chip chip-${esc(fidelity)}">${esc(label)}</span>`;
    }

    function shell() {
      host.innerHTML = `<div class="legacy-head">
          <span class="badge-readonly">${T('للقراءة فقط — الرواتب مجمّدة', 'READ-ONLY — payroll is frozen')}</span>
          <span id="payMeta" class="legacy-meta"></span>
        </div>
        <p class="hint">${T(
          'التعديل على الرواتب والحضور والتايم شيت يبقى في النظام القديم حصراً. هذه الشاشة تعرض الأشهر المقفلة وتحقق تطابقها فقط.',
          'Payroll, attendance, and timesheet editing stays in the legacy application. This screen only displays closed months and verifies that they still match.'
        )}</p>
        <div class="toolbar">
          <button id="payReload">${T('تحديث', 'Refresh')}</button>
          <button id="payReplay">${T('تشغيل تحقق التطابق', 'Run match verification')}</button>
          <a id="payTimesheet" class="btn-link" href="#legacy-workshop">${T('فتح التايم شيت (قراءة فقط)', 'Open timesheet (read-only)')}</a>
          <span id="payCount" class="count"></span>
        </div>
        <div id="payBody" class="list"><p class="loading">${T('جاري التحميل…', 'Loading…')}</p></div>
        <div id="payDrawer" class="drawer" hidden></div>`;
      host.querySelector('#payReload').addEventListener('click', loadSummary);
      host.querySelector('#payReplay').addEventListener('click', runReplay);
    }

    async function loadSummary() {
      const body = host.querySelector('#payBody');
      body.innerHTML = `<p class="loading">${T('جاري التحميل…', 'Loading…')}</p>`;
      try {
        summary = await api('/api/x/payroll-compat');
        host.querySelector('#payMeta').textContent = `${summary.source} · ${String(summary.goldenFingerprint).slice(0, 12)}`;
        host.querySelector('#payCount').textContent = `${summary.periods.length} ${T('فترة', 'periods')}`;
        if (!summary.periods.length) { body.innerHTML = `<p class="empty">${T('لا توجد فترات مقفلة', 'No closed periods')}</p>`; return; }
        body.innerHTML = `<table><thead><tr>
            <th>${T('الشهر', 'Month')}</th>
            <th>${T('مستوى الإثبات', 'Proof level')}</th>
            <th>${T('عدد الإقفالات', 'Closings')}</th>
            <th>${T('الاستحقاق', 'Accrual')}</th>
            <th>${T('تسوية السلف', 'Advance settlement')}</th>
            <th>${T('المدفوع', 'Paid')}</th>
            <th></th>
          </tr></thead><tbody>
          ${summary.periods.map((period) => `<tr>
            <td>${esc(period.label)}</td>
            <td>${fidelityChip(period.fidelity)}</td>
            <td>${esc(period.closing_count)}</td>
            <td>${esc(money(period.accrual_total))}</td>
            <td>${esc(money(period.settlement_total))}</td>
            <td>${esc(money(period.payment_total))}</td>
            <td><button data-period="${esc(period.period_id)}">${T('تفاصيل', 'Details')}</button></td>
          </tr>`).join('')}
          </tbody></table>`;
        body.querySelectorAll('button[data-period]').forEach((button) => {
          button.addEventListener('click', () => openPeriod(button.dataset.period));
        });
      } catch (error) {
        body.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    }

    async function openPeriod(periodId) {
      const drawer = host.querySelector('#payDrawer');
      openPeriodId = periodId;
      drawer.hidden = false;
      drawer.innerHTML = `<p class="loading">${T('جاري التحميل…', 'Loading…')}</p>`;
      try {
        const detail = await api(`/api/x/payroll-compat/periods/${encodeURIComponent(periodId)}`);
        if (openPeriodId !== periodId) return;
        const closeButton = `<button id="payClose">${T('إغلاق', 'Close')}</button>`;
        if (!detail.closings.length) {
          drawer.innerHTML = `${closeButton}
            <h3>${esc(detail.period.year)}-${esc(String(detail.period.month).padStart(2, '0'))}</h3>
            <p class="hint">${T(
              'سجلات الإقفال لكل موظف لهذا الشهر استُبدلت في النظام القديم. الإثبات المتاح هو إجماليات القيود المرحّلة والدفعات وسجل السلف.',
              'The per-employee closing records for this month were superseded in the legacy app. The available proof is the posted journal totals, the payments, and the advance ledger.'
            )}</p>
            <table><tbody>
              <tr><th>${T('إجمالي الاستحقاق', 'Accrual total')}</th><td>${esc(money(detail.period.accrual_total))}</td></tr>
              <tr><th>${T('إجمالي تسوية السلف', 'Settlement total')}</th><td>${esc(money(detail.period.settlement_total))}</td></tr>
              <tr><th>${T('إجمالي السلف', 'Advance total')}</th><td>${esc(money(detail.period.advance_total))} (${esc(detail.period.advance_count)})</td></tr>
            </tbody></table>`;
        } else {
          drawer.innerHTML = `${closeButton}
            <h3>${esc(detail.period.year)}-${esc(String(detail.period.month).padStart(2, '0'))}</h3>
            <table><thead><tr>
                <th>${T('الموظف', 'Employee')}</th>
                <th>${T('أيام الحضور', 'Days')}</th>
                <th>${T('أيام الجمعة', 'Fridays')}</th>
                <th>${T('ساعات إضافية', 'Overtime')}</th>
                <th>${T('الإجمالي', 'Gross')}</th>
                <th>${T('السلف', 'Advances')}</th>
                <th>${T('المكافآت', 'Bonuses')}</th>
                <th>${T('الصافي', 'Net')}</th>
                <th>${T('حالات خاصة', 'Edge cases')}</th>
              </tr></thead><tbody>
              ${detail.closings.map((row) => `<tr>
                <td>${esc(row.employee_id)}</td>
                <td>${esc(row.closing.attendanceDays)}</td>
                <td>${esc(row.closing.fridayWorkDays)}</td>
                <td>${esc(row.closing.overtimeHours)}</td>
                <td>${esc(money(row.closing.grossSalary))}</td>
                <td>${esc(money(row.closing.currentPeriodAdvances))}</td>
                <td>${esc(money(row.closing.bonuses))}</td>
                <td>${esc(money(row.closing.netPayableAfterAdvanceSettlement))}</td>
                <td>${row.edge_case_tags.map((tag) => `<span class="chip">${esc(tag)}</span>`).join(' ')}</td>
              </tr>`).join('')}
            </tbody></table>`;
        }
        drawer.querySelector('#payClose').addEventListener('click', () => { drawer.hidden = true; openPeriodId = null; });
      } catch (error) {
        drawer.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    }

    async function runReplay() {
      const body = host.querySelector('#payBody');
      const previous = body.innerHTML;
      body.innerHTML = `<p class="loading">${T('جاري التحقق…', 'Verifying…')}</p>`;
      try {
        const replay = await api('/api/x/payroll-compat/replay');
        const verdict = replay.zeroDelta
          ? `<p class="ok">${T('لا يوجد أي فرق في جميع الفترات', 'Zero delta across every period')}</p>`
          : `<p class="error">${T('تم رصد فروقات — راجع التفاصيل', 'Deltas detected — review the details')}</p>`;
        body.innerHTML = `${verdict}
          <table><thead><tr>
            <th>${T('الشهر', 'Month')}</th><th>${T('مستوى الإثبات', 'Proof level')}</th>
            <th>${T('مطابق', 'Matched')}</th><th>${T('مختلف', 'Mismatched')}</th>
          </tr></thead><tbody>
          ${replay.periods.map((period) => `<tr>
            <td>${esc(period.label)}</td><td>${fidelityChip(period.fidelity)}</td>
            <td>${esc(period.matched)}</td><td>${esc(period.mismatched)}</td>
          </tr>`).join('')}
          </tbody></table>
          <p class="hint">${T('الحالات الخاصة المغطّاة:', 'Edge cases covered:')} ${replay.edgeCasesCovered.map((tag) => `<span class="chip">${esc(tag)}</span>`).join(' ')}</p>
          <button id="payBack">${T('رجوع', 'Back')}</button>`;
        body.querySelector('#payBack').addEventListener('click', () => { body.innerHTML = previous; loadSummary(); });
      } catch (error) {
        body.innerHTML = `<p class="error">${esc(error.message)}</p><button id="payBack">${T('رجوع', 'Back')}</button>`;
        body.querySelector('#payBack').addEventListener('click', loadSummary);
      }
    }

    shell();
    loadSummary();
  },
});
