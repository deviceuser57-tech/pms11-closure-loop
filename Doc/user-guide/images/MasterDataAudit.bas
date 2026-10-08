Attribute VB_Name = "MasterDataAudit"
Option Explicit
Public Sub AuditMasterData()
    Dim report As Worksheet, map As Worksheet, source As Worksheet, master As Range
    Dim i As Long, r As Long, last As Long, col As Long, n As Long, failures As Long, checks As Long
    Dim listName As String, entity As String, value As String, runID As String, message As String
    Dim cell As Range, oldScreen As Boolean, recordID As String
    On Error GoTo Failed
    oldScreen = Application.ScreenUpdating
    Application.ScreenUpdating = False
    Application.CalculateFull
    runID = Format$(Now, "yyyymmdd-hhnnss")
    On Error Resume Next
    Set report = ThisWorkbook.Worksheets("MASTER_DATA_AUDIT")
    On Error GoTo Failed
    If report Is Nothing Then
        Set report = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        report.Name = "MASTER_DATA_AUDIT"
    End If
    report.Cells.ClearContents
    report.Range("A1:H1").Value = Array("Run ID", "Worksheet", "Record ID", "Field", "Cell", "Value", "Result", "Issue")
    n = 2
    Set map = ThisWorkbook.Worksheets("DROPDOWN_MAP")
    For i = 2 To map.Cells(map.Rows.Count, 1).End(xlUp).Row
        Set source = ThisWorkbook.Worksheets(CStr(map.Cells(i, 1).Value))
        col = source.Range(CStr(map.Cells(i, 3).Value) & "1").Column
        last = source.Cells(source.Rows.Count, 1).End(xlUp).Row
        For r = 2 To last
            Set cell = source.Cells(r, col)
            If IsError(cell.Value) Then
                value = cell.Text: message = "Excel error in controlled input"
            Else
                value = CStr(cell.Value): message = ""
            End If
            If Len(value) > 0 Then
                checks = checks + 1
                listName = CStr(map.Cells(i, 4).Value)
                If map.Cells(i, 5).Value = "Dependent ID" Then
                    If map.Cells(i, 2).Value = "Parent ID" Then entity = CStr(source.Cells(r, 1).Value) Else entity = CStr(source.Cells(r, 3).Value)
                    listName = "MD_" & entity
                End If
                Set master = Nothing
                On Error Resume Next
                Set master = ThisWorkbook.Names(listName).RefersToRange
                On Error GoTo Failed
                If master Is Nothing Then
                    message = "Master range missing: " & listName
                ElseIf Len(message) = 0 Then
                    If Application.CountIf(master, "=" & Replace(Replace(Replace(value, "~", "~~"), "*", "~*"), "?", "~?")) = 0 Then message = "Value is not in " & listName
                End If
                If Len(message) > 0 Then
                    failures = failures + 1
                    recordID = CStr(source.Cells(r, 1).Value)
                    report.Cells(n, 1).Resize(1, 8).Value = Array(runID, source.Name, recordID, map.Cells(i, 2).Value, cell.Address(False, False), value, "FAIL", message)
                    n = n + 1
                End If
            End If
        Next r
    Next i
    If n = 2 Then report.Cells(n, 1).Resize(1, 8).Value = Array(runID, "ALL", "", "", "", "", "PASS", "All populated mapped fields matched master lists")
    report.Range("J1").Value = "Run ID": report.Range("K1").Value = runID
    report.Range("J2").Value = "Values checked": report.Range("K2").Value = checks
    report.Range("J3").Value = "Failures": report.Range("K3").Value = failures
    report.Rows(1).Font.Bold = True
    report.Columns("A:K").AutoFit
    Application.ScreenUpdating = oldScreen
    MsgBox "Master-data audit: " & checks & " populated inputs checked; " & failures & " failures. See MASTER_DATA_AUDIT.", vbInformation
    Exit Sub
Failed:
    message = Err.Description
    Application.ScreenUpdating = oldScreen
    MsgBox "Audit aborted; results may be partial: " & message, vbCritical
End Sub
