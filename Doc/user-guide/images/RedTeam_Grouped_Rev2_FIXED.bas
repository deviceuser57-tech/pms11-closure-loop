Attribute VB_Name = "RedTeam"
Option Explicit

' PMS11 RED TEAM — Rev.1
' Purpose:
'   1) Preserve row-level evidence in REDTEAM_RESULTS.
'   2) Produce grouped/root-cause output in REDTEAM_GROUPS.
'   3) Produce action-oriented remediation rows in REDTEAM_ACTIONS.
'   4) Include Crew / Helideck / Accommodation workstreams without recalculating
'      the entire workbook.
'
' IMPORTANT:
'   This module does not "fix" source data. It diagnoses it.
'   Multi-valued references are reported as relationships and are not silently
'   collapsed into one ID.

Private runID As String
Private checks As Long, failures As Long, resultRow As Long
Private oldEvents As Boolean, oldScreen As Boolean

Private Sub LogCheck(ByVal tid As String, ByVal category As String, _
                      ByVal entity As String, ByVal recordID As String, _
                      ByVal expected As String, ByVal actual As String, _
                      ByVal ok As Boolean, Optional ByVal sourceField As String = "")

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("REDTEAM_RESULTS")

    checks = checks + 1
    If Not ok Then failures = failures + 1

    ws.Cells(resultRow, 1).Resize(1, 10).Value = Array( _
        runID, tid, category, entity, recordID, expected, actual, _
        IIf(ok, "PASS", "FAIL"), Now, sourceField)

    resultRow = resultRow + 1
End Sub

Private Function Tbl(ByVal entity As String) As ListObject
    Set Tbl = ThisWorkbook.Worksheets(entity).ListObjects("tbl" & entity)
End Function

Private Function ValAt(ByVal t As ListObject, ByVal r As Long, ByVal field As String) As Variant
    ValAt = t.ListColumns(field).DataBodyRange.Cells(r, 1).Value
End Function

Private Function ExistsID(ByVal entity As String, ByVal id As String) As Boolean
    If Len(Trim$(id)) = 0 Then Exit Function
    On Error Resume Next
    ExistsID = Application.CountIf(Tbl(entity).ListColumns(1).DataBodyRange, id) > 0
    On Error GoTo 0
End Function

Private Function SheetExists(ByVal sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    SheetExists = Not ws Is Nothing
    On Error GoTo 0
End Function

Private Function SafeText(ByVal v As Variant) As String
    If IsError(v) Then
        SafeText = "#ERROR"
    ElseIf IsEmpty(v) Then
        SafeText = ""
    Else
        SafeText = CStr(v)
    End If
End Function

Private Sub EnsureOutputSheets()
    Dim ws As Worksheet

    If Not SheetExists("REDTEAM_GROUPS") Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets("REDTEAM_RESULTS"))
        ws.Name = "REDTEAM_GROUPS"
    End If

    If Not SheetExists("REDTEAM_ACTIONS") Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets("REDTEAM_GROUPS"))
        ws.Name = "REDTEAM_ACTIONS"
    End If

    With ThisWorkbook.Worksheets("REDTEAM_RESULTS")
        .Cells.ClearContents
        .Range("A1:J1").Value = Array("Run ID", "Test ID", "Category", "Entity", _
            "Record ID", "Expected", "Actual", "Result", "Timestamp", "Source Field")
        .Rows(1).Font.Bold = True
    End With
End Sub

Private Sub CalculateRedTeamScope()
    Dim e As Variant

    ' Do NOT use Application.CalculateFull here.
    ' The previous implementation recalculated the complete workbook and became
    ' disproportionately slow after Crew/Helideck/Accommodation were added.

    For Each e In Array("Rules", "WPS", "Activities", "Deliverables", "Tasks", _
                        "Gaps", "Acceptance", "Evidence", "Gates", "Execution", _
                        "Functional", "Dependencies", "Sources", "Responsibilities", _
                        "Risks", "Changes", "Relationships")
        If SheetExists(CStr(e)) Then ThisWorkbook.Worksheets(CStr(e)).Calculate
    Next e

    For Each e In Array("Crew_Roles", "Crew_Requirements", "Crew_Register", _
                        "Crew_Certificates", "Manning_Plan", "Accommodation_Checks", _
                        "Accommodation_Capacity", "Helideck_Profile", "Helideck_Checks", _
                        "CREW_HELI_ACCOM_DASH")
        If SheetExists(CStr(e)) Then ThisWorkbook.Worksheets(CStr(e)).Calculate
    Next e
End Sub

Private Sub RunCoreChecks()
    Dim entities As Variant, e As Variant, t As ListObject
    Dim r As Long, c As Range, field As Variant
    Dim id As String, n As Long
    Dim parent As String, child As String, pid As String, cid As String
    Dim status As String, st As Variant, fin As Variant
    Dim progress As Variant, weight As Variant, location As String
    Dim cfg As Worksheet

    Set cfg = ThisWorkbook.Worksheets("CONFIG")

    n = Tbl("WPS").ListRows.Count
    LogCheck "SCOPE-WPS", "Scope", "WPS", "", CStr(cfg.Range("B2").Value), CStr(n), _
        n = cfg.Range("B2").Value, "WPS"

    n = Tbl("Rules").ListRows.Count
    LogCheck "SCOPE-RULES", "Scope", "Rules", "", CStr(cfg.Range("B3").Value), CStr(n), _
        n = cfg.Range("B3").Value, "Rules"

    For r = 1 To CLng(cfg.Range("B2").Value)
        id = "WPS-" & Format$(r, "00")
        LogCheck "WPS-SEQUENCE", "Scope", "WPS", id, "Present", _
            IIf(ExistsID("WPS", id), "Present", "Missing"), ExistsID("WPS", id), "WPS ID"
    Next r

    entities = Array("Rules", "WPS", "Activities", "Deliverables", "Tasks", "Gaps", _
                     "Acceptance", "Evidence", "Gates", "Execution", "Functional", _
                     "Dependencies", "Sources", "Responsibilities", "Risks", "Changes")

    For Each e In entities
        Set t = Tbl(CStr(e))
        For r = 1 To t.ListRows.Count
            id = CStr(t.DataBodyRange.Cells(r, 1).Value)
            If Application.CountA(t.ListRows(r).Range) > 0 Then
                n = Application.CountIf(t.ListColumns(1).DataBodyRange, id)
                LogCheck "PK", "Keys", CStr(e), id, "Nonblank unique key", _
                    "Occurrences=" & n, Len(Trim$(id)) > 0 And n = 1, t.ListColumns(1).Name
            End If
        Next r
    Next e

    For Each e In Array("Rules", "Activities", "Deliverables", "Tasks", "Acceptance")
        Set t = Tbl(CStr(e))
        For Each field In Array("WPS ID", "Activity ID", "Rule ID", "Deliverable ID", _
                                "Acceptance Criteria ID", "Evidence ID")
            child = ""
            Select Case CStr(field)
                Case "WPS ID": child = "WPS"
                Case "Activity ID": child = "Activities"
                Case "Rule ID": child = "Rules"
                Case "Deliverable ID": child = "Deliverables"
                Case "Acceptance Criteria ID": child = "Acceptance"
                Case "Evidence ID": child = "Evidence"
            End Select

            n = 0
            For Each c In t.HeaderRowRange.Cells
                If CStr(c.Value) = CStr(field) And c.Column <> t.Range.Column Then
                    n = c.Column - t.Range.Column + 1
                End If
            Next c

            If n > 0 Then
                For r = 1 To t.ListRows.Count
                    cid = CStr(t.DataBodyRange.Cells(r, n).Value)
                    id = CStr(t.DataBodyRange.Cells(r, 1).Value)
                    If Len(Trim$(cid)) > 0 Then
                        LogCheck "DIRECT-FK", "Relationships", CStr(e), id, _
                            CStr(field) & " exists", cid, ExistsID(child, cid), CStr(field)
                    End If
                Next r
            End If
        Next field
    Next e

    Set t = Tbl("Relationships")
    For r = 1 To t.ListRows.Count
        parent = CStr(ValAt(t, r, "Parent Entity"))
        child = CStr(ValAt(t, r, "Child Entity"))
        pid = CStr(ValAt(t, r, "Parent ID"))
        cid = CStr(ValAt(t, r, "Child ID"))

        LogCheck "FK-PARENT", "Relationships", parent, pid, "Parent exists", pid, _
            ExistsID(parent, pid), "Parent ID"

        LogCheck "FK-CHILD", "Relationships", child, cid, "Child exists", cid, _
            ExistsID(child, cid), "Child ID"
    Next r

    Set t = Tbl("Execution")
    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Execution ID"))
        cid = CStr(ValAt(t, r, "WPS ID"))

        LogCheck "EXEC-WPS", "Relationships", "Execution", id, "Valid WPS", cid, _
            ExistsID("WPS", cid), "WPS ID"

        st = ValAt(t, r, "Planned Start")
        fin = ValAt(t, r, "Planned Finish")
        If Len(CStr(st)) > 0 Or Len(CStr(fin)) > 0 Then
            If IsDate(st) And IsDate(fin) Then
                LogCheck "DATE-ORDER", "Schedule", "Execution", id, "Finish >= Start", _
                    CStr(st) & " / " & CStr(fin), CDate(fin) >= CDate(st), "Planned Start / Planned Finish"
            Else
                LogCheck "DATE-TYPE", "Schedule", "Execution", id, _
                    "Both planned dates valid", CStr(st) & " / " & CStr(fin), False, _
                    "Planned Start / Planned Finish"
            End If
        End If

        progress = ValAt(t, r, "Completion %")
        weight = ValAt(t, r, "Weight %")

        LogCheck "PROGRESS", "Execution", "Execution", id, "Numeric 0..1", CStr(progress), _
            IsNumeric(progress) And Val(CStr(progress)) >= 0 And Val(CStr(progress)) <= 1, "Completion %"

        LogCheck "WEIGHT", "Execution", "Execution", id, "Numeric 0..1", CStr(weight), _
            IsNumeric(weight) And Val(CStr(weight)) >= 0 And Val(CStr(weight)) <= 1, "Weight %"

        status = LCase$(CStr(ValAt(t, r, "Status")))
        If status = "completed" Then
            LogCheck "COMPLETED", "Execution", "Execution", id, _
                "100% with actual finish", CStr(progress), _
                Val(CStr(progress)) = 1 And IsDate(ValAt(t, r, "Actual Finish")), _
                "Completion % / Actual Finish"
        End If

        LogCheck "OWNER", "Ownership", "Execution", id, "Department assigned", _
            CStr(ValAt(t, r, "Responsible Department")), _
            Len(Trim$(CStr(ValAt(t, r, "Responsible Department")))) > 0, _
            "Responsible Department"

        For Each field In Array("Estimated Cost", "Approved Budget", "Committed Cost", _
                                "Actual Cost", "Remaining Estimate")
            st = ValAt(t, r, CStr(field))
            If Len(CStr(st)) > 0 Then
                LogCheck "COST", "Finance", "Execution", id, CStr(field) & " numeric >=0", _
                    CStr(st), IsNumeric(st) And Val(CStr(st)) >= 0, CStr(field)
            End If
        Next field
    Next r

    LogCheck "TOTAL-WEIGHT", "Execution", "Execution", "", "Positive total weights", _
        CStr(Application.Sum(t.ListColumns("Weight %").DataBodyRange)), _
        Application.Sum(t.ListColumns("Weight %").DataBodyRange) > 0, "Weight %"

    Set t = Tbl("Gaps")
    For r = 1 To t.ListRows.Count
        If LCase$(CStr(ValAt(t, r, "Status"))) = "closed" Then
            id = CStr(ValAt(t, r, "Gap ID"))
            LogCheck "GAP-CLOSURE", "Closure", "Gaps", id, _
                "Evidence, authority, closure date", CStr(ValAt(t, r, "Closure Evidence")), _
                Len(Trim$(CStr(ValAt(t, r, "Closure Evidence")))) > 0 And _
                Len(Trim$(CStr(ValAt(t, r, "Closure Authority")))) > 0 And _
                IsDate(ValAt(t, r, "Closure Date")), _
                "Closure Evidence / Closure Authority / Closure Date"
        End If
    Next r

    Set t = Tbl("Evidence")
    For r = 1 To t.ListRows.Count
        status = LCase$(CStr(ValAt(t, r, "Status")))
        If status = "verified" Or status = "approved" Then
            id = CStr(ValAt(t, r, "Evidence ID"))
            location = CStr(ValAt(t, r, "File Location"))
            LogCheck "EVIDENCE-CLOSURE", "Evidence", "Evidence", id, _
                "Location, verifier, verification date", location, _
                Len(Trim$(location)) > 0 And _
                Len(Trim$(CStr(ValAt(t, r, "Verified By")))) > 0 And _
                IsDate(ValAt(t, r, "Verification Date")), _
                "File Location / Verified By / Verification Date"

            st = ValAt(t, r, "Expiry Date")
            If IsDate(st) Then
                LogCheck "EVIDENCE-EXPIRY", "Evidence", "Evidence", id, _
                    "Not expired", CStr(st), CDate(st) >= Date, "Expiry Date"
            End If
        End If
    Next r

    Set t = Tbl("Dependencies")
    For r = 1 To t.ListRows.Count
        pid = CStr(ValAt(t, r, "Predecessor ID"))
        cid = CStr(ValAt(t, r, "Successor ID"))
        id = CStr(ValAt(t, r, "Link ID"))

        LogCheck "DEP-PARENT", "Dependencies", "Dependencies", id, _
            "Execution or gate exists", pid, _
            ExistsID("Execution", pid) Or ExistsID("Gates", pid), "Predecessor ID"

        LogCheck "DEP-CHILD", "Dependencies", "Dependencies", id, _
            "Execution or gate exists", cid, _
            ExistsID("Execution", cid) Or ExistsID("Gates", cid), "Successor ID"

        LogCheck "DEP-SELF", "Dependencies", "Dependencies", id, _
            "No self link", pid & " -> " & cid, pid <> cid, _
            "Predecessor ID / Successor ID"
    Next r

    For Each e In entities
        Set t = Tbl(CStr(e))
        For Each c In t.DataBodyRange.Cells
            If IsError(c.Value) Then
                LogCheck "CELL-ERROR", "Calculation", CStr(e), c.Address(False, False), _
                    "No Excel error", c.Text, False, c.Address(False, False)
            End If
        Next c
    Next e
End Sub

Private Sub RunWorkstreamChecks()
    Dim e As Variant, t As ListObject, r As Long, c As Range
    Dim id As String, status As String, n As Long
    Dim ws As Worksheet

    If Not SheetExists("Crew_Register") Then Exit Sub

    ' Scope
    Set t = Tbl("WPS")
    LogCheck "WPS-SCOPE", "Workstream", "WPS", "", "24 WPS preserved", _
        CStr(t.ListRows.Count), t.ListRows.Count = 24, "WPS ID"

    For Each e In Array("WPS-23", "WPS-19", "WPS-15")
        n = Application.CountIf(t.ListColumns("WPS ID").DataBodyRange, CStr(e))
        LogCheck "DEDICATED-WPS", "Workstream", "WPS", CStr(e), _
            "Unique WPS exists", CStr(n), n = 1, "WPS ID"
    Next e

    For Each e In Array("Crew_Roles", "Crew_Requirements", "Crew_Register", _
                        "Crew_Certificates", "Manning_Plan", "Accommodation_Checks", _
                        "Accommodation_Capacity", "Helideck_Profile", "Helideck_Checks")
        Set t = ThisWorkbook.Worksheets(CStr(e)).ListObjects(1)

        For r = 1 To t.ListRows.Count
            id = CStr(t.DataBodyRange.Cells(r, 1).Value)

            If Len(id) > 0 Then
                n = Application.CountIf(t.ListColumns(1).DataBodyRange, id)
                LogCheck "KEY-UNIQUE", "Workstream", CStr(e), id, _
                    "Unique populated key", CStr(n), n = 1, t.ListColumns(1).Name
            ElseIf Application.CountA(t.ListRows(r).Range) > 0 Then
                n = 0
                For Each c In t.ListRows(r).Range.Cells
                    If Not c.HasFormula Then
                        If Len(CStr(c.Value)) > 0 Then n = n + 1
                    End If
                Next c

                If n > 0 Then
                    LogCheck "KEY-MISSING", "Workstream", CStr(e), "row " & CStr(r), _
                        "Identifier for populated record", "Blank key", False, t.ListColumns(1).Name
                End If
            End If
        Next r

        For Each c In t.DataBodyRange.Cells
            If IsError(c.Value) Then
                LogCheck "CALCULATION", "Workstream", CStr(e), c.Address(False, False), _
                    "No Excel error", c.Text, False, c.Address(False, False)
            End If
        Next c
    Next e

    Set t = ThisWorkbook.Worksheets("Crew_Requirements").ListObjects(1)
    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Requirement ID"))
        If CStr(ValAt(t, r, "Applicability")) = "Applicable" Then
            n = Application.CountIfs( _
                t.ListColumns("Role ID").DataBodyRange, ValAt(t, r, "Role ID"), _
                t.ListColumns("Certificate Type").DataBodyRange, ValAt(t, r, "Certificate Type"), _
                t.ListColumns("Applicability").DataBodyRange, "Applicable")

            LogCheck "ROLE-CREDENTIAL-UNIQUE", "Crew", "Crew_Requirements", id, _
                "One active role / credential-type row", CStr(n), n = 1, _
                "Role ID / Certificate Type / Applicability"
        End If
    Next r

    Set t = ThisWorkbook.Worksheets("Crew_Register").ListObjects(1)
    n = Application.CountA(t.ListColumns("Crew ID").DataBodyRange)
    LogCheck "ACTUAL-ROSTER", "Crew", "Crew_Register", "", _
        "Actual crew records supplied", CStr(n), n > 0, "Crew ID"

    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Crew ID"))
        If Len(id) > 0 Then
            status = CStr(ValAt(t, r, "Duty Eligibility"))
            LogCheck "CREW-ELIGIBILITY", "Crew", "Crew_Register", id, _
                "Verified credentials, role and deployment", status, _
                status = "ELIGIBLE", "Duty Eligibility"
        End If
    Next r

    Set t = ThisWorkbook.Worksheets("Crew_Certificates").ListObjects(1)
    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Certificate ID"))
        If Len(id) > 0 Then
            status = CStr(ValAt(t, r, "Credential Result"))
            LogCheck "CERTIFICATE", "Crew", "Crew_Certificates", id, _
                "VALID credential", status, status = "VALID", "Credential Result"
        End If
    Next r

    Set t = ThisWorkbook.Worksheets("Manning_Plan").ListObjects(1)
    n = Application.CountIf(t.ListColumns("Applicability").DataBodyRange, "Applicable")
    LogCheck "APPROVED-DEMAND", "Crew", "Manning_Plan", "", _
        "Applicable staffing lines defined", CStr(n), n > 0, "Applicability"

    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Manning Line ID"))
        status = CStr(ValAt(t, r, "Coverage Result"))
        LogCheck "MINIMUM-COVERAGE", "Crew", "Manning_Plan", id, _
            "Approved demand covered or documented N/A", status, _
            status = "COVERED - REVIEW" Or status = "N/A - REVIEW", _
            "Coverage Result"
    Next r

    For Each e In Array("Accommodation_Checks", "Helideck_Checks")
        Set t = ThisWorkbook.Worksheets(CStr(e)).ListObjects(1)
        For r = 1 To t.ListRows.Count
            id = CStr(t.DataBodyRange.Cells(r, 1).Value)
            status = CStr(ValAt(t, r, "Control Result"))

            If status = "N/A - REVIEW" Then
                LogCheck "DOCUMENTED-NA", "Workstream", CStr(e), id, _
                    "Criteria, evidence, reviewer and authority disposition", status, _
                    Len(CStr(ValAt(t, r, "Evidence ID"))) > 0 And _
                    CStr(ValAt(t, r, "Authority Acceptance")) = "Accepted", _
                    "Evidence ID / Authority Acceptance"
            Else
                LogCheck "VERIFICATION", "Workstream", CStr(e), id, _
                    "VERIFIED", status, status = "VERIFIED", "Control Result"
            End If
        Next r
    Next e

    Set t = ThisWorkbook.Worksheets("Accommodation_Capacity").ListObjects(1)
    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Capacity Plan ID"))
        status = CStr(ValAt(t, r, "Capacity Result"))
        LogCheck "POB-CAPACITY", "Accommodation", "Accommodation_Capacity", id, _
            "Approved POB and verified capacity cover planned occupancy", status, _
            status = "WITHIN LIMIT - REVIEW", "Capacity Result"
    Next r

    Set t = ThisWorkbook.Worksheets("Helideck_Profile").ListObjects(1)
    For r = 1 To t.ListRows.Count
        status = CStr(ValAt(t, r, "Profile Result"))
        LogCheck "HELIDECK-BASIS", "Helideck", "Helideck_Profile", _
            CStr(ValAt(t, r, "Helideck Profile ID")), _
            "Basis recorded or documented N/A", status, _
            status = "BASIS RECORDED - REVIEW" Or status = "N/A - REVIEW", _
            "Profile Result"
    Next r
End Sub

Private Function RootCause(ByVal tid As String, ByVal entity As String, _
                           ByVal sourceField As String, ByVal actual As String) As String

    Select Case tid
        Case "OWNER"
            RootCause = "RC-OWN-001 | Execution ownership not assigned"
        Case "DIRECT-FK"
            If InStr(1, actual, "SC-", vbTextCompare) = 1 Then
                RootCause = "RC-REL-001 | Acceptance Rule ID points to non-canonical SC-* key"
            ElseIf InStr(1, actual, "E-", vbTextCompare) = 1 Then
                RootCause = "RC-REL-002 | Acceptance Evidence ID points to non-canonical evidence key"
            Else
                RootCause = "RC-REL-999 | Direct foreign-key reference unresolved"
            End If
        Case "FK-CHILD"
            If InStr(1, actual, "E-R-", vbTextCompare) = 1 Then
                RootCause = "RC-REL-002 | Relationships contain non-canonical E-R-* evidence key"
            ElseIf InStr(1, actual, "AC-", vbTextCompare) = 1 Then
                RootCause = "RC-REL-003 | Relationships contain unresolved Acceptance child key"
            Else
                RootCause = "RC-REL-999 | Relationship child key unresolved"
            End If
        Case "DEP-PARENT"
            If InStr(1, actual, "WPS-", vbTextCompare) = 1 Then
                RootCause = "RC-DEP-001 | Dependency model uses WPS ID where test expects execution/gate lineage"
            Else
                RootCause = "RC-DEP-999 | Dependency predecessor unresolved"
            End If
        Case "TOTAL-WEIGHT"
            RootCause = "RC-EXEC-001 | Execution weight model has zero aggregate weight"
        Case "MINIMUM-COVERAGE"
            RootCause = "RC-CREW-001 | Manning line is not covered/documented as N/A"
        Case "VERIFICATION"
            RootCause = "RC-HELACCOM-001 | Control remains unverified"
        Case "ACTUAL-ROSTER"
            RootCause = "RC-CREW-002 | No actual crew roster supplied"
        Case "APPROVED-DEMAND"
            RootCause = "RC-CREW-003 | No applicable staffing demand supplied"
        Case "POB-CAPACITY"
            RootCause = "RC-ACCOM-001 | Accommodation capacity result not within approved limit"
        Case "HELIDECK-BASIS"
            RootCause = "RC-HEL-001 | Helideck operating basis not recorded/accepted"
        Case "CERTIFICATE"
            RootCause = "RC-CREW-004 | Crew credential is not valid"
        Case "CREW-ELIGIBILITY"
            RootCause = "RC-CREW-005 | Crew duty eligibility not established"
        Case Else
            RootCause = "RC-GEN-999 | Unclassified Red Team finding"
    End Select
End Function

Private Function RTSeverity(ByVal tid As String) As String
    Select Case tid
        Case "DIRECT-FK", "FK-CHILD", "DEP-PARENT"
            RTSeverity = "HIGH"
        Case "OWNER", "TOTAL-WEIGHT", "MINIMUM-COVERAGE", "VERIFICATION", _
             "ACTUAL-ROSTER", "APPROVED-DEMAND", "POB-CAPACITY", "HELIDECK-BASIS", _
             "CERTIFICATE", "CREW-ELIGIBILITY"
            RTSeverity = "MEDIUM"
        Case Else
            RTSeverity = "LOW"
    End Select
End Function

Private Function RTPriority(ByVal tid As String) As String
    Select Case tid
        Case "DIRECT-FK", "FK-CHILD"
            RTPriority = "P1"
        Case "DEP-PARENT", "OWNER", "TOTAL-WEIGHT"
            RTPriority = "P2"
        Case Else
            RTPriority = "P3"
    End Select
End Function

Private Function RecommendedAction(ByVal rootCause As String) As String
    Select Case True
        Case InStr(rootCause, "SC-*") > 0
            RecommendedAction = "Decide whether SC-* is a governed Rule entity or a separate source type; then either create canonical Rule records or change the relationship type. Do not rename blindly."
        Case InStr(rootCause, "E-R-*") > 0
            RecommendedAction = "Reconcile Acceptance/Evidence references against canonical Evidence IDs. Preserve many-to-many evidence links in Relationships."
        Case InStr(rootCause, "Dependency model") > 0
            RecommendedAction = "Classify dependency endpoints explicitly (WPS, Execution, Gate, etc.) and update the Red Team rule to validate the permitted endpoint types rather than forcing one model."
        Case InStr(rootCause, "ownership") > 0
            RecommendedAction = "Populate/derive Responsible Department from the governed Department model and preserve primary/supporting ownership where applicable."
        Case InStr(rootCause, "zero aggregate") > 0
            RecommendedAction = "Define the authoritative Weight % contract. If weights are optional for a scenario, make the Red Team check conditional instead of inventing weights."
        Case InStr(rootCause, "Manning") > 0
            RecommendedAction = "Review actual qualified crew, approved demand, credential validity and deployment before marking coverage."
        Case InStr(rootCause, "Accommodation") > 0
            RecommendedAction = "Complete approved POB/capacity evidence and authority disposition; do not treat a calculated result as an operating approval."
        Case InStr(rootCause, "Helideck") > 0
            RecommendedAction = "Record the actual operating basis, competent authority and evidence/acceptance before treating the profile as verified."
        Case Else
            RecommendedAction = "Review source record and classify the finding before applying a data correction."
    End Select
End Function

Private Sub BuildGroupedReport()
    Dim src As Worksheet, grp As Worksheet, act As Worksheet
    Dim last As Long, r As Long, gRow As Long, aRow As Long
    Dim dict As Object, key As String, rc As String
    Dim item As Variant, parts As Variant
    Dim countFail As Long, sampleIDs As String, maxSamples As Long
    Dim tid As String, entity As String, field As String, actual As String
    Dim severity As String, priority As String, action As String

    Set src = ThisWorkbook.Worksheets("REDTEAM_RESULTS")
    Set grp = ThisWorkbook.Worksheets("REDTEAM_GROUPS")
    Set act = ThisWorkbook.Worksheets("REDTEAM_ACTIONS")

    grp.Cells.ClearContents
    act.Cells.ClearContents

    grp.Range("A1:J1").Value = Array("Run ID", "Root Cause ID / Description", "Severity", _
        "Priority", "Test ID", "Category", "Entity", "Source Field", "Failure Count", "Sample Record IDs")

    act.Range("A1:H1").Value = Array("Run ID", "Action ID", "Root Cause", "Severity", _
        "Priority", "Affected Count", "Recommended Action", "Status")

    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare

    last = src.Cells(src.Rows.Count, 1).End(xlUp).Row
    maxSamples = 8

    For r = 2 To last
        If UCase$(CStr(src.Cells(r, 8).Value)) = "FAIL" Then
            tid = CStr(src.Cells(r, 2).Value)
            entity = CStr(src.Cells(r, 4).Value)
            field = CStr(src.Cells(r, 10).Value)
            actual = CStr(src.Cells(r, 7).Value)

            rc = RootCause(tid, entity, field, actual)
            key = rc & "||" & tid & "||" & entity & "||" & field

            If Not dict.Exists(key) Then
                dict.Add key, Array( _
                    0, _
                    CStr(src.Cells(r, 1).Value), _
                    rc, _
                    RTSeverity(tid), _
                    RTPriority(tid), _
                    tid, _
                    CStr(src.Cells(r, 3).Value), _
                    entity, _
                    field, _
                    "" _
                )
            End If

            item = dict(key)
            item(0) = CLng(item(0)) + 1

            If Len(CStr(item(9))) < 1 Then
                item(9) = CStr(src.Cells(r, 5).Value)
            Else
                sampleIDs = CStr(item(9))
                If Len(sampleIDs) < 250 Then
                    item(9) = sampleIDs & ", " & CStr(src.Cells(r, 5).Value)
                End If
            End If

            dict(key) = item
        End If
    Next r

    gRow = 2
    aRow = 2

    For Each item In dict.Items
        grp.Cells(gRow, 1).Resize(1, 10).Value = Array( _
            item(1), item(2), item(3), item(4), item(5), item(6), _
            item(7), item(8), item(0), item(9))

        action = RecommendedAction(CStr(item(2)))

        act.Cells(aRow, 1).Resize(1, 8).Value = Array( _
            item(1), _
            "ACT-" & Format$(aRow - 1, "000"), _
            item(2), item(3), item(4), item(0), action, "OPEN")

        gRow = gRow + 1
        aRow = aRow + 1
    Next item

    grp.Rows(1).Font.Bold = True
    act.Rows(1).Font.Bold = True
    grp.Columns("A:J").AutoFit
    act.Columns("A:H").AutoFit

    ' Sort grouped findings by Priority then Severity then Failure Count.
    If gRow > 2 Then
        With grp.Sort
            .SortFields.Clear
            .SortFields.Add Key:=grp.Range("D2:D" & gRow - 1), SortOn:=xlSortOnValues, Order:=xlAscending
            .SortFields.Add Key:=grp.Range("C2:C" & gRow - 1), SortOn:=xlSortOnValues, Order:=xlAscending
            .SortFields.Add Key:=grp.Range("I2:I" & gRow - 1), SortOn:=xlSortOnValues, Order:=xlDescending
            .SetRange grp.Range("A1:J" & gRow - 1)
            .Header = xlYes
            .Apply
        End With
    End If
End Sub

Private Sub UpdateHistory()
    Dim hist As Worksheet, n As Long
    Set hist = ThisWorkbook.Worksheets("REDTEAM_HISTORY")

    If hist.Range("A2").Value = "NOT RUN" Then hist.Rows(2).ClearContents

    n = hist.Cells(hist.Rows.Count, 1).End(xlUp).Row + 1
    hist.Cells(n, 1).Resize(1, 7).Value = Array( _
        runID, Now, checks, failures, IIf(failures = 0, "PASS", "FAIL"), _
        ThisWorkbook.Worksheets("REDTEAM_GROUPS").UsedRange.Rows.Count - 1, _
        ThisWorkbook.Worksheets("REDTEAM_ACTIONS").UsedRange.Rows.Count - 1)
End Sub

Public Sub RunRedTeam()
    On Error GoTo Failed

    oldEvents = Application.EnableEvents
    oldScreen = Application.ScreenUpdating

    Application.EnableEvents = False
    Application.ScreenUpdating = False
    Application.StatusBar = "PMS11 Red Team: preparing..."

    runID = Format$(Now, "yyyymmdd-hhnnss")
    checks = 0
    failures = 0
    resultRow = 2

    EnsureOutputSheets
    Application.StatusBar = "PMS11 Red Team: calculating scoped sheets..."
    CalculateRedTeamScope

    Application.StatusBar = "PMS11 Red Team: running core checks..."
    RunCoreChecks

    Application.StatusBar = "PMS11 Red Team: running Crew / Helideck / Accommodation checks..."
    RunWorkstreamChecks

    Application.StatusBar = "PMS11 Red Team: building grouped root-cause report..."
    BuildGroupedReport
    UpdateHistory

    ThisWorkbook.Worksheets("DASHBOARD").Range("B13").Value = _
        IIf(failures = 0, "PASS", "FAIL") & " | " & failures & _
        " failures | " & runID

    Application.StatusBar = False
    Application.EnableEvents = oldEvents
    Application.ScreenUpdating = oldScreen

    MsgBox "PMS11 Red Team complete: " & checks & " checks, " & failures & _
           " failures." & vbCrLf & vbCrLf & _
           "Detail: REDTEAM_RESULTS" & vbCrLf & _
           "Grouped root causes: REDTEAM_GROUPS" & vbCrLf & _
           "Actions: REDTEAM_ACTIONS", vbInformation
    Exit Sub

Failed:
    On Error Resume Next
    ThisWorkbook.Worksheets("DASHBOARD").Range("B13").Value = _
        "RUN ERROR: " & Err.Description
    Application.StatusBar = False
    Application.EnableEvents = oldEvents
    Application.ScreenUpdating = oldScreen
    MsgBox "Red-team run aborted. Results may be partial. " & Err.Description, vbCritical
End Sub
