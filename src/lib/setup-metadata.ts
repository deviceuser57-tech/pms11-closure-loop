/**
 * PMS-11 governed master-data values derived from
 * PMS11_ENTERPRISE_MASTER_DROPDOWNS.xlsx (2026-10-04).
 *
 * These are source-derived dictionaries. They are NOT regulatory approval.
 * The workbook itself marks these lists as pending steward approval.
 */
export const GOVERNED_VALUES = {
  status: {
    rule: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    wps: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Planned","Rejected","Submitted","Verified"],
    activity: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    deliverable: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    task: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    gap: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Opened","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    acceptance: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    evidence: ["Approved","Closed","Completed","In Progress","Missing","Missing / To Verify","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    gate: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    responsibility: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
    risk: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Recorded","Rejected","Submitted","Verified"],
    change: ["Approved","Closed","Completed","In Progress","Not Applicable","Not Started","On Hold","Open","Rejected","Submitted","Verified"],
  },
  criticality: ["Critical","Major","High","Medium","Low"],
  applicability: {
    rule: ["Conditional","Confirmed in principle","Confirmed methodology"],
    wps: ["Conditional / Information Gap"],
    activity: ["Conditional","Confirmed","Confirmed in principle","Confirmed methodology"],
  },
  dependencyType: ["Finish-to-Start","Finish-to-Finish","Start-to-Finish","Start-to-Start"],
  source: "PMS11_ENTERPRISE_MASTER_DROPDOWNS.xlsx",
  governance: "Source-derived dictionary; pending steward approval",
} as const;

export function governedStatusOptions(entity: string): readonly string[] {
  return GOVERNED_VALUES.status[entity as keyof typeof GOVERNED_VALUES.status] ?? GOVERNED_VALUES.status.task;
}

export function governedCriticalityOptions(): readonly string[] {
  return GOVERNED_VALUES.criticality;
}

export function governedApplicabilityOptions(entity: string): readonly string[] {
  return GOVERNED_VALUES.applicability[entity as keyof typeof GOVERNED_VALUES.applicability] ?? [];
}
