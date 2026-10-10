# PMS 11 Navigator

lets make a simillar app for PMS 11 instead of editing as i thining editing the existed app will take more time and a lot of efforts

Build "PMS 11 Closure Loop" for one vessel: PMS 11. It's a pipe laying vessel, IMO 7511826, MMSI 622121517, Egypt flag, Germanischer Lloyd class, built 1976. Vessel particulars: port of registry Alexandria; DWT 4752 mt; GRT 7205 mt; LOA 101 m; breadth 34 m; shipyard Nederlandse Scheepsbouw - Amsterdam, Netherlands; owner and manager Petroleum Marine Services - Cairo, Egypt; previous names PETROJET 11 (2005), PETROJET 12 (2004), CLEVER TURTLE (1982). The app tracks readiness and closure.

Use the attached PMS11_POWERPIVOT_READY workbook and supporting files as source material. The workbook is a model-ready spreadsheet, not a workbook containing an already-built Power Pivot model. Its verification file states 22 worksheet tables, 1 derived Objects query, 22 planned relationships, no relationship schema errors, embedded model false, VBA not tested in Windows Excel, and model setup status NOT RUN. Import the spreadsheet data where possible and make the distinction between current/imported source data and derived or sample data clear. Do not treat an unrun Power Pivot model or unverified VBA as successful.

Sections:
- Command Center: overall readiness, open gaps, gate status, overdue items, evidence gaps and expiry, and final readiness indicators.
- Rules Register: the 89 rules from the attached spreadsheet, linked to WPS, activities, tasks, evidence, acceptance criteria, gates, compliance and closure status.
- Work Packages (WPS): the 24 WPS, plus WPS-25 Platform Interface, WPS-26 Shore Approach and WPS-27 Pre-Commissioning and Hydrotest. Each WPS has objectives, scope, activities, deliverables, gate, closure percentage and acceptance status, owner, reviewer and approver. Each has activities and tasks.
- Gaps and Corrective Actions: each gap has root cause, owner, due date, action, evidence and review. Prevent closure unless required acceptance criteria and valid evidence are satisfied. Reopen on rejected review or expired evidence.
- Evidence and Documents: file uploads for documents, certificates, photos and reports linked to a task, rule, WPS, activity, or gap; track document number, revision, issuer, source, expiry, review history, and status (required, submitted, in review, accepted, rejected, expired).
- Gates GATE-0 to GATE-8, each with requirements, critical gaps, No-Go conditions, acceptance criteria and a Go/No-Go approval decision history. Names: GATE-0 Evidence Baseline; GATE-1 Class / Reclassification / Flag / Structural Basis; GATE-2 Critical Lifting Basis; GATE-3 Mooring / Pipe-Lay / Site Engineering; GATE-4 External / Jordan / MWS Requirements; GATE-5 Departure / Wet Tow Readiness; GATE-6 Aqaba Arrival / Port Readiness; GATE-7 Offshore Systems / Diving / Competence; GATE-8 Operational Assurance / Final Decision.
- Responsibilities, Risks and Changes registers.
- Audit trail and reports, including executive readiness, open gaps, required/expired evidence, WPS and gate status, overdue CAPA, and Rule → WPS → Activity → Task → Evidence → Acceptance → Gate traceability; export to Excel and PDF.

PMS-11 scope reconciliation to reflect in the app:
- WPS-08 Mooring: explicitly cover both 8 x 7-ton Flipper Delta anchors and 8 x 55-ton gravity anchors, their rigging, load certification and deployment procedures via anchor-handling tugs.
- WPS-12 Diving: PMS-11's permanent onboard spread is Air Diving only. Scope to Air Diving (IMCA D014 / D023); mark saturation diving Rule R-046 as Not Applicable or Project-Conditional unless a modular saturation spread is mobilized, so it does not create an uncloseable gap.
- WPS-13 Machinery/PMS: include onboard machine-shop equipment certification and machine-tool safety/guarding, hot-work and welding isolations, and maintenance calibration, including lathe, shaping machine, gear trolley machine, DC power supply, bench vice and 5-ton air tugger.
- WPS-01 / WPS-02 Class & Identity: include historical survey records under previous names for hull thickness and modification tracking.
- Existing equipment information to preserve in the relevant WPS / asset register: HMC 5500 main crane, 280 MT @ 30 m, 55 m boom; Link-Belt LS 718 crawler crane, 250 MT SWL, 160 ft (48.77 m) boom, 32 mm / 570 m wire; CRC hydraulic pipe-lay spread up to 30 in OD; Holland CHT 50L 26 tensioner, 50 MT; four welding stations, one coating station, one X-ray station, X-ray crawler; four port-side air tugger winches, 25 MT each; Eiva NaviPac 3.10.5, two Meridian gyrocompasses, two DGPS, BMS/TMS; IMCA-compliant Air Diving Spread.
- Verify whether there is an approved permanent helideck or winching area. If not applicable and personnel transfer is by crew boat/tug, flag WPS-19 Helideck & Aviation Interface for scope confirmation/de-scope rather than assuming.
- For the 18-km pipeline installation and platform project, cover shore approach and landfall operations (15 km offshore + 3 km onshore; beach pull-in winch, pulling head, cofferdam/trenching interface, near-shore shallow-water anchor pattern); platform/topsides interface and riser installation (riser clamps, spool-piece fabrication, subsea tie-in metrology, topside deck modifications, heavy lift of replacement equipment); and pipeline pre-commissioning/commissioning (flooding, cleaning, gauging/caliper pigging, hydrotesting, dewatering, nitrogen drying and handover).

Closure rule: an item closes only when it has an owner, recorded execution, valid evidence, a completed review, met acceptance criteria, and its gate has no No-Go.

Add sign-in with user roles (Admin, Reviewer, Contributor, Viewer), and import data from the spreadsheet. Use a deep navy and muted gold maritime look.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pms11-closure-loop.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/59d923fd-72e9-4aef-ae89-1a44a534dbcc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## PMS-11 source-driven workbook workflow

The authoritative operational source is `PMS11_MASTER_DATA_Rev.2.xlsx` (56 worksheets). `MASTER_DATA` and `LISTS` remain governed vocabulary sources. The import contract explicitly classifies operational sheets, typed relationship registers, governance/reference sheets, diagnostics, and presentation sheets. `Relationships` is the broad relationship source; `RELATIONSHIP_REGISTER_Rev1` is a derived validation mirror and must not be ingested again. `DEPARTMENT_ASSIGNMENTS`, `Gap_WPS`, `RULE_WPS_MAP`, and `Dependencies` are parsed as typed relationship/assignment sources. The workbook is not an already-built Power Pivot model; live Excel/VBA setup must be separately verified. 

Before local verification, place the workbook at any accessible path and generate the application seed:

```sh
npm run pms11:seed -- "D:\conversation-files\deliverables\PMS11_MASTER_DATA_Rev.2.xlsx"
npm run pms11:verify-source -- "D:\conversation-files\deliverables\PMS11_MASTER_DATA_Rev.2.xlsx"
npm test
npm run build
```

The generator preserves source rows in `data`, maps supported core and Crew/Accommodation/Helideck workstream fields, and does not fabricate missing IDs, dates, owners, approvals, or relationships. Directional dependencies and normalized relationship links are parsed separately by the live import path; predecessor/successor arrays are not collapsed into undirected sequence links. The generated `src/lib/seed/pms11-workbook.json` is a seed snapshot, not a substitute for the live import relationship pipeline. Preview is read-only. The approved import executes through one PostgreSQL RPC transaction, so any database error rolls back governance, records, relationships, department assignments, and the audit row together.

Power Pivot remains a separate Excel concern: `POWERPIVOT_SETUP.txt`, `PowerPivotSetup.bas`, `POWERPIVOT_RELATIONSHIP_PLAN.csv`, and `POWERPIVOT_STATUS` define and verify the live Excel Data Model. The repository must not claim that Power Pivot or VBA has executed unless the local Windows Excel verification actually passes.
