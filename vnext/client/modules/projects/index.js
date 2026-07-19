// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'projects',
  label: { ar: 'المشاريع والفوترة', en: 'Projects' },
  resources: [
    { key: 'projects', resource: 'projects', label: { ar: 'المشاريع', en: 'Projects' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      form: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' }, required: true }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer id' }, required: true }] },
    { key: 'tasks', resource: 'tasks', label: { ar: 'المهام', en: 'Tasks' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['open', 'in_progress', 'done'] }],
      columns: [{ key: 'title', label: { ar: 'العنوان', en: 'Title' } }, { key: 'project_id', label: { ar: 'المشروع', en: 'Project' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['open', 'in_progress', 'done'] },
    { key: 'milestones', resource: 'milestones', label: { ar: 'المعالم', en: 'Milestones' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'project_id', label: { ar: 'المشروع', en: 'Project' } }, { key: 'amount', label: { ar: 'المبلغ', en: 'Amount' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'project-timesheets', resource: 'project-timesheets', label: { ar: 'سجل ساعات المشاريع', en: 'Project time' }, search: true,
      columns: [{ key: 'project_id', label: { ar: 'المشروع', en: 'Project' } }, { key: 'user_id', label: { ar: 'المستخدم', en: 'User' } }, { key: 'work_date', label: { ar: 'التاريخ', en: 'Date' } }, { key: 'hours', label: { ar: 'الساعات', en: 'Hours' } }, { key: 'billable', label: { ar: 'قابل للفوترة', en: 'Billable' } }] },
    { key: 'field-service-orders', resource: 'field-service-orders', label: { ar: 'الخدمة الميدانية', en: 'Field service' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
  ],
});
