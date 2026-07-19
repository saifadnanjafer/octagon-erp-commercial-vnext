// clean-room; behavior modeled on octagon-erp/app.js legacy payroll calculator contract (proprietary self, not copied)
import { LegacySnapshotStore } from './LegacySnapshotStore.mjs';

export class LegacyPayrollAdapter {
  constructor({ snapshotPath, approvedLegacySummaryProvider } = {}) {
    this.store = new LegacySnapshotStore(snapshotPath);
    // The provider is an approved legacy-calculator call site. The fixture default is a frozen
    // output captured from closed legacy payrolls; this adapter never recomputes payroll itself.
    this.approvedLegacySummaryProvider = approvedLegacySummaryProvider || ((employeeId, payrollPeriodId) => (
      this.store.goldenSummary(employeeId, payrollPeriodId)
    ));
  }

  getClosedMonthSummary(employeeId, payrollPeriodId) {
    return this.approvedLegacySummaryProvider(employeeId, payrollPeriodId);
  }

  listClosedMonthSummaryKeys() { return this.store.listGoldenSummaryKeys(); }

  close() { this.store.close(); }
}
