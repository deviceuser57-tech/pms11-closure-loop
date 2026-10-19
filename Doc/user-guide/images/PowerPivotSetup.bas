Attribute VB_Name = "PowerPivotSetup"
Option Explicit
Private Sub WriteStatus(ByVal stepName As String, ByVal objectName As String, ByVal state As String, ByVal detail As String)
    Dim s As Worksheet, r As Long
    Set s = ThisWorkbook.Worksheets("POWERPIVOT_STATUS")
    r = s.Cells(s.Rows.Count, 1).End(xlUp).Row + 1
    s.Cells(r, 1).Resize(1, 5).Value = Array(Now, stepName, objectName, state, detail)
End Sub
Private Function MQuote(ByVal value As String) As String
    MQuote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
Private Function QueryExists(ByVal queryName As String) As Boolean
    Dim q As Object
    On Error Resume Next
    Set q = ThisWorkbook.Queries(queryName)
    QueryExists = Not q Is Nothing
    On Error GoTo 0
End Function
Private Sub LoadQuery(ByVal queryName As String, ByVal formula As String)
    Dim cn As WorkbookConnection, name As String
    On Error GoTo Failed
    If QueryExists(queryName) Then
        ThisWorkbook.Queries(queryName).Formula = formula
    Else
        ThisWorkbook.Queries.Add Name:=queryName, Formula:=formula
    End If
    name = "Query - " & queryName
    On Error Resume Next
    Set cn = ThisWorkbook.Connections(name)
    On Error GoTo Failed
    If cn Is Nothing Then
        Set cn = ThisWorkbook.Connections.Add2(name, "PMS11 Power Pivot load", _
            "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=" & queryName & ";Extended Properties=" & Chr(34) & Chr(34), _
            queryName, 6, True, False)
    End If
    cn.OLEDBConnection.BackgroundQuery = False
    cn.Refresh
    WriteStatus "Import", queryName, "REQUESTED", "Refresh returned; model presence verified separately"
    Exit Sub
Failed:
    WriteStatus "Import", queryName, "ERROR", Err.Description
End Sub
Private Function ObjectFormula() As String
    Dim e As Variant, t As ListObject, block As String, combined As String
    For Each e In Array("Rules", "WPS", "Activities", "Deliverables", "Tasks", "Gaps", "Acceptance", "Evidence", "Gates", "Execution", "Functional", "Dependencies", "Sources", "Responsibilities", "Risks", "Changes")
        Set t = ThisWorkbook.Worksheets(CStr(e)).ListObjects("tbl" & CStr(e))
        block = "let t=Excel.CurrentWorkbook(){[Name=" & MQuote(t.Name) & "]}[Content], k=Table.RenameColumns(Table.SelectColumns(t,{" & MQuote(t.ListColumns(1).Name) & "}),{{" & MQuote(t.ListColumns(1).Name) & ",""Object ID""}}), f=Table.SelectRows(k, each [Object ID] <> null and Text.Trim(Text.From([Object ID])) <> """"), x=Table.TransformColumnTypes(f,{{""Object ID"",type text}}), y=Table.AddColumn(x,""Entity"",each " & MQuote(CStr(e)) & ",type text), z=Table.AddColumn(y,""Object Key"",each [Entity]&""|""&[Object ID],type text) in z"
        If Len(combined) > 0 Then combined = combined & ","
        combined = combined & block
    Next e
    ObjectFormula = "let Combined=Table.Combine({" & combined & "}), DistinctKeys=Table.Distinct(Combined,{""Object Key""}) in DistinctKeys"
End Function
Private Function ModelTableFor(ByVal sourceTableName As String) As Object
    Dim t As Object
    For Each t In ThisWorkbook.Model.ModelTables
        If StrComp(t.Name, "PP_" & sourceTableName, vbTextCompare) = 0 Then
            Set ModelTableFor = t: Exit Function
        End If
    Next t
End Function
Private Function SourceTable(ByVal tableName As String) As ListObject
    Dim s As Worksheet, t As ListObject
    For Each s In ThisWorkbook.Worksheets
        For Each t In s.ListObjects
            If t.Name = tableName Then Set SourceTable = t: Exit Function
        Next t
    Next s
End Function
Private Function KeyPreflight(ByVal foreignTable As String, ByVal foreignColumn As String, ByVal primaryTable As String, ByVal primaryColumn As String, ByRef message As String) As Boolean
    Dim f As ListObject, p As ListObject, c As Range, d As Object, value As String, missing As Long
    If primaryTable = "tblObjects" Then
        KeyPreflight = True: message = "Objects primary keys deduplicated by Power Query; orphan lineage reported by RedTeam": Exit Function
    End If
    Set f = SourceTable(foreignTable): Set p = SourceTable(primaryTable)
    If f Is Nothing Or p Is Nothing Then message = "Worksheet table missing": Exit Function
    Set d = CreateObject("Scripting.Dictionary"): d.CompareMode = vbTextCompare
    If p.DataBodyRange Is Nothing Then message = "Empty primary table": Exit Function
    For Each c In p.ListColumns(primaryColumn).DataBodyRange
        If IsError(c.Value) Then message = "Primary key Excel error": Exit Function
        value = CStr(c.Value)
        If Len(Trim$(value)) = 0 Then message = "Blank primary key": Exit Function
        If d.Exists(value) Then message = "Duplicate primary key: " & value: Exit Function
        d.Add value, True
    Next c
    If Not f.DataBodyRange Is Nothing Then
        For Each c In f.ListColumns(foreignColumn).DataBodyRange
            If IsError(c.Value) Then message = "Foreign key Excel error": Exit Function
            value = CStr(c.Value)
            If Len(Trim$(value)) > 0 Then
                If Not d.Exists(value) Then missing = missing + 1
            End If
        Next c
    End If
    If missing > 0 Then message = CStr(missing) & " unmatched foreign keys; correct data then rerun setup": Exit Function
    KeyPreflight = True
End Function
Private Sub AddPlannedRelationship(ByVal ft As String, ByVal fc As String, ByVal pt As String, ByVal pc As String, ByVal active As Boolean)
    Dim f As Object, p As Object, rel As Object, found As Boolean, detail As String, label As String
    On Error GoTo Failed
    label = ft & "[" & fc & "] -> " & pt & "[" & pc & "]"
    If Not KeyPreflight(ft, fc, pt, pc, detail) Then
        WriteStatus "Relationship", label, "SKIPPED", detail: Exit Sub
    End If
    Set f = ModelTableFor(ft): Set p = ModelTableFor(pt)
    If f Is Nothing Or p Is Nothing Then WriteStatus "Relationship", label, "SKIPPED", "Model table missing": Exit Sub
    For Each rel In ThisWorkbook.Model.ModelRelationships
        If rel.ForeignKeyTable.Name = f.Name And rel.PrimaryKeyTable.Name = p.Name Then
            If rel.ForeignKeyColumn.Name = fc And rel.PrimaryKeyColumn.Name = pc Then
                found = True: Exit For
            End If
        End If
    Next rel
    If Not found Then Set rel = ThisWorkbook.Model.ModelRelationships.Add(f.ModelTableColumns(fc), p.ModelTableColumns(pc))
    rel.Active = active
    WriteStatus "Relationship", label, "CREATED / VERIFIED", IIf(active, "Active", "Inactive")
    Exit Sub
Failed:
    WriteStatus "Relationship", label, "ERROR", Err.Description & "; review in Diagram View; alternate links may require manual inactive setup"
End Sub
Public Sub SetupPowerPivot()
    Dim s As Worksheet, t As ListObject, c As ListColumn, formula As String, typing As String
    Dim q As String, mt As Object, plan As ListObject, r As Long, key As String
    Dim oldScreen As Boolean, errorMessage As String
    On Error GoTo Failed
    oldScreen = Application.ScreenUpdating
    Application.ScreenUpdating = False
    Application.CalculateFull
    ThisWorkbook.Worksheets("POWERPIVOT_STATUS").Rows("2:" & ThisWorkbook.Worksheets("POWERPIVOT_STATUS").Rows.Count).ClearContents
    For Each s In ThisWorkbook.Worksheets
        For Each t In s.ListObjects
            typing = ""
            For Each c In t.ListColumns
                key = LCase$(c.Name)
                If InStr(key, "id") > 0 Or InStr(key, "object key") > 0 Or c.Name = "Readiness Gate" Then
                    If Len(typing) > 0 Then typing = typing & ","
                    typing = typing & "{" & MQuote(c.Name) & ",type text}"
                End If
            Next c
            formula = "let Source=Excel.CurrentWorkbook(){[Name=" & MQuote(t.Name) & "]}[Content]"
            If Len(typing) > 0 Then formula = formula & ", Typed=Table.TransformColumnTypes(Source,{" & typing & "}) in Typed" Else formula = formula & " in Source"
            LoadQuery "PP_" & t.Name, formula
        Next t
    Next s
    LoadQuery "PP_tblObjects", ObjectFormula()
    Application.CalculateUntilAsyncQueriesDone
    ThisWorkbook.Model.Initialize
    For Each s In ThisWorkbook.Worksheets
        For Each t In s.ListObjects
            Set mt = ModelTableFor(t.Name)
            If mt Is Nothing Then
                WriteStatus "Model presence", t.Name, "ERROR", "Not found. Use query Load To > Add this data to Data Model then rerun setup."
            Else
                WriteStatus "Model presence", t.Name, "VERIFIED", mt.Name
            End If
        Next t
    Next s
    Set mt = ModelTableFor("tblObjects")
    If mt Is Nothing Then WriteStatus "Model presence", "tblObjects", "ERROR", "Objects query not loaded"
    Set plan = ThisWorkbook.Worksheets("POWERPIVOT_RELATIONS").ListObjects("tblPPRelations")
    For r = 1 To plan.ListRows.Count
        AddPlannedRelationship CStr(plan.DataBodyRange.Cells(r, 1).Value), CStr(plan.DataBodyRange.Cells(r, 2).Value), CStr(plan.DataBodyRange.Cells(r, 3).Value), CStr(plan.DataBodyRange.Cells(r, 4).Value), plan.DataBodyRange.Cells(r, 5).Value = "ACTIVE"
    Next r
    Application.ScreenUpdating = oldScreen
    MsgBox "Setup completed with per-table and relationship results. Review POWERPIVOT_STATUS for errors and skipped links before using the model.", vbInformation
    Exit Sub
Failed:
    errorMessage = Err.Description
    On Error Resume Next
    WriteStatus "Setup", "Workbook", "ABORTED", errorMessage
    Application.ScreenUpdating = oldScreen
    MsgBox "Power Pivot setup aborted: " & errorMessage, vbCritical
End Sub
Public Sub RefreshPowerPivot()
    On Error GoTo Failed
    Application.CalculateFull
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone
    WriteStatus "Refresh", "Workbook", "REQUESTED", "Queries refreshed. Review connection errors and run RedTeam."
    Exit Sub
Failed:
    WriteStatus "Refresh", "Workbook", "ERROR", Err.Description
End Sub
