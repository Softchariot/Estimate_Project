const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MDB_NAME = "Estimate2223A.mdb";
const MDB_FOLDER = "C:\\Program Files (x86)\\Civil Estimate 1";
const DB_PASSWORD = "MHALSAKANTw0059hbm";

const MSG_NOT_UPDATED =
  "You are NOT using Updated Version of Software, Please get it updated first";
const MSG_MDB_MISSING =
  "MS Access Database File missing, Contact Administrator";
const MSG_SELECT_MDB = `Select ${MDB_NAME} from ${MDB_FOLDER}`;

const uploads = new Map();

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

function assertWindows() {
  if (process.platform !== "win32") {
    throw fail(
      "Import can be used only on the computer where Civil Estimate is installed.",
      409,
    );
  }
}

function sweepUploads() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, row] of uploads) {
    if (row.at < cutoff) {
      fs.rmSync(row.path, { force: true });
      uploads.delete(id);
    }
  }
}

function mdbPathFor(uploadId) {
  assertWindows();
  const row = uploads.get(String(uploadId || ""));
  if (!row || !fs.existsSync(row.path)) throw fail(MSG_SELECT_MDB, 400);
  return row.path;
}

function saveUploadedDatabase(buffer, filename) {
  assertWindows();
  const name = path.basename(String(filename || ""));
  if (name.toLowerCase() !== MDB_NAME.toLowerCase()) throw fail(MSG_SELECT_MDB, 400);
  if (!buffer || !buffer.length) throw fail(MSG_MDB_MISSING, 404);
  sweepUploads();
  const id = crypto.randomBytes(16).toString("hex");
  const filePath = path.join(os.tmpdir(), `ce-${id}.mdb`);
  fs.writeFileSync(filePath, buffer);
  uploads.set(id, { path: filePath, at: Date.now() });
  return id;
}

function readMultipartDatabase(req) {
  const type = String(req.headers["content-type"] || "");
  const match = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return Promise.reject(fail(MSG_SELECT_MDB, 400));
  const boundary = (match[1] || match[2] || "").trim();
  const maxBytes = 256 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(fail("The selected database is too large.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", (error) => {
      if (!failed) reject(fail(error.message || MSG_SELECT_MDB, 400));
    });
    req.on("end", () => {
      if (failed) return;
      try {
        const body = Buffer.concat(chunks);
        const headerEnd = body.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          reject(fail(MSG_SELECT_MDB, 400));
          return;
        }
        const header = body.slice(0, headerEnd).toString("latin1");
        const nameMatch = header.match(/filename="([^"]*)"/i);
        const filename = nameMatch ? nameMatch[1] : "";
        const start = headerEnd + 4;
        let end = body.indexOf(`\r\n--${boundary}`, start);
        if (end < 0) end = body.length;
        resolve({ filename, buffer: body.slice(start, end) });
      } catch (error) {
        reject(fail(error.message || MSG_SELECT_MDB, 400));
      }
    });
  });
}

const READER_VBS = `
Option Explicit
Dim sh, fso, dbPath, pwd, outPath, action, workCode, conn, rs, out
Dim items(), n, i, sql, desc, code, msg, userName, userAddress, workDescription
Dim measurements(), mCount, measId, itemNo, itemCode, details(), dCount, mathText
Dim itemDescs(), itemCount, itemKeys, inList, key
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

Function JsonNumber(ByVal v)
  If IsNull(v) Then
    JsonNumber = "null"
    Exit Function
  End If
  If Not IsNumeric(v) Then
    JsonNumber = "null"
    Exit Function
  End If
  JsonNumber = Replace(CStr(CDbl(v)), ",", ".")
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

If action = "import" Then
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
    If IsNull(rs.Fields("SUBWORKCODE").Value) Then
      code = "null"
    Else
      code = CStr(CLng(rs.Fields("SUBWORKCODE").Value))
    End If
    If n > UBound(items) Then ReDim Preserve items(UBound(items) + 100)
    items(n) = "{""SubWorkCode"":" & code & ",""SubWorkDescription"":""" & JsonEscape(desc) & """}"
    n = n + 1
    rs.MoveNext
  Loop
  rs.Close
  Err.Clear

  mCount = 0
  ReDim measurements(199)
  Set itemKeys = CreateObject("Scripting.Dictionary")
  Set rs = CreateObject("ADODB.Recordset")
  rs.Open "SELECT MeasurementId, WORKCODE, SUBWORKCODE, ITEMCODE, ITEMNO FROM AEMMEASUREMENT WHERE WORKCODE = " & CLng(workCode) & " ORDER BY WORKCODE, SUBWORKCODE, MeasurementId", conn, 0, 1
  If Err.Number <> 0 Then
    msg = Replace(Err.Description, pwd, "")
    WriteFail msg
    conn.Close
    WScript.Quit 1
  End If
  Do While Not rs.EOF
    If IsNull(rs.Fields("MeasurementId").Value) Then
      measId = "null"
    Else
      measId = CStr(CLng(rs.Fields("MeasurementId").Value))
    End If
    If IsNull(rs.Fields("SUBWORKCODE").Value) Then
      code = "null"
    Else
      code = CStr(CLng(rs.Fields("SUBWORKCODE").Value))
    End If
    If IsNull(rs.Fields("ITEMNO").Value) Or Not IsNumeric(rs.Fields("ITEMNO").Value) Then
      itemNo = "null"
    Else
      itemNo = CStr(CLng(rs.Fields("ITEMNO").Value))
    End If
    If IsNull(rs.Fields("ITEMCODE").Value) Then
      itemCode = ""
    Else
      itemCode = Trim(CStr(rs.Fields("ITEMCODE").Value))
    End If
    If mCount > UBound(measurements) Then ReDim Preserve measurements(UBound(measurements) + 200)
    measurements(mCount) = "{""MeasurementId"":" & measId & ",""SubWorkCode"":" & code & ",""ItemNo"":" & itemNo & ",""ItemCode"":""" & JsonEscape(itemCode) & """}"
    mCount = mCount + 1
    If itemNo <> "null" Then
      If Not itemKeys.Exists(itemNo) Then itemKeys.Add itemNo, itemNo
    End If
    rs.MoveNext
  Loop
  rs.Close
  Err.Clear

  dCount = 0
  ReDim details(199)
  Set rs = CreateObject("ADODB.Recordset")
  rs.Open "SELECT SUBWORKCODE, ITEMNO, WORKDESCRIPTION, MATHSTRING, QUANTITY FROM AEDMEASUREMENT WHERE WORKCODE = " & CLng(workCode) & " ORDER BY SUBWORKCODE, ITEMNO, AedMeasurementId", conn, 0, 1
  If Err.Number <> 0 Then
    msg = Replace(Err.Description, pwd, "")
    WriteFail msg
    conn.Close
    WScript.Quit 1
  End If
  Do While Not rs.EOF
    If IsNull(rs.Fields("SUBWORKCODE").Value) Then
      code = "null"
    Else
      code = CStr(CLng(rs.Fields("SUBWORKCODE").Value))
    End If
    If IsNull(rs.Fields("ITEMNO").Value) Or Not IsNumeric(rs.Fields("ITEMNO").Value) Then
      itemNo = "null"
    Else
      itemNo = CStr(CLng(rs.Fields("ITEMNO").Value))
    End If
    If IsNull(rs.Fields("WORKDESCRIPTION").Value) Then
      desc = ""
    Else
      desc = Trim(CStr(rs.Fields("WORKDESCRIPTION").Value))
    End If
    If IsNull(rs.Fields("MATHSTRING").Value) Then
      mathText = ""
    Else
      mathText = Trim(CStr(rs.Fields("MATHSTRING").Value))
    End If
    If dCount > UBound(details) Then ReDim Preserve details(UBound(details) + 200)
    details(dCount) = "{""SubWorkCode"":" & code & ",""ItemNo"":" & itemNo & ",""Description"":""" & JsonEscape(desc) & """,""MathString"":""" & JsonEscape(mathText) & """,""Quantity"":" & JsonNumber(rs.Fields("QUANTITY").Value) & "}"
    dCount = dCount + 1
    rs.MoveNext
  Loop
  rs.Close
  Err.Clear

  itemCount = 0
  ReDim itemDescs(49)
  If itemKeys.Count > 0 Then
    inList = ""
    For Each key In itemKeys.Keys
      If Len(inList) > 0 Then inList = inList & ","
      inList = inList & key
    Next
    Set rs = CreateObject("ADODB.Recordset")
    rs.Open "SELECT ITEMNO, ITEMDESCRIPTION FROM AEMITEM WHERE ITEMNO IN (" & inList & ")", conn, 0, 1
    If Err.Number <> 0 Then
      msg = Replace(Err.Description, pwd, "")
      WriteFail msg
      conn.Close
      WScript.Quit 1
    End If
    Do While Not rs.EOF
      If IsNull(rs.Fields("ITEMNO").Value) Or Not IsNumeric(rs.Fields("ITEMNO").Value) Then
        itemNo = "null"
      Else
        itemNo = CStr(CLng(rs.Fields("ITEMNO").Value))
      End If
      If IsNull(rs.Fields("ITEMDESCRIPTION").Value) Then
        desc = ""
      Else
        desc = Trim(CStr(rs.Fields("ITEMDESCRIPTION").Value))
      End If
      If itemNo <> "null" Then
        If itemCount > UBound(itemDescs) Then ReDim Preserve itemDescs(UBound(itemDescs) + 50)
        itemDescs(itemCount) = "{""ItemNo"":" & itemNo & ",""ItemDescription"":""" & JsonEscape(desc) & """}"
        itemCount = itemCount + 1
      End If
      rs.MoveNext
    Loop
    rs.Close
    Err.Clear
  End If
  conn.Close

  out.Write "{""ok"":true,""workDescription"":""" & JsonEscape(workDescription) & """,""subWorks"":["
  For i = 0 To n - 1
    If i > 0 Then out.Write ","
    out.Write items(i)
  Next
  out.Write "],""measurements"":["
  For i = 0 To mCount - 1
    If i > 0 Then out.Write ","
    out.Write measurements(i)
  Next
  out.Write "],""details"":["
  For i = 0 To dCount - 1
    If i > 0 Then out.Write ","
    out.Write details(i)
  Next
  out.Write "],""items"":["
  For i = 0 To itemCount - 1
    If i > 0 Then out.Write ","
    out.Write itemDescs(i)
  Next
  out.Write "]}"
  out.Close
  WScript.Quit 0
End If

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

sql = "SELECT WORKCODE, WORKDESCRIPTION FROM AEMWORK ORDER BY WORKCODE"
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

async function readWorkImportSource(workCode, mdbPath) {
  const code = Number(workCode);
  if (!Number.isInteger(code) || code <= 0) {
    throw fail("Please select a work.", 400);
  }
  const parsed = await runReader({
    mdbPath,
    action: "import",
    workCode: String(code),
  });
  return {
    workCode: code,
    workDescription: String(parsed.workDescription || "").trim(),
    subWorks: Array.isArray(parsed.subWorks) ? parsed.subWorks : [],
    measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
    details: Array.isArray(parsed.details) ? parsed.details : [],
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

function clipItemDescription(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function parseMathString(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { number: null, length: null, breadth: null, height: null };
  }
  const compact = text.replace(/\s+/g, "");
  if (!/^(?:\d+(?:\.\d+)?)(?:\*(?:\d+(?:\.\d+)?))*$/.test(compact)) {
    return { number: text, length: null, breadth: null, height: null };
  }
  const parts = compact.split("*");
  if (parts.length < 4) {
    return {
      number: parts[0] || null,
      length: parts[1] || null,
      breadth: parts[2] || null,
      height: null,
    };
  }
  return {
    number: parts.slice(0, parts.length - 3).join("*"),
    length: parts[parts.length - 3],
    breadth: parts[parts.length - 2],
    height: parts[parts.length - 1],
  };
}

async function assertCanImport(pool, userId, { allowCategory3 = false } = {}) {
  const actorId = Number(userId);
  if (!actorId) throw fail("User is required.", 400);
  const user = await pool.query(
    `SELECT u."UserId", u."UserCategoryId", uc."UserCategoryName"
     FROM "MasterUser" u
     LEFT JOIN "MasterUserCategory" uc
       ON uc."UserCategoryId" = u."UserCategoryId"
     WHERE u."UserId" = $1 AND COALESCE(u."MarkForDeletion", false) = false`,
    [actorId],
  );
  if (!user.rows[0]) throw fail("User was not found.", 403);
  const actorCategory = String(user.rows[0].UserCategoryName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const categoryId = Number(user.rows[0].UserCategoryId);
  const allowed =
    actorCategory === "superadmin" ||
    actorCategory === "orgadmin" ||
    (allowCategory3 && categoryId === 3);
  if (!allowed) {
    throw fail("Only SuperAdmin or OrgAdmin can import.", 403);
  }
  return actorId;
}

function clientSource(raw) {
  if (!raw || typeof raw !== "object") throw fail(MSG_SELECT_MDB, 400);
  return {
    workDescription: String(raw.workDescription || "").trim(),
    subWorks: Array.isArray(raw.subWorks) ? raw.subWorks : [],
    measurements: Array.isArray(raw.measurements) ? raw.measurements : [],
    details: Array.isArray(raw.details) ? raw.details : [],
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

async function importSelectedWork(pool, { workCode, userId, source: rawSource }) {
  const actorId = await assertCanImport(pool, userId);
  const source = clientSource(rawSource);
  if (!source.workDescription) {
    throw fail("The selected work has no description.", 400);
  }

  const itemNos = [
    ...new Set(
      source.measurements
        .map((row) => Number(row.ItemNo))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const mapping = new Map();
  if (itemNos.length) {
    const mapped = await pool.query(
      `SELECT DISTINCT ON (m."SourceId") m."SourceId", m."OnlineId"
       FROM "MasterItemMaping" m
       INNER JOIN "MasterItem" i ON i."ItemId" = m."OnlineId"
       WHERE m."SourceId" = ANY($1::int[])
       ORDER BY m."SourceId", m."ItemMapingId"`,
      [itemNos],
    );
    for (const row of mapped.rows) {
      mapping.set(Number(row.SourceId), Number(row.OnlineId));
    }
  }

  const onlineIds = [...new Set(mapping.values())];
  const rateAnalysisItems = new Set();
  if (onlineIds.length) {
    const rated = await pool.query(
      `SELECT DISTINCT ra."ItemId"
       FROM "MasterRAComponent" ra
       INNER JOIN "MasterMaterial" m
         ON m."MaterialId" = ra."ComponentId"
        AND m."MaterialLoadFactor" > 0
       WHERE ra."ItemId" = ANY($1::int[])
         AND ra."ComponentType" = 'Ma'`,
      [onlineIds],
    );
    for (const row of rated.rows) {
      rateAnalysisItems.add(Number(row.ItemId));
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const work = await client.query(
      `INSERT INTO "MasterWork"
        ("WorkName", "ProjectId", "UserId", "Remarks", "MarkForDeletion", "CreationDate")
       VALUES ($1, NULL, $2, NULL, false, CURRENT_DATE)
       RETURNING "MasterWorkId", "WorkName"`,
      [source.workDescription, actorId],
    );
    const masterWorkId = Number(work.rows[0].MasterWorkId);

    const subWorkIdByCode = new Map();
    let subWorkSequence = 1;
    for (const row of source.subWorks) {
      const subWorkCode = Number(row.SubWorkCode);
      if (!Number.isInteger(subWorkCode)) continue;
      const name =
        String(row.SubWorkDescription || "").trim() ||
        `Sub Work ${subWorkCode}`;
      const inserted = await client.query(
        `INSERT INTO "MasterSubWork"
          ("WorkId", "MasterWorkId", "SubWorkName", "Sequence", "MarkForDeletion")
         VALUES ($1, $1, $2, $3, false)
         RETURNING "SubWorkId"`,
        [masterWorkId, name, subWorkSequence],
      );
      subWorkIdByCode.set(subWorkCode, Number(inserted.rows[0].SubWorkId));
      subWorkSequence += 1;
    }

    const sequenceBySubWork = new Map();
    const skipped = [];
    const issues = [];
    const seenIssues = new Set();
    const itemDescriptions = new Map();
    for (const item of source.items || []) {
      const describedItem = Number(item.ItemNo);
      if (!Number.isInteger(describedItem)) continue;
      itemDescriptions.set(
        describedItem,
        clipItemDescription(item.ItemDescription),
      );
    }
    const itemCodes = new Map();
    for (const row of source.measurements) {
      const codedItem = Number(row.ItemNo);
      const coded = String(row.ItemCode || "").trim();
      if (!Number.isInteger(codedItem) || !coded || itemCodes.has(codedItem)) {
        continue;
      }
      itemCodes.set(codedItem, coded);
    }
    let abstracts = 0;
    let measurementLines = 0;
    const detailsByKey = new Map();
    for (const line of source.details) {
      const detailSubWork = Number(line.SubWorkCode);
      const detailItem = Number(line.ItemNo);
      if (!Number.isInteger(detailSubWork) || !Number.isInteger(detailItem)) {
        continue;
      }
      const key = `${detailSubWork}|${detailItem}`;
      if (!detailsByKey.has(key)) detailsByKey.set(key, []);
      detailsByKey.get(key).push(line);
    }
    for (const row of source.measurements) {
      const subWorkCode = Number(row.SubWorkCode);
      const itemNo = Number(row.ItemNo);
      const subWorkId = subWorkIdByCode.get(subWorkCode);
      if (!subWorkId) {
        skipped.push({
          subWorkCode: Number.isInteger(subWorkCode) ? subWorkCode : null,
          itemNo: Number.isInteger(itemNo) ? itemNo : null,
          reason: "Sub work was not imported.",
        });
        continue;
      }
      const onlineId = mapping.get(itemNo);
      if (!onlineId) {
        if (Number.isInteger(itemNo) && !seenIssues.has(itemNo)) {
          seenIssues.add(itemNo);
          issues.push({
            itemNo,
            itemCode: itemCodes.get(itemNo) || "",
            itemDescription: itemDescriptions.get(itemNo) || "",
          });
        }
        skipped.push({
          subWorkCode,
          itemNo: Number.isInteger(itemNo) ? itemNo : null,
          reason: "No OnlineId in MasterItemMaping for this ITEMNO.",
        });
        continue;
      }
      const nextSequence = (sequenceBySubWork.get(subWorkId) || 0) + 1;
      sequenceBySubWork.set(subWorkId, nextSequence);
      const inserted = await client.query(
        `INSERT INTO "WorkAbstract"
          ("ProjectId", "WorkId", "SubWorkId", "ItemId", "Sequence",
           "MarkForDeletion", "IsRA")
         VALUES (NULL, $1, $2, $3, $4, false, $5)
         RETURNING "WorkAbstractId"`,
        [
          masterWorkId,
          subWorkId,
          onlineId,
          nextSequence,
          rateAnalysisItems.has(onlineId),
        ],
      );
      abstracts += 1;
      const workAbstractId = Number(inserted.rows[0].WorkAbstractId);
      const lines = detailsByKey.get(`${subWorkCode}|${itemNo}`) || [];
      let lineNo = 1;
      for (const line of lines) {
        const dims = parseMathString(line.MathString);
        const quantity = Number(line.Quantity);
        await client.query(
          `INSERT INTO "WorkMeasurement"
            ("WorkAbstractId", "Description", "Quantity", "Number", "Length",
             "Breadth", "Height", "Sequence")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workAbstractId,
            String(line.Description || "").trim(),
            Number.isFinite(quantity) ? quantity : null,
            dims.number,
            dims.length,
            dims.breadth,
            dims.height,
            lineNo,
          ],
        );
        lineNo += 1;
        measurementLines += 1;
      }
    }

    await client.query("COMMIT");
    return {
      masterWorkId,
      workName: work.rows[0].WorkName,
      subWorks: subWorkIdByCode.size,
      abstracts,
      measurements: measurementLines,
      issues,
      skipped,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw error.status ? error : fail(error.message, 500);
  } finally {
    client.release();
  }
}

async function listAemWorkDescriptions(mdbPath) {
  const parsed = await runReader({ mdbPath, action: "works" });
  const works = Array.isArray(parsed.works) ? parsed.works : [];
  works.sort((a, b) => Number(a.WorkCode) - Number(b.WorkCode));
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

async function readWorkForImport(workCode, mdbPath) {
  const code = Number(workCode);
  if (!Number.isInteger(code) || code <= 0) {
    throw fail("Please select a work.", 400);
  }
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

const MONTH_NUMBERS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseUsDate(value) {
  let text = String(value || "")
    .trim()
    .replace(/^["'#]+|["'#]+$/g, "")
    .trim();
  text = text.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?$/, "").trim();
  if (!text) throw fail("The work date in AEMWORK.txt is blank.", 400);

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const iso = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) return iso;
  }

  match = text.match(/^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2}|\d{4})$/);
  if (match) {
    const month = MONTH_NUMBERS[match[2].slice(0, 3).toLowerCase()];
    const year = Number(match[3]);
    const iso = month
      ? isoDate(year < 100 ? 2000 + year : year, month, Number(match[1]))
      : null;
    if (iso) return iso;
  }

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    let month = Number(match[1]);
    let day = Number(match[2]);
    const year = Number(match[3]);
    const fullYear = year < 100 ? 2000 + year : year;
    if (month > 12 && day <= 12) {
      const swapped = month;
      month = day;
      day = swapped;
    }
    const iso = isoDate(fullYear, month, day);
    if (iso) return iso;
  }

  const shown = text.length > 40 ? `${text.slice(0, 40)}...` : text;
  throw fail(`The work date must be mm/dd/yyyy. The 6th field is "${shown}".`, 400);
}

async function importTextAbstracts(pool, { userId, works, subWorks, measurements, details }) {
  const actorId = await assertCanImport(pool, userId, { allowCategory3: true });
  const workRows = Array.isArray(works) ? works : [];
  const subRows = Array.isArray(subWorks) ? subWorks : [];
  const measureRows = Array.isArray(measurements) ? measurements : [];
  const detailRows = Array.isArray(details) ? details : [];

  const workIdByCode = new Map();
  for (const row of workRows) {
    const code = String(row.workCode ?? "").trim();
    const id = Number(row.masterWorkId);
    if (!code || !Number.isInteger(id) || id <= 0) continue;
    workIdByCode.set(code, id);
  }
  const workIds = [...new Set(workIdByCode.values())];
  if (!workIds.length) throw fail("The imported work was not found.", 400);

  const subIdByPair = new Map();
  const subIdByCode = new Map();
  const subIds = [];
  for (const row of subRows) {
    const workCode = String(row.workCode ?? "").trim();
    const subWorkCode = String(row.subWorkCode ?? "").trim();
    const id = Number(row.subWorkId);
    if (!subWorkCode || !Number.isInteger(id) || id <= 0) continue;
    subIdByPair.set(`${workCode}|${subWorkCode}`, id);
    if (!subIdByCode.has(subWorkCode)) subIdByCode.set(subWorkCode, id);
    subIds.push(id);
  }

  const owned = await pool.query(
    `SELECT "MasterWorkId"
     FROM "MasterWork"
     WHERE "MasterWorkId" = ANY($1::int[])
       AND "UserId" = $2
       AND COALESCE("MarkForDeletion", false) = false`,
    [workIds, actorId],
  );
  if (owned.rows.length !== workIds.length) {
    throw fail("The imported work was not found.", 403);
  }
  if (subIds.length) {
    const foundSubs = await pool.query(
      `SELECT "SubWorkId"
       FROM "MasterSubWork"
       WHERE "SubWorkId" = ANY($1::int[])
         AND "WorkId" = ANY($2::int[])
         AND COALESCE("MarkForDeletion", false) = false`,
      [[...new Set(subIds)], workIds],
    );
    if (foundSubs.rows.length !== new Set(subIds).size) {
      throw fail("The imported sub work was not found.", 403);
    }
  }

  const itemNos = [
    ...new Set(
      measureRows
        .map((row) => Number(row.itemNo))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const mapping = new Map();
  if (itemNos.length) {
    const mapped = await pool.query(
      `SELECT DISTINCT ON (m."SourceId") m."SourceId", m."OnlineId"
       FROM "MasterItemMaping" m
       INNER JOIN "MasterItem" i ON i."ItemId" = m."OnlineId"
       WHERE m."SourceId" = ANY($1::int[])
       ORDER BY m."SourceId", m."ItemMapingId"`,
      [itemNos],
    );
    for (const row of mapped.rows) {
      mapping.set(Number(row.SourceId), Number(row.OnlineId));
    }
  }
  const onlineIds = [...new Set(mapping.values())];
  const rateAnalysisItems = new Set();
  if (onlineIds.length) {
    const rated = await pool.query(
      `SELECT DISTINCT ra."ItemId"
       FROM "MasterRAComponent" ra
       INNER JOIN "MasterMaterial" m
         ON m."MaterialId" = ra."ComponentId"
        AND m."MaterialLoadFactor" > 0
       WHERE ra."ItemId" = ANY($1::int[])
         AND ra."ComponentType" = 'Ma'`,
      [onlineIds],
    );
    for (const row of rated.rows) {
      rateAnalysisItems.add(Number(row.ItemId));
    }
  }

  const onlyWorkId = workIdByCode.size === 1 ? [...workIdByCode.values()][0] : null;
  const detailsByKey = new Map();
  const detailsBySubItem = new Map();
  for (const line of detailRows) {
    const detailWork = String(line.workCode ?? "").trim();
    const detailSubWork = String(line.subWorkCode ?? "").trim();
    const detailItem = Number(line.itemNo);
    if (!detailSubWork || !Number.isInteger(detailItem)) continue;
    const exactKey = `${detailWork}|${detailSubWork}|${detailItem}`;
    const subKey = `${detailSubWork}|${detailItem}`;
    if (!detailsByKey.has(exactKey)) detailsByKey.set(exactKey, []);
    if (!detailsBySubItem.has(subKey)) detailsBySubItem.set(subKey, []);
    detailsByKey.get(exactKey).push(line);
    detailsBySubItem.get(subKey).push(line);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sequenceBySubWork = new Map();
    let abstracts = 0;
    let measurementLines = 0;
    for (const row of measureRows) {
      const workCode = String(row.workCode ?? "").trim();
      const subWorkCode = String(row.subWorkCode ?? "").trim();
      const itemNo = Number(row.itemNo);
      const masterWorkId = workIdByCode.get(workCode) || onlyWorkId;
      const subWorkId =
        subIdByPair.get(`${workCode}|${subWorkCode}`) ||
        (onlyWorkId ? subIdByCode.get(subWorkCode) : undefined);
      if (!masterWorkId || !subWorkId || !mapping.has(itemNo)) continue;
      const onlineId = mapping.get(itemNo);
      const nextSequence = (sequenceBySubWork.get(subWorkId) || 0) + 1;
      sequenceBySubWork.set(subWorkId, nextSequence);
      const insertedAbstract = await client.query(
        `INSERT INTO "WorkAbstract"
          ("ProjectId", "WorkId", "SubWorkId", "ItemId", "Sequence",
           "MarkForDeletion", "IsRA")
         VALUES (NULL, $1, $2, $3, $4, false, $5)
         RETURNING "WorkAbstractId"`,
        [
          masterWorkId,
          subWorkId,
          onlineId,
          nextSequence,
          rateAnalysisItems.has(onlineId),
        ],
      );
      abstracts += 1;
      const workAbstractId = Number(insertedAbstract.rows[0].WorkAbstractId);
      const lines =
        detailsByKey.get(`${workCode}|${subWorkCode}|${itemNo}`) ||
        (onlyWorkId ? detailsBySubItem.get(`${subWorkCode}|${itemNo}`) : null) ||
        [];
      let lineNo = 1;
      for (const line of lines) {
        const dims = parseMathString(line.mathString);
        const quantity = Number(line.quantity);
        await client.query(
          `INSERT INTO "WorkMeasurement"
            ("WorkAbstractId", "Description", "Quantity", "Number", "Length",
             "Breadth", "Height", "Sequence")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workAbstractId,
            String(line.description || "").trim(),
            Number.isFinite(quantity) ? quantity : null,
            dims.number,
            dims.length,
            dims.breadth,
            dims.height,
            lineNo,
          ],
        );
        lineNo += 1;
        measurementLines += 1;
      }
    }
    await client.query("COMMIT");
    return { abstracts, measurements: measurementLines };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw error.status ? error : fail(error.message, 500);
  } finally {
    client.release();
  }
}

async function loadImportedItemMaps(pool, measureRows) {
  const itemNos = [
    ...new Set(
      measureRows
        .map((row) => Number(row.itemNo))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const mapping = new Map();
  if (itemNos.length) {
    const mapped = await pool.query(
      `SELECT DISTINCT ON (m."SourceId") m."SourceId", m."OnlineId"
       FROM "MasterItemMaping" m
       INNER JOIN "MasterItem" i ON i."ItemId" = m."OnlineId"
       WHERE m."SourceId" = ANY($1::int[])
       ORDER BY m."SourceId", m."ItemMapingId"`,
      [itemNos],
    );
    for (const row of mapped.rows) {
      mapping.set(Number(row.SourceId), Number(row.OnlineId));
    }
  }
  const onlineIds = [...new Set(mapping.values())];
  const rateAnalysisItems = new Set();
  if (onlineIds.length) {
    const rated = await pool.query(
      `SELECT DISTINCT ra."ItemId"
       FROM "MasterRAComponent" ra
       INNER JOIN "MasterMaterial" m
         ON m."MaterialId" = ra."ComponentId"
        AND m."MaterialLoadFactor" > 0
       WHERE ra."ItemId" = ANY($1::int[])
         AND ra."ComponentType" = 'Ma'`,
      [onlineIds],
    );
    for (const row of rated.rows) {
      rateAnalysisItems.add(Number(row.ItemId));
    }
  }
  return { mapping, rateAnalysisItems };
}

async function writeImportedAbstracts(client, {
  works,
  subWorks,
  measurements,
  details,
  mapping,
  rateAnalysisItems,
}) {
  const workIdByCode = new Map();
  for (const row of works) {
    const code = String(row.workCode ?? "").trim();
    const id = Number(row.masterWorkId);
    if (!code || !Number.isInteger(id) || id <= 0) continue;
    workIdByCode.set(code, id);
  }
  const subIdByPair = new Map();
  const subIdByCode = new Map();
  for (const row of subWorks) {
    const workCode = String(row.workCode ?? "").trim();
    const subWorkCode = String(row.subWorkCode ?? "").trim();
    const id = Number(row.subWorkId);
    if (!subWorkCode || !Number.isInteger(id) || id <= 0) continue;
    subIdByPair.set(`${workCode}|${subWorkCode}`, id);
    if (!subIdByCode.has(subWorkCode)) subIdByCode.set(subWorkCode, id);
  }
  const onlyWorkId = workIdByCode.size === 1 ? [...workIdByCode.values()][0] : null;
  const detailsByKey = new Map();
  const detailsBySubItem = new Map();
  for (const line of details) {
    const detailWork = String(line.workCode ?? "").trim();
    const detailSubWork = String(line.subWorkCode ?? "").trim();
    const detailItem = Number(line.itemNo);
    if (!detailSubWork || !Number.isInteger(detailItem)) continue;
    const exactKey = `${detailWork}|${detailSubWork}|${detailItem}`;
    const subKey = `${detailSubWork}|${detailItem}`;
    if (!detailsByKey.has(exactKey)) detailsByKey.set(exactKey, []);
    if (!detailsBySubItem.has(subKey)) detailsBySubItem.set(subKey, []);
    detailsByKey.get(exactKey).push(line);
    detailsBySubItem.get(subKey).push(line);
  }
  const sequenceBySubWork = new Map();
  let abstracts = 0;
  let measurementLines = 0;
  const issues = [];
  const seenIssues = new Set();
  for (const row of measurements) {
    const itemNo = Number(row.itemNo);
    if (!Number.isInteger(itemNo) || itemNo <= 0 || mapping.has(itemNo) || seenIssues.has(itemNo)) {
      continue;
    }
    seenIssues.add(itemNo);
    issues.push({
      itemNo,
      itemCode: String(row.itemCode || "").trim(),
    });
  }
  for (const row of measurements) {
    const workCode = String(row.workCode ?? "").trim();
    const subWorkCode = String(row.subWorkCode ?? "").trim();
    const itemNo = Number(row.itemNo);
    const masterWorkId = workIdByCode.get(workCode) || onlyWorkId;
    const subWorkId =
      subIdByPair.get(`${workCode}|${subWorkCode}`) ||
      (onlyWorkId ? subIdByCode.get(subWorkCode) : undefined);
    if (!masterWorkId || !subWorkId || !mapping.has(itemNo)) continue;
    const onlineId = mapping.get(itemNo);
    const nextSequence = (sequenceBySubWork.get(subWorkId) || 0) + 1;
    sequenceBySubWork.set(subWorkId, nextSequence);
    const insertedAbstract = await client.query(
      `INSERT INTO "WorkAbstract"
        ("ProjectId", "WorkId", "SubWorkId", "ItemId", "Sequence",
         "MarkForDeletion", "IsRA")
       VALUES (NULL, $1, $2, $3, $4, false, $5)
       RETURNING "WorkAbstractId"`,
      [
        masterWorkId,
        subWorkId,
        onlineId,
        nextSequence,
        rateAnalysisItems.has(onlineId),
      ],
    );
    abstracts += 1;
    const workAbstractId = Number(insertedAbstract.rows[0].WorkAbstractId);
    const lines =
      detailsByKey.get(`${workCode}|${subWorkCode}|${itemNo}`) ||
      (onlyWorkId ? detailsBySubItem.get(`${subWorkCode}|${itemNo}`) : null) ||
      [];
    let lineNo = 1;
    for (const line of lines) {
      const dims = parseMathString(line.mathString);
      const quantity = Number(line.quantity);
      await client.query(
        `INSERT INTO "WorkMeasurement"
          ("WorkAbstractId", "Description", "Quantity", "Number", "Length",
           "Breadth", "Height", "Sequence")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          workAbstractId,
          String(line.description || "").trim(),
          Number.isFinite(quantity) ? quantity : null,
          dims.number,
          dims.length,
          dims.breadth,
          dims.height,
          lineNo,
        ],
      );
      lineNo += 1;
      measurementLines += 1;
    }
  }
  return { abstracts, measurements: measurementLines, issues };
}

function importRemark(headerLine) {
  const lead = String(headerLine || "").replace(/\s+/g, " ").trim();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const stamp = `${part("day")}-${part("month")}-${part("year")}-${part("hour")}-${part("minute")}-${part("second")}`;
  const detail = lead ? `${lead} ${stamp}` : stamp;
  return `Work Imported by - ${detail}`;
}

async function importTextFiles(pool, { userId, works, subWorks, measurements, details, headerLine }) {
  const actorId = await assertCanImport(pool, userId, { allowCategory3: true });
  const workRows = Array.isArray(works) ? works : [];
  const subRows = Array.isArray(subWorks) ? subWorks : [];
  const measureRows = Array.isArray(measurements) ? measurements : [];
  const detailRows = Array.isArray(details) ? details : [];
  if (!workRows.length) throw fail("AEMWORK.txt has no work.", 400);
  const remarks = importRemark(headerLine);
  const { mapping, rateAnalysisItems } = await loadImportedItemMaps(pool, measureRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = [];
    for (const row of workRows) {
      const workName = String(row.workName || "").trim();
      if (!workName) continue;
      const created = await client.query(
        `INSERT INTO "MasterWork"
          ("WorkName", "ProjectId", "UserId", "Remarks", "MarkForDeletion", "CreationDate")
         VALUES ($1, NULL, $2, $3, false, $4)
         RETURNING "MasterWorkId"`,
        [workName, actorId, remarks, parseUsDate(row.creationDate)],
      );
      inserted.push({
        workCode: String(row.workCode ?? "").trim(),
        masterWorkId: Number(created.rows[0].MasterWorkId),
      });
    }
    if (!inserted.length) throw fail("AEMWORK.txt has no work name.", 400);

    const onlyId = inserted.length === 1 ? inserted[0].masterWorkId : null;
    const idByCode = new Map(
      inserted.map((row) => [row.workCode, row.masterWorkId]),
    );
    const sequenceByWork = new Map();
    const insertedSubs = [];
    for (const row of subRows) {
      const workCode = String(row.workCode ?? "").trim();
      const masterWorkId = idByCode.get(workCode) || onlyId;
      if (!masterWorkId) continue;
      const subWorkCode = String(row.subWorkCode ?? "").trim();
      const subWorkName =
        String(row.subWorkName || "").trim() ||
        (subWorkCode ? `Sub Work ${subWorkCode}` : "Sub Work");
      const sequence = (sequenceByWork.get(masterWorkId) || 0) + 1;
      sequenceByWork.set(masterWorkId, sequence);
      const createdSub = await client.query(
        `INSERT INTO "MasterSubWork"
          ("WorkId", "MasterWorkId", "SubWorkName", "Sequence", "MarkForDeletion")
         VALUES ($1, $1, $2, $3, false)
         RETURNING "SubWorkId"`,
        [masterWorkId, subWorkName, sequence],
      );
      insertedSubs.push({
        workCode,
        subWorkCode,
        subWorkId: Number(createdSub.rows[0].SubWorkId),
      });
    }
    const written = await writeImportedAbstracts(client, {
      works: inserted,
      subWorks: insertedSubs,
      measurements: measureRows,
      details: detailRows,
      mapping,
      rateAnalysisItems,
    });
    await client.query("COMMIT");
    return {
      masterWorkId: inserted[0].masterWorkId,
      works: inserted,
      subWorks: insertedSubs,
      abstracts: written.abstracts,
      measurements: written.measurements,
      issues: written.issues,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw error.status ? error : fail(error.message, 500);
  } finally {
    client.release();
  }
}

function registerCivilEstimateImportRoutes(app, pool) {
  app.post("/api/civil-estimate/aemwork", async (req, res) => {
    try {
      const file = await readMultipartDatabase(req);
      const uploadId = saveUploadedDatabase(file.buffer, file.filename);
      const data = await listAemWorkDescriptions(mdbPathFor(uploadId));
      res.json({ uploadId, data });
    } catch (err) {
      console.error("Civil Estimate import failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not open the Civil Estimate database.",
      });
    }
  });

  app.get("/api/civil-estimate/aemwork/:workCode/selection", async (req, res) => {
    try {
      const data = await readWorkForImport(
        req.params.workCode,
        mdbPathFor(req.query.uploadId),
      );
      res.json(data);
    } catch (err) {
      console.error("Civil Estimate work selection failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not read the selected work.",
      });
    }
  });

  app.get("/api/civil-estimate/database-key", async (req, res) => {
    try {
      await assertCanImport(pool, req.query.userId);
      res.json({ key: DB_PASSWORD });
    } catch (err) {
      console.error("Civil Estimate key request failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not open the Civil Estimate database.",
      });
    }
  });

  app.post("/api/civil-estimate/import-text-abstracts", async (req, res) => {
    try {
      const data = await importTextAbstracts(pool, {
        userId: req.body?.userId,
        works: req.body?.works,
        subWorks: req.body?.subWorks,
        measurements: req.body?.measurements,
        details: req.body?.details,
      });
      res.json(data);
    } catch (err) {
      console.error("Civil Estimate text abstract import failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not import the measurements.",
      });
    }
  });

  app.post("/api/civil-estimate/import-text", async (req, res) => {
    try {
      const data = await importTextFiles(pool, {
        userId: req.body?.userId,
        works: req.body?.works,
        subWorks: req.body?.subWorks,
        measurements: req.body?.measurements,
        details: req.body?.details,
        headerLine: req.body?.headerLine,
      });
      res.json(data);
    } catch (err) {
      console.error("Civil Estimate text import failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not import the selected work.",
      });
    }
  });

  app.post("/api/civil-estimate/import", async (req, res) => {
    try {
      const data = await importSelectedWork(pool, {
        workCode: req.body?.workCode,
        userId: req.body?.userId,
        source: req.body?.source,
      });
      res.json({
        message: data.issues.length
          ? "Imported the Work and Sub Works with following issues."
          : "No Issues, Import Successful",
        ...data,
      });
    } catch (err) {
      console.error("Civil Estimate import write failed:", scrub(err.message));
      res.status(err.status || 500).json({
        message: scrub(err.message) || "Could not import the selected work.",
      });
    }
  });
}

module.exports = {
  MSG_MDB_MISSING,
  MSG_NOT_UPDATED,
  listAemWorkDescriptions,
  readWorkForImport,
  importSelectedWork,
  registerCivilEstimateImportRoutes,
};
