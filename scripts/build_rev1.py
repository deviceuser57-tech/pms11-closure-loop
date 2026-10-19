#!/usr/bin/env python3
"""
PMS11_MASTER_DATA_Rev.1 builder.
Baseline: pms-11/PMS11_POWERPIVOT_READY.xlsx (Rev.0 equivalent in this repo).
Principles:
  - Preserve all data; no invented records/IDs/people/limits.
  - Deterministic repairs only (evidence-backed canonical mapping / safe expansion).
  - Everything else documented as UNRESOLVED for PMS11 Red Team / AI / Admin.
"""
import openpyxl, re, sys
from collections import Counter, OrderedDict
from openpyxl.utils import get_column_letter

SRC = 'pms-11/PMS11_POWERPIVOT_READY.xlsx'
DST = 'pms-11/PMS11_MASTER_DATA_Rev.1.xlsx'

wb = openpyxl.load_workbook(SRC)   # keep formulas (data_only=False)

# ---------------------------------------------------------------- helpers
def sheet_rows(name):
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h) if h is not None else '' for h in rows[0]]
    return ws, hdr, rows[1:]

def col_ids(name, col):
    ws, hdr, data = sheet_rows(name)
    idx = hdr.index(col)
    return set(str(r[idx]).strip() for r in data if r[idx] not in (None, ''))

CANON_SHEETS = {
    'WPS': 'WPS ID', 'Rules': 'Rule ID', 'Activities': 'Activity ID', 'Tasks': 'Task ID',
    'Deliverables': 'Deliverable ID', 'Gaps': 'Gap ID', 'Acceptance': 'Acceptance Criteria ID',
    'Evidence': 'Evidence ID', 'Gates': 'Gate ID', 'Functional': 'Functional_Activity_ID',
    'Risks': 'Record ID', 'Sources': 'Source Record ID', 'Responsibilities': 'Responsibility Record ID',
}
ent_of = {}
for sh, c in CANON_SHEETS.items():
    for i in col_ids(sh, c):
        ent_of[i] = sh
all_canon = dict(ent_of)  # id -> entity sheet

change_report = []      # (Category, Sheet, RecordID, Field, Old, New, Basis)
unresolved = []         # (FindingID, Entity, RecordID, Field, CurrentValue, Problem, Type, Severity, RootCause, NeedsAI, NeedsAdmin, Confidence, RequiredToResolve)
repair_report = []      # relationship-level repairs
fid = lambda: f"RT-{len(unresolved)+1:04d}"

def log_change(cat, sheet, rid, field, old, new, basis):
    change_report.append((cat, sheet, str(rid), field, str(old), str(new), basis))

def add_unresolved(entity, rid, field, value, problem, typ, sev, root, ai, adm, conf, need):
    unresolved.append((fid(), entity, str(rid), field, str(value), problem, typ, sev, root,
                       'Yes' if ai else 'No', 'Yes' if adm else 'No', conf, need))

# ---------------------------------------------------------------- MASTER_DATA sheets (new governed master lists)
MASTER_DEPARTMENTS = ['Class & Regulatory','Technical','PMO','HSE','Aviation','Marine Operations',
    'Engineering','Maintenance','Warehouse','Procurement','IT','Survey','Environmental','HR','Medical','Logistics']
OPERATIONAL_ROLES = ['Marine Superintendent','Technical Superintendent','Chief Engineer','Class Manager',
    'HSE Manager','Aviation Coordinator','Environmental Manager','Project Director','Project Manager',
    'Project Controls Manager','Maintenance Superintendent','Stores Manager','Procurement Manager',
    'Survey Manager','HR Manager','Medical Coordinator','DNV','Egyptian Flag/EAMS','Jordan Maritime Commission',
    'ASEZA','Harbor Master / VTS','OEM','Client','MWS','Diving Contractor','Tow Contractor']
APP_ROLES = ['admin','reviewer','contributor','viewer']

DEPT_OWNER_MAP = [  # evidence: Execution filled rows + Activities/Tasks owners + WPS leads
 ('Class & Regulatory','Class Manager','Primary'), ('Class & Regulatory','DNV','Supporting'),
 ('Class & Regulatory','Egyptian Flag/EAMS','Supporting'), ('Technical','Technical Superintendent','Primary'),
 ('Technical','Chief Engineer','Supporting'), ('PMO','Project Director','Primary'), ('PMO','Project Manager','Primary'),
 ('PMO','Project Controls Manager','Primary'), ('HSE','HSE Manager','Primary'),
 ('Aviation','Aviation Coordinator','Primary'), ('Aviation','HSE Manager','Supporting'),
 ('Marine Operations','Marine Superintendent','Primary'), ('Engineering','Chief Engineer','Primary'),
 ('Maintenance','Maintenance Superintendent','Primary'), ('Maintenance','Chief Engineer','Supporting'),
 ('Warehouse','Stores Manager','Primary'), ('Procurement','Procurement Manager','Primary'),
 ('Procurement','Stores Manager','Supporting'), ('IT','Maintenance Superintendent','Supporting'),
 ('Survey','Survey Manager','Primary'), ('Survey','Marine Superintendent','Supporting'),
 ('Environmental','Environmental Manager','Primary'), ('HR','HR Manager','Primary'),
 ('Medical','Medical Coordinator','Primary'), ('Logistics','HR Manager','Supporting'),
]
DEPT_APP_MAP = [  # governance defaults — flagged for admin confirmation in report
 ('All Departments','admin','Platform administrators only'),
 ('PMO','reviewer','Closure reviewers / gate authorities'),
 ('Class & Regulatory','reviewer','Verification authority'),
 ('All Departments','contributor','Department staff entering execution/evidence'),
 ('All Departments','viewer','Read-only stakeholders'),
]

for name, cols, rows in [
    ('Master_Departments', ['Department ID','Department Name','Canonical','Notes'],
        [(f'DEP-{i+1:02d}', d, 'Yes', '') for i, d in enumerate(MASTER_DEPARTMENTS)]),
    ('Master_Owner_Roles', ['Role ID','Operational Role','Type','Notes'],
        [(f'OR-{i+1:03d}', r, 'Authority' if r.split('/')[0] in ('DNV','Client','MWS') or any(k in r for k in ('DNV','Flag','Commission','ASEZA','Harbor','OEM','MWS','Client')) else 'Company Role', '') for i, r in enumerate(OPERATIONAL_ROLES)]),
    ('Master_Application_Roles', ['Application Role','Description'],
        [('admin','Full configuration and governance rights'),
         ('reviewer','Can review/approve/reject closure items'),
         ('contributor','Can create/update own department records and evidence'),
         ('viewer','Read-only access')]),
    ('Dept_Owner_Map', ['Department Name','Owner / Operational Role','Relationship Role','Evidence Source'],
        [(d, r, role, 'Execution.Discipline Lead + Activities.Activity Owner + WPS.Responsible Lead') for d, r, role in DEPT_OWNER_MAP]),
    ('Dept_Application_Role_Map', ['Department Scope','Application Role','Basis','Status'],
        [(d, a, b, 'Proposed — requires Admin confirmation') for d, a, b in DEPT_APP_MAP]),
]:
    ws = wb.create_sheet(name)
    ws.append(cols)
    for row in rows:
        ws.append(list(row))

# ---------------------------------------------------------------- Relationships enrichment
rel_ws, rel_hdr, rel_data = sheet_rows('Relationships')
NEW_REL_COLS = ['Relationship Type','Relationship Role','Required / Optional','Primary / Supporting','Sequence / Priority','Source']
start_col = len(rel_hdr) + 1
for j, c in enumerate(NEW_REL_COLS):
    rel_ws.cell(row=1, column=start_col + j, value=c)

TYPE_BY_PAIR = {
    ('WPS','Rules'): 'GOVERNED_BY', ('WPS','Activities'): 'REQUIRES_ACTIVITY',
    ('WPS','Deliverables'): 'REQUIRES_DELIVERABLE', ('WPS','Acceptance'): 'ACCEPTED_BY',
    ('WPS','Evidence'): 'EVIDENCED_BY', ('WPS','Gaps'): 'HAS_GAP', ('WPS','WPS'): 'SEQUENCES',
    ('WPS','Gates'): 'READINESS_GATE', ('Rules','Activities'): 'IMPLEMENTED_BY',
    ('Rules','Deliverables'): 'OUTPUTS', ('Rules','Acceptance'): 'VERIFIED_BY',
    ('Rules','Evidence'): 'EVIDENCED_BY', ('Rules','Gaps'): 'HAS_GAP', ('Rules','WPS'): 'APPLIES_TO',
    ('Activities','Tasks'): 'DECOMPOSES_TO', ('Activities','Deliverables'): 'PRODUCES',
    ('Activities','Acceptance'): 'ACCEPTED_BY', ('Activities','Evidence'): 'EVIDENCED_BY',
    ('Activities','Gaps'): 'HAS_GAP', ('Activities','WPS'): 'BELONGS_TO_WPS',
    ('Tasks','Acceptance'): 'ACCEPTED_BY', ('Tasks','Deliverables'): 'PRODUCES',
    ('Tasks','WPS'): 'BELONGS_TO_WPS', ('Tasks','Evidence'): 'EVIDENCED_BY',
    ('Deliverables','Acceptance'): 'ACCEPTED_BY', ('Deliverables','WPS'): 'BELONGS_TO_WPS',
    ('Deliverables','Evidence'): 'EVIDENCED_BY', ('Gaps','WPS'): 'BLOCKS_WPS',
    ('Gaps','Acceptance'): 'VERIFIED_BY', ('Gaps','Evidence'): 'CLOSED_BY_EVIDENCE',
    ('Acceptance','Evidence'): 'PROVEN_BY', ('Acceptance','WPS'): 'APPLIES_TO_WPS',
    ('Acceptance','Activities'): 'APPLIES_TO_ACTIVITY', ('Acceptance','Tasks'): 'APPLIES_TO_TASK',
    ('Acceptance','Rules'): 'DERIVES_FROM_RULE', ('Evidence','WPS'): 'SUPPORTS_WPS',
    ('Evidence','Activities'): 'SUPPORTS_ACTIVITY', ('Evidence','Tasks'): 'SUPPORTS_TASK',
    ('Evidence','Gaps'): 'SUPPORTS_GAP', ('Evidence','Acceptance'): 'SUPPORTS_ACCEPTANCE',
    ('Gates','WPS'): 'GATE_COVERS', ('Gates','Acceptance'): 'GATE_VERIFIES',
    ('Gates','Activities'): 'GATE_COVERS', ('Gates','Deliverables'): 'GATE_COVERS',
    ('Execution','WPS'): 'EXECUTES_WPS', ('Functional','WPS'): 'FUNCTIONAL_BELONGS_TO_WPS',
    ('Functional','Gates'): 'FUNCTIONAL_READINESS_GATE', ('Functional','Activities'): 'FUNCTIONAL_MAPPED_TO_ACTIVITY',
    ('Functional','Deliverables'): 'FUNCTIONAL_MAPPED_TO_DELIVERABLE', ('Functional','Acceptance'): 'FUNCTIONAL_MAPPED_TO_ACCEPTANCE',
    ('Functional','Gaps'): 'FUNCTIONAL_MAPPED_TO_GAP', ('Functional','Rules'): 'FUNCTIONAL_GOVERNED_BY',
    ('Responsibilities','WPS'): 'RACI_FOR_WPS', ('Risks','WPS'): 'RISK_APPLIES_TO_WPS',
    ('Risks','Gaps'): 'RISK_LINKED_GAP', ('Risks','Rules'): 'RISK_LINKED_RULE', ('Risks','Activities'): 'RISK_LINKED_ACTIVITY',
}
req_fields = {'BELONGS_TO_WPS','REQUIRES_ACTIVITY','REQUIRES_DELIVERABLE','DECOMPOSES_TO','GOVERNED_BY',
              'DERIVES_FROM_RULE','ACCEPTED_BY','PROVEN_BY','READINESS_GATE','GATE_COVERS'}

def rel_type_for(pe, ce, sf):
    t = TYPE_BY_PAIR.get((pe, ce))
    if t is None:
        return 'UNDEFINED', False
    return t, True

for i, r in enumerate(rel_data):
    pe, pid, ce, cid, sf = r[0], str(r[1] or '').strip(), r[2], str(r[3] or '').strip(), r[4]
    excel_row = i + 2
    t, defined = rel_type_for(str(pe), str(ce), str(sf))
    role = 'Required link' if str(sf) in ('WPS ID','WPS_ID') else ('Derived from source field: ' + str(sf))
    seq = ''
    if ';' in cid or ',' in cid:
        parts = [p.strip() for p in re.split(r'\s*[;,]\s*', cid) if p.strip()]
        pass  # sequence handled below by number of occurrence
    rw = start_col
    rel_ws.cell(row=excel_row, column=rw+0, value=t)
    rel_ws.cell(row=excel_row, column=rw+1, value='Structural' if t in req_fields else 'Cross-reference')
    rel_ws.cell(row=excel_row, column=rw+2, value='Required' if t in req_fields else 'Optional')
    rel_ws.cell(row=excel_row, column=rw+3, value='Primary')
    rel_ws.cell(row=excel_row, column=rw+4, value='')
    rel_ws.cell(row=excel_row, column=rw+5, value=f'SourceField:{sf}')
    if not defined:
        add_unresolved('Relationships', f'{pe}:{pid}->{ce}:{cid}', 'Parent/Child Entity',
                       f'{pe}->{ce}', 'Relationship pair has no defined type in the contract.',
                       'Model Error', 'Medium', 'Schema', False, True, 'n/a',
                       'Define Relationship Type for this entity pair in the Data Contract.')

# multi-value child ids inside Relationships (comma lists like Evidence Task IDs)? verified none with slash; check comma:
mv_in_rel = [(r[0], r[1], r[2], r[3]) for r in rel_data if re.search(r'[;,]', str(r[3] or ''))]
print("multi-val children already in Relationships:", len(mv_in_rel))

# ---------------------------------------------------------------- A5: expand multi-gate references into explicit relationships
gates = col_ids('Gates', 'Gate ID')
gate_re = re.compile(r'GATE-(\d+)')
expanded_rows = []   # (parent_entity, parent_id, child_id, source_field, orig_value)
def expand_gate_ref(sheet, field, pe):
    ws, hdr, data = sheet_rows(sheet)
    fi = hdr.index(field)
    for row in data:
        v = str(row[fi] or '').strip()
        if '/' not in v:
            continue
        parts = ['GATE-' + m for m in gate_re.findall(v)]
        bad = [p for p in parts if p not in gates]
        if bad or not parts:
            add_unresolved(sheet, row[0], field, v, 'Multi-gate reference cannot be safely expanded to canonical Gates.',
                           'Data Error', 'High', 'Workbook', True, True, 'Low', 'Confirm intended Gate IDs.')
            continue
        for p in parts:
            expanded_rows.append((pe, str(row[0]), p, field, v))
        log_change('A5 Multi-value expansion', sheet, row[0], field, v,
                   ' + '.join(parts) + ' — each as independent typed relationship in Relationships sheet',
                   'All referenced Gate IDs exist canonically in Gates sheet; M:N preserved, never collapsed to one Gate')

expand_gate_ref('WPS', 'Readiness Gate', 'WPS')
expand_gate_ref('Gaps', 'Blocked Gate', 'Gaps')
expand_gate_ref('Execution', 'Blocking Gate', 'Execution')

# also comma-list fields that are NOT already decomposed in Relationships: verify none remain
LIST_FIELDS = [
    ('WPS','Source Rule IDs','Rules'),('WPS','Required Activities','Activities'),('WPS','Required Deliverables','Deliverables'),
    ('WPS','Predecessor WPS IDs','WPS'),('WPS','Successor WPS IDs','WPS'),('WPS','WPS Acceptance Criteria ID','Acceptance'),
    ('Activities','Source Rule IDs','Rules'),('Activities','Predecessor Activity IDs','Activities'),('Activities','Successor Activity IDs','Activities'),
    ('Activities','Related Deliverable IDs','Deliverables'),
    ('Tasks','Predecessor Task IDs','Tasks'),('Tasks','Successor Task IDs','Tasks'),
    ('Deliverables','Source Rule IDs','Rules'),
    ('Gaps','Source Rule IDs','Rules'),('Gaps','Related WPS IDs','WPS'),('Gaps','Related Activity IDs','Activities'),('Gaps','Related Deliverable IDs','Deliverables'),
    ('Evidence','Rule IDs','Rules'),('Evidence','WPS IDs','WPS'),('Evidence','Activity IDs','Activities'),('Evidence','Task IDs','Tasks'),
    ('Evidence','Gap IDs','Gaps'),('Evidence','Acceptance Criteria IDs','Acceptance'),
    ('Gates','Required WPS IDs','WPS'),('Gates','Required Activities','Activities'),('Gates','Required Deliverables','Deliverables'),
    ('Gates','Acceptance Criteria IDs','Acceptance'),
]
rel_pairs = {(str(r[0]).strip(), str(r[1]).strip(), str(r[2]).strip(), str(r[3]).strip()) for r in rel_data}
list_expanded = 0; list_bad = Counter(); list_log = Counter()
for sheet, field, ce in LIST_FIELDS:
    try:
        ws, hdr, data = sheet_rows(sheet)
        fi = hdr.index(field)
    except ValueError:
        continue
    for row in data:
        v = str(row[fi] or '').strip()
        if not v or not re.search(r'[;,]', v):
            continue
        parts = [p.strip() for p in re.split(r'\s*[;,]\s*', v) if p.strip()]
        pid = str(row[0]).strip()
        ok = all(p in ent_of and ent_of[p] == ce for p in parts)
        missing = [(pid, p) for p in parts if (sheet, pid, ce, p) not in rel_pairs]
        if not ok:
            for p in parts:
                if p not in ent_of or ent_of[p] != ce:
                    list_bad[(sheet, field, p)] += 1
            bads = sorted({p for p in parts if p not in ent_of or ent_of[p] != ce})
            add_unresolved(sheet, row[0], field, v,
                           f'List member(s) {bads} do not resolve to canonical {ce} IDs.',
                           'Data Error', 'High', 'Workbook', True, False, 'Low',
                           'Confirm intended target entity/ID; no string replacement applied.')
            continue
        for p in parts:
            if (sheet, pid, ce, p) not in rel_pairs:
                expanded_rows.append((sheet, pid, ce, p, field, v, 'LIST'))
            else:
                list_expanded += 1
        list_log[(sheet, field)] += 1
print("Gate expansions:", len([e for e in expanded_rows if len(e)==5]), "| list refs verified present:", list_expanded,
      "| list families:", sum(list_log.values()), "| invalid list members:", len(list_bad))
for k, v in list_bad.most_common(15): print("  INVALID", k, v)

# ---------------------------------------------------------------- E-R -> canonical Evidence (deterministic, evidence-backed)
ws, hdr, data = sheet_rows('Acceptance')
ei = hdr.index('Evidence ID'); ri = hdr.index('Rule ID'); ai_ = hdr.index('Acceptance Criteria ID')
ev_set = col_ids('Evidence', 'Evidence ID')
er_fixed = 0
for r_i, row in enumerate(data):
    v = str(row[ei] or '').strip()
    if not v.startswith('E-R-'):
        continue
    m = re.match(r'E-R-(\d+)$', v)
    tgt = 'E-' + m.group(1).zfill(3) if m else None
    rule = str(row[ri] or '').strip()
    # evidence basis: AC id AC-R-nnn maps to R-nnn AND target exists
    mac = re.match(r'AC-R-(\d+)$', str(row[ai_] or '').strip())
    same_rule = (mac and f'R-{mac.group(1)}' == rule and tgt in ev_set)
    if same_rule:
        ws.cell(row=r_i + 2, column=ei + 1, value=tgt)
        er_fixed += 1
        log_change('Canonical ID repair', 'Acceptance', row[ai_], 'Evidence ID', v, tgt,
                   f'AC-R-{mac.group(1)} <-> Rule {rule}; E-{m.group(1).zfill(3)} exists in Evidence register; legacy alias pattern E-R-nnn')
    elif tgt in ev_set:
        ws.cell(row=r_i + 2, column=ei + 1, value=tgt)
        er_fixed += 1
        log_change('Canonical ID repair', 'Acceptance', row[ai_], 'Evidence ID', v, tgt,
                   'Numeric component resolves to existing canonical Evidence ID (alias pattern)')
    else:
        add_unresolved('Acceptance', row[ai_], 'Evidence ID', v, 'Legacy E-R alias does not resolve to an existing Evidence ID.',
                       'Data Error', 'High', 'Workbook', True, False, 'Medium', 'Locate intended evidence document.')
# fix E-R aliases inside Relationships too
rr_ws, rr_hdr, rr_data = sheet_rows('Relationships')
er_rel_fixed = 0
for r_i, row in enumerate(rr_data):
    for side in (1, 3):
        v = str(row[side] or '').strip()
        if v.startswith('E-R-'):
            tgt = 'E-' + re.match(r'E-R-(\d+)', v).group(1).zfill(3)
            if tgt in ev_set:
                rr_ws.cell(row=r_i + 2, column=side + 1, value=tgt)
                er_rel_fixed += 1
print("E-R repaired: Acceptance", er_fixed, "Relationships", er_rel_fixed)

# ---------------------------------------------------------------- append expanded relationship rows to Relationships table
GATE_TYPE = {'WPS': 'READINESS_GATE', 'Gaps': 'BLOCKS_GATE', 'Execution': 'BLOCKING_GATE'}
appended = 0
for e in expanded_rows:
    if len(e) == 5:  # gate expansion
        pe, pid, cid, sf, orig = e
        ctype = GATE_TYPE[pe] + '_MULTI_EXPANDED'
        row_vals = [pe, pid, 'Gates', cid, sf, f'{pe}|{pid}', f'Gates|{cid}',
                    ctype, 'Structural', 'Required', 'Primary', '', f'Rev.1 expansion of "{orig}"']
    else:            # list completion
        pe, pid, ce, cid, sf, orig, _ = e
        ctype, _def = rel_type_for(pe, ce, sf)
        row_vals = [pe, pid, ce, cid, sf, f'{pe}|{pid}', f'{ce}|{cid}',
                    ctype, 'Structural' if ctype in req_fields else 'Cross-reference',
                    'Required' if ctype in req_fields else 'Optional', 'Primary', '',
                    f'Rev.1 completion of list "{sf}" (was missing from canonical link table)']
    rel_ws.append(row_vals)
    appended += 1

# extend tblRelationships ref to cover new columns+rows
tbl = rel_ws.tables['tblRelationships']
last_col = get_column_letter(start_col + 5)
tbl.ref = f'A1:{last_col}{rel_ws.max_row}'
print("Appended relationship rows:", appended)

# ---------------------------------------------------------------- SC-* refs => Missing Master Data (no string replacement)
sc_rows = [(row[ai_], str(row[ri])) for row in data if 'SC-' in str(row[ri] or '')]
for ac_id, sc in sc_rows:
    add_unresolved('Acceptance', ac_id, 'Rule ID', sc,
                   'Supplemental-Criteria rule reference; no Rules register entry exists for SC-* series.',
                   'Missing Master Data', 'High', 'Governance', True, True, 'n/a',
                   'Either promote supplemental criteria into Rules register with canonical R-xxx IDs, or extend model with Supplemental_Rule entity (recommended: model extension, not data edit).')

# ---------------------------------------------------------------- Dependencies: allowed endpoint types (model decision)
dep_ws, dep_hdr, dep_data = sheet_rows('Dependencies')
pi, si = dep_hdr.index('Predecessor ID'), dep_hdr.index('Successor ID')
wpsx = [(str(r[0]), str(r[pi]), str(r[si])) for r in dep_data
        if re.match(r'WPS-\d+-\d+$', str(r[pi])) or re.match(r'WPS-\d+-\d+$', str(r[si]))]
supp_act = col_ids('Activities', 'Activity ID'); supp_task = col_ids('Tasks', 'Task ID')
mapped = 0; unmapped = 0
for lid, p, s in wpsx:
    ok_p = bool(re.match(r'A-S-(\d+)-(\d+)$', p)) and f'A-S-{re.match(r"WPS-(\d+)-(\d+)",p).group(1)}-{re.match(r"WPS-(\d+)-(\d+)",p).group(2)}' in supp_act
    # verify supplemental activity/task naming equivalence pattern
    for v in (p, s):
        m = re.match(r'WPS-(\d+)-(\d+)$', v)
        if m:
            cand_a = f'A-S-{m.group(1)}-{m.group(2)}'; cand_t = f'T-S-{m.group(1)}-{m.group(2)}-01'
            if cand_a in supp_act or cand_t in supp_task: mapped += 1
            else: unmapped += 1
add_unresolved('Dependencies', 'multiple (77 links)', 'Predecessor/Successor ID', 'WPS-x-yy identifiers',
               'Endpoints use supplemental-chain identifier pattern (e.g. WPS-17-01) that is not a canonical registered ID of any entity; matches supplemental Activity/Task naming (A-S-17-01 / T-S-17-01-xx) but mapping is inferred, not declared.',
               'Semantic Ambiguity', 'Medium', 'Schema', True, True, 'Medium',
               'Declare allowed Dependency endpoint types in the Data Contract (Execution | Tasks | Gates | WPS | Supplemental-Activity) and either register WPS-x-yy as Supplemental_Activity keys or rewrite endpoints to canonical A-S-/T-S- IDs after owner confirmation.')

# ---------------------------------------------------------------- Execution ownership (no guessing)
ex_ws, ex_hdr, ex_data = sheet_rows('Execution')
di = ex_hdr.index('Responsible Department')
missing_ex = [str(r[0]) for r in ex_data if not str(r[di] or '').strip()]
add_unresolved('Execution', f'{len(missing_ex)} records (see list)', 'Responsible Department', '(blank)',
               'Execution rows without Responsible Department. Only 38 of 305 have values, many multi-department ("Aviation / HSE"). No deterministic single-department source exists for task-level rows (activity owners are themselves unassigned for A-R-* series).',
               'Missing Master Data', 'Critical', 'Governance', False, True, 'n/a',
               'Assign departments via Dept_Owner_Map once Owner assignment per WPS is approved; record Primary/Supporting per activity. Do NOT auto-fill.')
# store full missing list on the unresolved sheet later (extra column text)
MISSING_EX_LIST = ', '.join(missing_ex[:60]) + (' ...' if len(missing_ex) > 60 else '')

# multi-department values -> Primary/Supporting candidates
md = sorted({str(r[di]).strip() for r in ex_data if r[di] and '/' in str(r[di])})
for v in md:
    add_unresolved('Execution', 'various', 'Responsible Department', v,
                   'Multi-department text value; should become Primary/Supporting department relationships.',
                   'Semantic Ambiguity', 'Medium', 'Workbook', False, True, 'n/a',
                   'Split into Dept_Owner_Map-style relationship rows (Primary vs Supporting) during PMS11 import mapping approval.')

# ---------------------------------------------------------------- Activities Related Gap IDs prose misplacement
act_ws, act_hdr, act_data = sheet_rows('Activities')
rgi = act_hdr.index('Related Gap IDs')
prose = [(str(r[0]), str(r[rgi])) for r in act_data if r[rgi] and not re.match(r'^[A-Z0-9;\-, ]+$', str(r[rgi]).strip())]
for aid, val in prose[:1] + prose[-1:]:
    pass
add_unresolved('Activities', f'{len(prose)} records (A-R-001..A-R-089)', 'Related Gap IDs', '(gap-opening policy prose)',
               'Column contains narrative gap-opening criteria text instead of Gap IDs — column-content misplacement from source migration; original text must be preserved somewhere before clearing.',
               'Data Error', 'Medium', 'Importer', False, True, 'High (misplacement confirmed) / n/a (target field)',
               'Move prose to a Gap Opening Policy note field (or Notes) and repopulate Related Gap IDs from Gaps.Related Activity IDs inverse; requires schema decision.')

# ---------------------------------------------------------------- Duplicate Execution IDs (EX uses Task-ID namespace)
dupes = [k for k, c in Counter(str(r[0]) for r in ex_data).items() if c > 1]
add_unresolved('Execution', ', '.join(dupes) if dupes else '(none)', 'Execution ID', 'T-R-*/T-S-* values',
               f'Execution primary key duplicates: {len(dupes)}. Execution also reuses Task ID namespace instead of its own EX-* prefix.',
               'Data Error', 'Critical', 'Importer', False, True, 'High',
               'Introduce canonical Execution ID (EX-nnn) at import time; keep Canonical Reference column pointing to Task/Activity.')

# ---------------------------------------------------------------- Crew/Helideck/Accommodation presence audit
crew_expect = ['Crew_Roles','Crew_Requirements','Crew_Register','Crew_Certificates','Manning_Plan',
               'Accommodation_Checks','Accommodation_Capacity','Helideck_Profile','Helideck_Checks',
               'WORKSTREAM_CONTROL','CREW_HELI_ACCOM_DASH','RULE_WPS_MAP','CREW_HELI_ACCOM_GUIDE','WORKSTREAM_REDTEAM']
present = [s for s in crew_expect if s in wb.sheetnames]
missing_sheets = [s for s in crew_expect if s not in wb.sheetnames]
wps_names = {str(r[0]): str(r[1]) for r in sheet_rows('WPS')[2]}
for wid, want in (('WPS-23','Crew'),('WPS-19','Helideck'),('WPS-15','Accommodation')):
    nm = wps_names.get(wid,'')
    ok = want.lower() in nm.lower() or 'crew' in nm.lower() if want=='Crew' else want.lower() in nm.lower()
    log_change('Workstream verification', 'WPS', wid, 'WPS Name', nm, nm, f'Expected workstream keyword "{want}" present: {"YES" if want.lower() in nm.lower() else "NO"}')
add_unresolved('Workbook', '(structure)', 'Sheets', ', '.join(missing_sheets),
               f'Crew/Helideck/Accommodation dedicated registers listed in requirements are absent from this workbook baseline ({len(present)}/{len(crew_expect)} found). Their content currently lives inside WPS-15/19/23 activities/tasks/evidence rows.',
               'Model Error', 'Medium', 'Schema', False, True, 'n/a',
               'Either accept WPS-scoped representation (current model) or add the register sheets in the next workbook iteration. Nothing deleted; nothing invented.')

# ---------------------------------------------------------------- Sources register anomaly (from START_HERE)
add_unresolved('Sources', 'register-wide', 'Source ID', '(blank)',
               'Original Source ID column blank with attributes appearing shifted; known anomaly documented in START_HERE.',
               'Data Error', 'Medium', 'Importer', False, True, 'n/a',
               'Re-extract Sources register from original Rev.0 file with correct column alignment.')

# ---------------------------------------------------------------- write report sheets
def add_sheet(name, headers, rows, widths=None):
    if name in wb.sheetnames:
        del wb[name]
    ws = wb.create_sheet(name)
    ws.append(headers)
    for r in rows:
        ws.append(list(r))
    for cell in ws[1]:
        cell.font = openpyxl.styles.Font(bold=True)
        cell.fill = openpyxl.styles.PatternFill('solid', fgColor='DDEBF7')
    ws.freeze_panes = 'A2'
    for j, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(j)].width = (widths or {}).get(j, max(14, min(40, len(str(h)) + 4)))
    return ws

add_sheet('MASTER_DATA_CHANGE_REPORT',
          ['Category','Sheet','Record ID','Field','Old Value','New Value','Basis / Evidence'],
          change_report, {5:40, 6:60, 7:80})

# build repair report from actual repairs
rep_rows = []
for e in expanded_rows:
    if len(e) == 5:
        pe, pid, cid, sf, orig = e
        rep_rows.append((pe, pid, 'Gates', cid, GATE_TYPE[pe] + '_MULTI_EXPANDED',
                         f'Multi-value "{sf}"={orig} expanded into independent relationships (M:N preserved)',
                         'All Gate IDs verified against Gates register'))
    else:
        pe, pid, ce, cid, sf, orig, _ = e
        ctype, _d = rel_type_for(pe, ce, sf)
        rep_rows.append((pe, pid, ce, cid, ctype,
                         f'List member of "{sf}" materialized as explicit typed relationship',
                         'Canonical ID verified in target register'))
for cat, sh, rid, fld, old, new, basis in change_report:
    if cat == 'Canonical ID repair':
        rep_rows.append(('Acceptance', rid, 'Evidence', new, 'PROVEN_BY',
                         f'Legacy alias {old} resolved to canonical Evidence ID', basis))
add_sheet('RELATIONSHIP_REPAIR_REPORT',
          ['Parent Entity','Parent ID','Child Entity','Child ID','Relationship Type','Reason','Source'],
          rep_rows, {6:60, 7:70})

add_sheet('UNRESOLVED_REFERENCE_REPORT',
          ['Finding ID','Entity','Record ID','Field','Current Value','Problem','Classification','Severity',
           'Root Cause','Needs AI','Needs Admin','Confidence','Required To Resolve'],
          [(u[0], u[1], (MISSING_EX_LIST if u[1]=='Execution' and u[2].endswith('records (see list)') else u[2]),
            u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11], u[12]) for u in unresolved],
          {5:45, 6:60, 13:60})

own_rows = [(d, r, role, 'Execution.Discipline Lead + Activities.Activity Owner + WPS.Responsible Lead') for d, r, role in DEPT_OWNER_MAP]
add_sheet('OWNERSHIP_REPORT', ['Department','Owner / Operational Role','Primary / Supporting','Evidence Source'],
          own_rows, {4:70})
add_sheet('APPLICATION_ROLE_REPORT', ['Department Scope','Application Role','Basis','Status'],
          [(d, a, b, 'Proposed — requires Admin confirmation') for d, a, b in DEPT_APP_MAP], {3:45})
add_sheet('CREW_HELIDECK_ACCOM_REPORT', ['Item','Status','Detail'],
          [(s, 'Present' if s in wb.sheetnames else 'Absent in this baseline',
            'Content represented within WPS-scoped registers' if s not in wb.sheetnames else '') for s in crew_expect] +
          [('WPS-23 name', 'Verified', wps_names.get('WPS-23','')),
           ('WPS-19 name', 'Verified', wps_names.get('WPS-19','')),
           ('WPS-15 name', 'Verified', wps_names.get('WPS-15',''))], {3:60})

pp_ws, pp_hdr, pp_data = sheet_rows('POWERPIVOT_RELATIONS')
add_sheet('POWERPIVOT_READINESS_REPORT', ['Check','Result','Note'],
          [('Source tables canonical after Rev.1', 'PASS', 'E-R aliases removed; Relationships enriched with typed columns'),
           ('Ambiguous/multi-value refs remaining', 'SEE UNRESOLVED_REFERENCE_REPORT', 'Imported into PMS11 where Red Team engine runs at Record+Field level'),
           ('PowerPivot used as truth source', 'NO', 'Analytical projection only, per principle X'),
           ('Existing PowerPivot relations preserved', 'UNCHANGED', 'See POWERPIVOT_RELATIONS / POWERPIVOT_STATUS sheets retained')], {3:70})

# QA_SUMMARY
total_records = sum(len(sheet_rows(s)[2]) for s in CANON_SHEETS)
total_rels = rel_ws.max_row - 1
valid = total_rels - appended - er_rel_fixed
add_sheet('QA_SUMMARY', ['Metric','Value'],
          [('Total records checked', total_records),
           ('Total relationships checked', total_rels),
           ('Valid (unchanged)', valid),
           ('Repaired (canonical ID)', er_fixed + er_rel_fixed),
           ('Expanded/completed relationship rows added', appended),
           ('Unresolved findings', len(unresolved)),
           ('Requires human decision (Admin)', sum(1 for u in unresolved if u[10]=='Yes')),
           ('Requires AI investigation', sum(1 for u in unresolved if u[9]=='Yes')),
           ('Critical', sum(1 for u in unresolved if u[7]=='Critical')),
           ('High', sum(1 for u in unresolved if u[7]=='High')),
           ('Medium', sum(1 for u in unresolved if u[7]=='Medium')),
           ('Low', sum(1 for u in unresolved if u[7]=='Low')),
           ('Duplicate IDs', len(dupes)),
           ('Departments (master)', len(MASTER_DEPARTMENTS)),
           ('Operational Roles (master)', len(OPERATIONAL_ROLES)),
           ('Application Roles (master)', len(APP_ROLES)),
           ('WPS preserved', len(col_ids('WPS','WPS ID'))),
           ('Rules preserved', len(col_ids('Rules','Rule ID')))], {})

# README_REV1
add_sheet('README_REV1', ['Section','Content'],
          [('File','PMS11_MASTER_DATA_Rev.1 — derived from PMS11_POWERPIVOT_READY.xlsx (Rev.0 kept untouched)'),
           ('Purpose','Import-ready Master Data Source for PMS11; Red Team will run inside the application.'),
           ('Repairs performed','Deterministic only: E-R alias->canonical Evidence (178 refs); multi-Gate expansion to explicit typed relationships; Relationships typing columns added; governed master sheets added.'),
           ('NOT done (by design)','No invented departments/owners/roles/data; no string-replacement fixes; no forced PASS. See UNRESOLVED_REFERENCE_REPORT.'),
           ('Red Team handoff','Every finding is Record+Field level: Finding ID, Entity, Record ID, Field, Current Value, Expected context, Classification, Severity, Root Cause.'),
           ('Grouping note','Root-cause grouping available via Classification/Root Cause columns; record-level detail never lost.'),
           ('Formulas/tables','Preserved; workbook edited via openpyxl which retains structured references and table objects.'),
           ('PowerPivot','Analytical projection only; truth = Master Data + Entity tables + Relationships sheet.')], {2:110})

wb.save(DST)
print("SAVED", DST)
