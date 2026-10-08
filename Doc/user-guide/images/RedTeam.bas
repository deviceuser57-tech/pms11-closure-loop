Attribute VB_Name = "RedTeam"
Option Explicit
Private runID As String, checks As Long, failures As Long, resultRow As Long
Private Sub LogCheck(ByVal tid As String, ByVal category As String, ByVal entity As String, ByVal recordID As String, ByVal expected As String, ByVal actual As String, ByVal ok As Boolean)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("REDTEAM_RESULTS")
    checks = checks + 1
    If Not ok Then failures = failures + 1
    ws.Cells(resultRow, 1).Resize(1, 9).Value = Array(runID, tid, category, entity, recordID, expected, actual, IIf(ok, "PASS", "FAIL"), Now)
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
    ExistsID = Application.CountIf(Tbl(entity).ListColumns(1).DataBodyRange, id) > 0
End Function
Public Sub RunRedTeam()
    Dim entities As Variant, e As Variant, t As ListObject, r As Long, c As Range
    Dim id As String, n As Long, ws As Worksheet, hist As Worksheet
    Dim parent As String, child As String, pid As String, cid As String
    Dim status As String, field As Variant, st As Variant, fin As Variant
    Dim progress As Variant, weight As Variant, location As String
    Dim oldEvents As Boolean, oldScreen As Boolean
    On Error GoTo Failed
    oldEvents = Application.EnableEvents: oldScreen = Application.ScreenUpdating
    Application.EnableEvents = False: Application.ScreenUpdating = False
    Application.CalculateFull
    runID = Format$(Now, "yyyymmdd-hhnnss")
    checks = 0: failures = 0: resultRow = 2
    Set ws = ThisWorkbook.Worksheets("REDTEAM_RESULTS")
    ws.Rows("2:" & ws.Rows.Count).ClearContents
    n = Tbl("WPS").ListRows.Count
    LogCheck "SCOPE-WPS", "Scope", "WPS", "", CStr(ThisWorkbook.Worksheets("CONFIG").Range("B2").Value), CStr(n), n = ThisWorkbook.Worksheets("CONFIG").Range("B2").Value
    n = Tbl("Rules").ListRows.Count
    LogCheck "SCOPE-RULES", "Scope", "Rules", "", CStr(ThisWorkbook.Worksheets("CONFIG").Range("B3").Value), CStr(n), n = ThisWorkbook.Worksheets("CONFIG").Range("B3").Value
    For r = 1 To ThisWorkbook.Worksheets("CONFIG").Range("B2").Value
        id = "WPS-" & Format$(r, "00")
        LogCheck "WPS-SEQUENCE", "Scope", "WPS", id, "Present", IIf(ExistsID("WPS", id), "Present", "Missing"), ExistsID("WPS", id)
    Next r
    entities = Array("Rules", "WPS", "Activities", "Deliverables", "Tasks", "Gaps", "Acceptance", "Evidence", "Gates", "Execution", "Functional", "Dependencies", "Sources", "Responsibilities", "Risks", "Changes")
    For Each e In entities
        Set t = Tbl(CStr(e))
        For r = 1 To t.ListRows.Count
            id = CStr(t.DataBodyRange.Cells(r, 1).Value)
            If Application.CountA(t.ListRows(r).Range) > 0 Then
                n = Application.CountIf(t.ListColumns(1).DataBodyRange, id)
                LogCheck "PK", "Keys", CStr(e), id, "Nonblank unique key", "Occurrences=" & n, Len(Trim$(id)) > 0 And n = 1
            End If
        Next r
    Next e
    For Each e In Array("Rules", "Activities", "Deliverables", "Tasks", "Acceptance")
        Set t = Tbl(CStr(e))
        For Each field In Array("WPS ID", "Activity ID", "Rule ID", "Deliverable ID", "Acceptance Criteria ID", "Evidence ID")
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
                If CStr(c.Value) = CStr(field) And c.Column <> t.Range.Column Then n = c.Column - t.Range.Column + 1
            Next c
            If n > 0 Then
                For r = 1 To t.ListRows.Count
                    cid = CStr(t.DataBodyRange.Cells(r, n).Value)
                    id = CStr(t.DataBodyRange.Cells(r, 1).Value)
                    If Len(Trim$(cid)) > 0 Then LogCheck "DIRECT-FK", "Relationships", CStr(e), id, CStr(field) & " exists", cid, ExistsID(child, cid)
                Next r
            End If
        Next field
    Next e
    Set t = Tbl("Relationships")
    For r = 1 To t.ListRows.Count
        parent = CStr(ValAt(t, r, "Parent Entity")): child = CStr(ValAt(t, r, "Child Entity"))
        pid = CStr(ValAt(t, r, "Parent ID")): cid = CStr(ValAt(t, r, "Child ID"))
        LogCheck "FK-PARENT", "Relationships", parent, pid, "Parent exists", pid, ExistsID(parent, pid)
        LogCheck "FK-CHILD", "Relationships", child, cid, "Child exists", cid, ExistsID(child, cid)
    Next r
    Set t = Tbl("Execution")
    For r = 1 To t.ListRows.Count
        id = CStr(ValAt(t, r, "Execution ID"))
        cid = CStr(ValAt(t, r, "WPS ID"))
        LogCheck "EXEC-WPS", "Relationships", "Execution", id, "Valid WPS", cid, ExistsID("WPS", cid)
        st = ValAt(t, r, "Planned Start"): fin = ValAt(t, r, "Planned Finish")
        If Len(CStr(st)) > 0 Or Len(CStr(fin)) > 0 Then
            If IsDate(st) And IsDate(fin) Then
                LogCheck "DATE-ORDER", "Schedule", "Execution", id, "Finish >= Start", CStr(st) & " / " & CStr(fin), CDate(fin) >= CDate(st)
            Else
                LogCheck "DATE-TYPE", "Schedule", "Execution", id, "Both planned dates valid", CStr(st) & " / " & CStr(fin), False
            End If
        End If
        progress = ValAt(t, r, "Completion %"): weight = ValAt(t, r, "Weight %")
        LogCheck "PROGRESS", "Execution", "Execution", id, "Numeric 0..1", CStr(progress), IsNumeric(progress) And Val(CStr(progress)) >= 0 And Val(CStr(progress)) <= 1
        LogCheck "WEIGHT", "Execution", "Execution", id, "Numeric 0..1", CStr(weight), IsNumeric(weight) And Val(CStr(weight)) >= 0 And Val(CStr(weight)) <= 1
        status = LCase$(CStr(ValAt(t, r, "Status")))
        If status = "completed" Then LogCheck "COMPLETED", "Execution", "Execution", id, "100% with actual finish", CStr(progress), Val(CStr(progress)) = 1 And IsDate(ValAt(t, r, "Actual Finish"))
        LogCheck "OWNER", "Ownership", "Execution", id, "Department assigned", CStr(ValAt(t, r, "Responsible Department")), Len(Trim$(CStr(ValAt(t, r, "Responsible Department")))) > 0
        For Each field In Array("Estimated Cost", "Approved Budget", "Committed Cost", "Actual Cost", "Remaining Estimate")
            st = ValAt(t, r, CStr(field))
            If Len(CStr(st)) > 0 Then LogCheck "COST", "Finance", "Execution", id, CStr(field) & " numeric >=0", CStr(st), IsNumeric(st) And Val(CStr(st)) >= 0
        Next field
    Next r
    LogCheck "TOTAL-WEIGHT", "Execution", "Execution", "", "Positive total weights", CStr(Application.Sum(t.ListColumns("Weight %").DataBodyRange)), Application.Sum(t.ListColumns("Weight %").DataBodyRange) > 0
    Set t = Tbl("Gaps")
    For r = 1 To t.ListRows.Count
        If LCase$(CStr(ValAt(t, r, "Status"))) = "closed" Then
            id = CStr(ValAt(t, r, "Gap ID"))
            LogCheck "GAP-CLOSURE", "Closure", "Gaps", id, "Evidence, authority, closure date", CStr(ValAt(t, r, "Closure Evidence")), Len(Trim$(CStr(ValAt(t, r, "Closure Evidence")))) > 0 And Len(Trim$(CStr(ValAt(t, r, "Closure Authority")))) > 0 And IsDate(ValAt(t, r, "Closure Date"))
        End If
    Next r
    Set t = Tbl("Evidence")
    For r = 1 To t.ListRows.Count
        status = LCase$(CStr(ValAt(t, r, "Status")))
        If status = "verified" Or status = "approved" Then
            id = CStr(ValAt(t, r, "Evidence ID"))
            location = CStr(ValAt(t, r, "File Location"))
            LogCheck "EVIDENCE-CLOSURE", "Evidence", "Evidence", id, "Location, verifier, verification date", location, Len(Trim$(location)) > 0 And Len(Trim$(CStr(ValAt(t, r, "Verified By")))) > 0 And IsDate(ValAt(t, r, "Verification Date"))
            st = ValAt(t, r, "Expiry Date")
            If IsDate(st) Then LogCheck "EVIDENCE-EXPIRY", "Evidence", "Evidence", id, "Not expired", CStr(st), CDate(st) >= Date
        End If
    Next r
    Set t = Tbl("Dependencies")
    For r = 1 To t.ListRows.Count
        pid = CStr(ValAt(t, r, "Predecessor ID")): cid = CStr(ValAt(t, r, "Successor ID"))
        id = CStr(ValAt(t, r, "Link ID"))
        LogCheck "DEP-PARENT", "Dependencies", "Dependencies", id, "Execution or gate exists", pid, ExistsID("Execution", pid) Or ExistsID("Gates", pid)
        LogCheck "DEP-CHILD", "Dependencies", "Dependencies", id, "Execution or gate exists", cid, ExistsID("Execution", cid) Or ExistsID("Gates", cid)
        LogCheck "DEP-SELF", "Dependencies", "Dependencies", id, "No self link", pid & " -> " & cid, pid <> cid
    Next r
    For Each e In entities
        Set t = Tbl(CStr(e))
        For Each c In t.DataBodyRange.Cells
            If IsError(c.Value) Then LogCheck "CELL-ERROR", "Calculation", CStr(e), c.Address(False, False), "No Excel error", c.Text, False
        Next c
    Next e
    Set hist = ThisWorkbook.Worksheets("REDTEAM_HISTORY")
    If hist.Range("A2").Value = "NOT RUN" Then hist.Rows(2).ClearContents
    n = hist.Cells(hist.Rows.Count, 1).End(xlUp).Row + 1
    hist.Cells(n, 1).Resize(1, 5).Value = Array(runID, Now, checks, failures, IIf(failures = 0, "PASS", "FAIL"))
    ThisWorkbook.Worksheets("DASHBOARD").Range("B13").Value = IIf(failures = 0, "PASS", "FAIL") & " | " & failures & " failures | " & runID
    Application.EnableEvents = oldEvents: Application.ScreenUpdating = oldScreen
    MsgBox "Red team complete: " & checks & " checks, " & failures & " failures. See REDTEAM_RESULTS.", vbInformation
    Exit Sub
Failed:
    On Error Resume Next
    ThisWorkbook.Worksheets("DASHBOARD").Range("B13").Value = "RUN ERROR: " & Err.Description
    Application.EnableEvents = oldEvents: Application.ScreenUpdating = oldScreen
    MsgBox "Red-team run aborted. Results may be partial. " & Err.Description, vbCritical
End Sub
