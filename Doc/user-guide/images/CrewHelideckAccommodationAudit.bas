Attribute VB_Name = "CrewHelideckAccommodationAudit"
Option Explicit
Private output As Worksheet
Private nextRow As Long, checks As Long, failures As Long
Private runID As String
Private Sub Result(ByVal testName As String, ByVal entity As String, ByVal id As String, ByVal expected As String, ByVal actual As String, ByVal ok As Boolean)
    checks = checks + 1
    If Not ok Then failures = failures + 1
    output.Cells(nextRow, 1).Resize(1, 8).Value = Array(runID, testName, entity, id, expected, actual, IIf(ok, "PASS", "FAIL"), Now)
    nextRow = nextRow + 1
End Sub
Private Function GetTable(ByVal sheetName As String) As ListObject
    Set GetTable = ThisWorkbook.Worksheets(sheetName).ListObjects(1)
End Function
Private Function Item(ByVal table As ListObject, ByVal row As Long, ByVal field As String) As Variant
    Item = table.ListColumns(field).DataBodyRange.Cells(row, 1).Value
End Function
Public Sub AuditCrewHelideckAccommodation()
    Dim e As Variant, table As ListObject, r As Long, c As Range
    Dim id As String, status As String, n As Long, oldScreen As Boolean
    Dim value As Variant, message As String
    On Error GoTo Failed
    oldScreen = Application.ScreenUpdating
    Application.ScreenUpdating = False
    runID = Format$(Now, "yyyymmdd-hhnnss")
    checks = 0: failures = 0: nextRow = 2
    On Error Resume Next
    Set output = ThisWorkbook.Worksheets("WORKSTREAM_REDTEAM")
    On Error GoTo Failed
    If output Is Nothing Then
        Set output = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        output.Name = "WORKSTREAM_REDTEAM"
    End If
    output.Cells.ClearContents
    output.Range("A1:H1").Value = Array("Run ID", "Test", "Entity", "Record ID", "Expected", "Actual", "Result", "Timestamp")
    'Calculate only the new workstream sheets in dependency order, not the whole 59k-formula workbook.
    For Each e In Array("Crew_Certificates", "Crew_Register", "Manning_Plan", "Accommodation_Checks", "Accommodation_Capacity", "Helideck_Profile", "Helideck_Checks", "CREW_HELI_ACCOM_DASH")
        ThisWorkbook.Worksheets(CStr(e)).Calculate
    Next e
    Set table = GetTable("WPS")
    Result "WPS-SCOPE", "WPS", "", "24 WPS preserved", CStr(table.ListRows.Count), table.ListRows.Count = 24
    For Each e In Array("WPS-23", "WPS-19", "WPS-15")
        n = Application.CountIf(table.ListColumns("WPS ID").DataBodyRange, CStr(e))
        Result "DEDICATED-WPS", "WPS", CStr(e), "Unique WPS exists", CStr(n), n = 1
    Next e
    For Each e In Array("Crew_Roles", "Crew_Requirements", "Crew_Register", "Crew_Certificates", "Manning_Plan", "Accommodation_Checks", "Accommodation_Capacity", "Helideck_Profile", "Helideck_Checks")
        Set table = GetTable(CStr(e))
        For r = 1 To table.ListRows.Count
            id = CStr(table.DataBodyRange.Cells(r, 1).Value)
            If Len(id) > 0 Then
                n = Application.CountIf(table.ListColumns(1).DataBodyRange, id)
                Result "KEY-UNIQUE", CStr(e), id, "Unique populated key", CStr(n), n = 1
            ElseIf Application.CountA(table.ListRows(r).Range) > 0 Then
                'Template calculated cells do not imply a real record.
                n = 0
                For Each c In table.ListRows(r).Range.Cells
                    If Not c.HasFormula Then
                        If Len(CStr(c.Value)) > 0 Then n = n + 1
                    End If
                Next c
                If n > 0 Then Result "KEY-MISSING", CStr(e), "row " & CStr(r), "Identifier for populated record", "Blank key", False
            End If
        Next r
        For Each c In table.DataBodyRange.Cells
            If IsError(c.Value) Then Result "CALCULATION", CStr(e), c.Address(False, False), "No Excel error", c.Text, False
        Next c
    Next e
    Set table = GetTable("Crew_Requirements")
    For r = 1 To table.ListRows.Count
        id = CStr(Item(table, r, "Requirement ID"))
        If CStr(Item(table, r, "Applicability")) = "Applicable" Then
            n = Application.CountIfs(table.ListColumns("Role ID").DataBodyRange, Item(table, r, "Role ID"), table.ListColumns("Certificate Type").DataBodyRange, Item(table, r, "Certificate Type"), table.ListColumns("Applicability").DataBodyRange, "Applicable")
            Result "ROLE-CREDENTIAL-UNIQUE", "Crew_Requirements", id, "One active role / credential-type row", CStr(n), n = 1
        End If
    Next r
    Set table = GetTable("Crew_Register")
    n = Application.CountA(table.ListColumns("Crew ID").DataBodyRange)
    Result "ACTUAL-ROSTER", "Crew_Register", "", "Actual crew records supplied", CStr(n), n > 0
    For r = 1 To table.ListRows.Count
        id = CStr(Item(table, r, "Crew ID"))
        If Len(id) > 0 Then
            status = CStr(Item(table, r, "Duty Eligibility"))
            Result "CREW-ELIGIBILITY", "Crew_Register", id, "Verified credentials, role and deployment", status, status = "ELIGIBLE"
        End If
    Next r
    Set table = GetTable("Crew_Certificates")
    For r = 1 To table.ListRows.Count
        id = CStr(Item(table, r, "Certificate ID"))
        If Len(id) > 0 Then
            status = CStr(Item(table, r, "Credential Result"))
            Result "CERTIFICATE", "Crew_Certificates", id, "VALID credential", status, status = "VALID"
        End If
    Next r
    Set table = GetTable("Manning_Plan")
    n = Application.CountIf(table.ListColumns("Applicability").DataBodyRange, "Applicable")
    Result "APPROVED-DEMAND", "Manning_Plan", "", "Applicable staffing lines defined", CStr(n), n > 0
    For r = 1 To table.ListRows.Count
        id = CStr(Item(table, r, "Manning Line ID"))
        status = CStr(Item(table, r, "Coverage Result"))
        Result "MINIMUM-COVERAGE", "Manning_Plan", id, "Approved demand covered or documented N/A", status, status = "COVERED - REVIEW" Or status = "N/A - REVIEW"
    Next r
    For Each e In Array("Accommodation_Checks", "Helideck_Checks")
        Set table = GetTable(CStr(e))
        For r = 1 To table.ListRows.Count
            id = CStr(table.DataBodyRange.Cells(r, 1).Value)
            status = CStr(Item(table, r, "Control Result"))
            If status = "N/A - REVIEW" Then
                Result "DOCUMENTED-NA", CStr(e), id, "Criteria, evidence, reviewer and authority disposition", status, Len(CStr(Item(table, r, "Evidence ID"))) > 0 And CStr(Item(table, r, "Authority Acceptance")) = "Accepted"
            Else
                Result "VERIFICATION", CStr(e), id, "VERIFIED", status, status = "VERIFIED"
            End If
        Next r
    Next e
    Set table = GetTable("Accommodation_Capacity")
    For r = 1 To table.ListRows.Count
        id = CStr(Item(table, r, "Capacity Plan ID"))
        status = CStr(Item(table, r, "Capacity Result"))
        Result "POB-CAPACITY", "Accommodation_Capacity", id, "Approved POB and verified capacity cover planned occupancy", status, status = "WITHIN LIMIT - REVIEW"
    Next r
    Set table = GetTable("Helideck_Profile")
    For r = 1 To table.ListRows.Count
        status = CStr(Item(table, r, "Profile Result"))
        Result "HELIDECK-BASIS", "Helideck_Profile", CStr(Item(table, r, "Helideck Profile ID")), "Basis recorded or documented N/A", status, status = "BASIS RECORDED - REVIEW" Or status = "N/A - REVIEW"
    Next r
    output.Rows(1).Font.Bold = True
    output.Columns("A:H").AutoFit
    Application.ScreenUpdating = oldScreen
    MsgBox "Workstream audit complete: " & checks & " checks; " & failures & " unresolved failures. No result replaces authority approval. See WORKSTREAM_REDTEAM.", vbInformation
    Exit Sub
Failed:
    message = Err.Description
    Application.ScreenUpdating = oldScreen
    MsgBox "Audit aborted; results may be partial: " & message, vbCritical
End Sub
