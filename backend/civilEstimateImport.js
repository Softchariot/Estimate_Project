const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const INSTALL_DIR = "C:\\Program Files (x86)\\Civil Estimate 1";
const EXE_NAME = "Estimate2223A-01F.exe";
const MDB_NAME = "Estimate2223A.mdb";
const DB_PASSWORD = "MHALSAKANTw0059hbm";

const MSG_NOT_UPDATED =
  "You are NOT using Updated Version of Software, Please get it updated first";
const MSG_MDB_MISSING =
  "MS Access Database File missing, Contact Administrator";

function scrub(message) {
  return String(message || "")
    .split(DB_PASSWORD)
    .join("")
    .replace(/Jet OLEDB:Database Password=[^;"]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fail(message, status) {
  const error = new Error(scrub(message));
  error.status = status;
  return error;
}

function cscriptPath() {
  const win = process.env.WINDIR || "C:\\Windows";
  const wow64 = path.join(win, "SysWOW64", "cscript.exe");
  if (fs.existsSync(wow64)) return wow64;
  return path.join(win, "System32", "cscript.exe");
}

function assertInstall() {
  const exePath = path.join(INSTALL_DIR, EXE_NAME);
  const mdbPath = path.join(INSTALL_DIR, MDB_NAME);
  if (!fs.existsSync(exePath)) throw fail(MSG_NOT_UPDATED, 409);
  if (!fs.existsSync(mdbPath)) throw fail(MSG_MDB_MISSING, 404);
  return mdbPath;
}

const READER_VBS = `
Option Explicit
Dim sh, fso, dbPath, pwd, outPath, action, workCode, conn, rs, out
Dim items(), n, i, sql, desc, code, msg, userName, userAddress, workDescription
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dbPath = sh.ExpandEnvironmentStrings("%CE_DB_PATH%")
pwd = sh.ExpandEnvironmentStrings("%CE_DB_PASSWORD%")
outPath = sh.ExpandEnvironmentStrings("%CE_OUT_PATH%")
action = sh.ExpandEnvironmentStrings("%CE_ACTION%")
workCode = sh.ExpandEnvironmentStrings("%CE_WORK_CODE%")
Set out = fso.CreateTextFile(outPath, True, True)

Function JsonEscape(ByVal s)
  Dim p, ch, charCode, built
  built = ""
  If IsNull(s) Then
    JsonEscape = ""
    Exit Function
  End If
  s = CStr(s)
  For p = 1 To Len(s)
    ch = Mid(s, p, 1)
    charCode = AscW(ch)
    If charCode < 0 Then charCode = charCode + 65536
    If ch = "\\" Then
      built = built & "\\\\"
    ElseIf ch = """" Then
      built = built & "\\"""
    ElseIf charCode = 10 Then
      built = built & "\\n"
    ElseIf charCode = 13 Then
      built = built & "\\r"
    ElseIf charCode = 9 Then
      built = built & "\\t"
    ElseIf charCode < 32 Then
      built = built & "\\u" & Right("0000" & Hex(charCode), 4)
    Else
      built = built & ch
    End If
  Next
  JsonEscape = built
End Function

Sub WriteFail(message)
  out.Write "{""ok"":false,""message"":""" & JsonEscape(message) & """}"
  out.Close
End Sub

On Error Resume Next
Set conn = CreateObject("ADODB.Connection")
conn.Mode = 1
conn.Open "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" & dbPath & ";Jet OLEDB:Database Password=" & pwd & ";"
If Err.Number <> 0 Then
  msg = Replace(Err.Description, pwd, "")
  WriteFail msg
  WScript.Quit 1
End If
Err.Clear

If action = "select" Then
  Set rs = CreateObject("ADODB.Recordset")
  rs.Open "SELECT WORKDESCRIPTION FROM AEMWORK WHERE WORKCODE = " & CLng(workCode), conn, 0, 1
  If Err.Number <> 0 Then
    msg = Replace(Err.Description, pwd, "")
    WriteFail msg
    conn.Close
    WScript.Quit 1
  End If
  If rs.EOF Then
    rs.Close
    conn.Close
    WriteFail "Selected work was not found in AEMWORK."
    WScript.Quit 1
  End If
  If IsNull(rs.Fields("WORKDESCRIPTION").Value) Then
    workDescription = ""
  Else
    workDescription = Trim(CStr(rs.Fields("WORKDESCRIPTION").Value))
  End If
  rs.Close
  Err.Clear

  userName = ""
  userAddress = ""
  Set rs = CreateObject("ADODB.Recordset")
  rs.Open "SELECT USERNAME, ADDRESS FROM USERS", conn, 0, 1
  If Err.Number = 0 Then
    Do While Not rs.EOF
      If Not IsNull(rs.Fields("USERNAME").Value) Then
        If Len(Trim(CStr(rs.Fields("USERNAME").Value))) > 0 Then
          userName = Trim(CStr(rs.Fields("USERNAME").Value))
          If Not IsNull(rs.Fields("ADDRESS").Value) Then
            userAddress = Trim(CStr(rs.Fields("ADDRESS").Value))
          End If
          Exit Do
        End If
      End If
      rs.MoveNext
    Loop
    rs.Close
  Else
    Err.Clear
  End If

  Set rs = CreateObject("ADODB.Recordset")
  rs.Open "SELECT SUBWORKCODE, SUBWORKDESCRIPTION FROM AEMSUBWORK WHERE WORKCODE = " & CLng(workCode) & " ORDER BY SUBWORKCODE", conn, 0, 1
  If Err.Number <> 0 Then
    msg = Replace(Err.Description, pwd, "")
    WriteFail msg
    conn.Close
    WScript.Quit 1
  End If
  n = 0
  ReDim items(99)
  Do While Not rs.EOF
    If IsNull(rs.Fields("SUBWORKDESCRIPTION").Value) Then
      desc = ""
    Else
      desc = Trim(CStr(rs.Fields("SUBWORKDESCRIPTION").Value))
    End If
    If Len(desc) > 0 Then
      If IsNull(rs.Fields("SUBWORKCODE").Value) Then
        code = "null"
      Else
        code = CStr(CLng(rs.Fields("SUBWORKCODE").Value))
      End If
      If n > UBound(items) Then ReDim Preserve items(UBound(items) + 100)
      items(n) = "{""SubWorkCode"":" & code & ",""SubWorkDescription"":""" & JsonEscape(desc) & """}"
      n = n + 1
    End If
    rs.MoveNext
  Loop
  rs.Close
  conn.Close
  out.Write "{""ok"":true,""userName"":""" & JsonEscape(userName) & """,""userAddress"":""" & JsonEscape(userAddress) & """,""workDescription"":""" & JsonEscape(workDescription) & """,""subWorks"":["
  For i = 0 To n - 1
    If i > 0 Then out.Write ","
    out.Write items(i)
  Next
  out.Write "]}"
  out.Close
  WScript.Quit 0
End If

sql = "SELECT WORKCODE, WORKDESCRIPTION FROM AEMWORK ORDER BY WORKDESCRIPTION"
Set rs = CreateObject("ADODB.Recordset")
rs.Open sql, conn, 0, 1
If Err.Number <> 0 Then
  msg = Replace(Err.Description, pwd, "")
  If InStr(1, msg, "AEMWORK", 1) > 0 Then msg = "Table AEMWORK was not found in the MS Access database."
  WriteFail msg
  conn.Close
  WScript.Quit 1
End If
n = 0
ReDim items(499)
Do While Not rs.EOF
  If IsNull(rs.Fields("WORKDESCRIPTION").Value) Then
    desc = ""
  Else
    desc = Trim(CStr(rs.Fields("WORKDESCRIPTION").Value))
  End If
  If Len(desc) > 0 Then
    If IsNull(rs.Fields("WORKCODE").Value) Then
      code = "null"
    Else
      code = CStr(CLng(rs.Fields("WORKCODE").Value))
    End If
    If n > UBound(items) Then ReDim Preserve items(UBound(items) + 500)
    items(n) = "{""WorkCode"":" & code & ",""WorkDescription"":""" & JsonEscape(desc) & """}"
    n = n + 1
  End If
  rs.MoveNext
Loop
rs.Close
conn.Close
out.Write "{""ok"":true,""works"":["
For i = 0 To n - 1
  If i > 0 Then out.Write ","
  out.Write items(i)
Next
out.Write "]}"
out.Close
WScript.Quit 0
`.trim();

function runReader(extraEnv) {
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const vbsPath = path.join(os.tmpdir(), `ce-aem-${id}.vbs`);
  const outPath = path.join(os.tmpdir(), `ce-aem-${id}.json`);
  fs.writeFileSync(vbsPath, READER_VBS, "utf8");

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rmSync(vbsPath, { force: true });
      fs.rmSync(outPath, { force: true });
      if (error) reject(error);
      else resolve(payload);
    };
    const child = spawn(cscriptPath(), ["//Nologo", vbsPath], {
      windowsHide: true,
      env: {
        ...process.env,
        CE_DB_PATH: extraEnv.mdbPath,
        CE_DB_PASSWORD: DB_PASSWORD,
        CE_OUT_PATH: outPath,
        CE_ACTION: extraEnv.action || "works",
        CE_WORK_CODE: extraEnv.workCode || "0",
      },
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      finish(fail("Opening the MS Access database timed out.", 500));
    }, 60000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish(fail(error.message || "Could not start the Access reader.", 500));
    });
    child.on("close", () => {
      try {
        if (!fs.existsSync(outPath)) {
          finish(
            fail(scrub(stderr) || "Could not open the MS Access database.", 500),
          );
          return;
        }
        const raw = fs
          .readFileSync(outPath, "utf16le")
          .replace(/^\uFEFF/, "")
          .trim();
        const parsed = JSON.parse(raw);
        if (!parsed.ok) {
          finish(
            fail(
              scrub(parsed.message) || "Could not open the MS Access database.",
              500,
            ),
          );
          return;
        }
        finish(null, parsed);
      } catch (error) {
        finish(fail(error.message || "Could not read the MS Access database.", 500));
      }
    });
  });
}

async function listAemWorkDescriptions() {
  const mdbPath = assertInstall();
  const parsed = await runReader({ mdbPath, action: "works" });
  const works = Array.isArray(parsed.works) ? parsed.works : [];
  works.sort((a, b) =>
    String(a.WorkDescription || "").localeCompare(
      String(b.WorkDescription || ""),
      undefined,
      { sensitivity: "base" },
    ),
  );
  return works;
}

function importMessage(userName, userAddress, workDescription, subWorks) {
  const userLabel = [userName, userAddress].filter(Boolean).join(" ");
  const listed = (subWorks || [])
    .filter((row) => String(row.SubWorkDescription || "").trim())
    .map((row, index) => `${index + 1}. “${row.SubWorkDescription}”`)
    .join("\n");
  return (
    `Dear User ${userLabel}, You have selected the Work :\n“${workDescription}” and\n` +
    `Sub Works\n${listed}\nfor importing to Online Software`
  );
}

async function readWorkForImport(workCode) {
  const code = Number(workCode);
  if (!Number.isInteger(code) || code <= 0) {
    throw fail("Please select a work.", 400);
  }
  const mdbPath = assertInstall();
  const parsed = await runReader({
    mdbPath,
    action: "select",
    workCode: String(code),
  });
  const subWorks = Array.isArray(parsed.subWorks) ? parsed.subWorks : [];
  return {
    userName: parsed.userName || "",
    userAddress: parsed.userAddress || "",
    workCode: code,
    workDescription: parsed.workDescription || "",
    subWorks,
    message: importMessage(
      parsed.userName || "",
      parsed.userAddress || "",
      parsed.workDescription || "",
      subWorks,
    ),
  };
}

function registerCivilEstimateImportRoutes(app) {
  app.get("/api/civil-estimate/aemwork", async (_req, res) => {
    try {
      const data = await listAemWorkDescriptions();
      res.json({ data });
    } catch (err) {
      console.error("Civil Estimate import failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message:
          scrub(err.message) || "Could not open the Civil Estimate database.",
      });
    }
  });

  app.get("/api/civil-estimate/aemwork/:workCode/selection", async (req, res) => {
    try {
      const data = await readWorkForImport(req.params.workCode);
      res.json(data);
    } catch (err) {
      console.error("Civil Estimate work selection failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message:
          scrub(err.message) || "Could not read the selected work.",
      });
    }
  });
}

module.exports = {
  MSG_MDB_MISSING,
  MSG_NOT_UPDATED,
  listAemWorkDescriptions,
  readWorkForImport,
  registerCivilEstimateImportRoutes,
};
