const EXPORTED_WORKS_NAME =
  /^ExportedWorks_\d+_\d{2}-[A-Za-z]{3}-\d{2}-\d{2}-\d{2}-\d{2}$/;

const REQUIRED_FILES = [
  "AEMWORK.txt",
  "AEMSUBWORK.txt",
  "AEMMEASUREMENT.txt",
  "AEDMEASUREMENT.txt",
  "HEADER.txt",
  "ABSTRACT.txt",
];

export function isExportedWorksFolderName(name) {
  return EXPORTED_WORKS_NAME.test(String(name || "").trim());
}

function dataLines(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const fieldsOf = (line) => line.split("|").map((part) => part.trim());
  const first = fieldsOf(lines[0]);
  const header =
    /^workcode$/i.test(first[0]) ||
    /^workcode$/i.test(first[1]) ||
    /^workdescription$/i.test(first[1]) ||
    /^subworkdescription$/i.test(first[1]) ||
    /^itemno$/i.test(first[4]) ||
    /^(id|measurementid)$/i.test(first[0]);
  return (header ? lines.slice(1) : lines).map(fieldsOf);
}

function workRows(text) {
  return dataLines(text)
    .map((fields) => ({
      workCode: fields[0] || "",
      workName: fields[1] || "",
      creationDate: fields[5] || "",
    }))
    .filter((row) => row.workName);
}

function subWorkRows(text) {
  return dataLines(text)
    .map((fields) => ({
      workCode: fields[0] || "",
      subWorkCode: fields[1] || "",
      subWorkName: fields[2] || "",
    }))
    .filter((row) => row.subWorkName || row.subWorkCode);
}

function measurementRows(text) {
  return dataLines(text)
    .map((fields) => ({
      workCode: fields[1] || "",
      subWorkCode: fields[2] || "",
      itemCode: fields[3] || "",
      itemNo: fields[4] || "",
    }))
    .filter((row) => row.workCode && row.subWorkCode && row.itemNo);
}

function detailRows(text) {
  return dataLines(text)
    .map((fields) => ({
      workCode: fields[0] || "",
      subWorkCode: fields[1] || "",
      itemNo: fields[2] || "",
      description: fields[3] || "",
      mathString: fields[4] || "",
      quantity: fields[5] || "",
    }))
    .filter((row) => row.subWorkCode && row.itemNo);
}

function headerIdentity(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fieldsOf = (line) => line.split("|").map((part) => part.trim());
  const rows = lines.map(fieldsOf);
  const title = /^(user\s*name|username|organisation|organization|orgname|city)$/i;
  const start = rows.length && title.test(rows[0][3] || "") ? 1 : 0;
  const fields = rows[start] || [];
  return {
    userName: fields[3] || "",
    organisationName: fields[4] || "",
    cityName: fields[5] || "",
  };
}

function folderContents(workText, subWorkText, measurementText, detailText, headerText) {
  const works = workRows(workText);
  const subWorks = subWorkRows(subWorkText);
  const header = headerIdentity(headerText);
  return {
    workName: works[0]?.workName || "",
    subWorks: subWorks.map((row) => row.subWorkName).filter(Boolean),
    works,
    subWorkRows: subWorks,
    measurements: measurementRows(measurementText),
    details: detailRows(detailText),
    userName: header.userName,
    organisationName: header.organisationName,
    cityName: header.cityName,
  };
}

async function readDirectoryHandle(dir) {
  const files = new Map();
  for await (const [entryName, handle] of dir.entries()) {
    if (handle.kind !== "file") continue;
    files.set(entryName.toLowerCase(), handle);
  }
  const missing = REQUIRED_FILES.filter((name) => !files.has(name.toLowerCase()));
  if (missing.length) {
    throw new Error("Unable to proceed, the Folder has incomplete Files");
  }
  const workFile = await files.get("aemwork.txt").getFile();
  const subWorkFile = await files.get("aemsubwork.txt").getFile();
  const measurementFile = await files.get("aemmeasurement.txt").getFile();
  const detailFile = await files.get("aedmeasurement.txt").getFile();
  const headerFile = await files.get("header.txt").getFile();
  return folderContents(
    await workFile.text(),
    await subWorkFile.text(),
    await measurementFile.text(),
    await detailFile.text(),
    await headerFile.text(),
  );
}

function readInputFolder(fileList) {
  const files = Array.from(fileList || []);
  const folderName = String(files[0]?.webkitRelativePath || "").split("/")[0];
  const present = new Set();
  let workFile = null;
  let subWorkFile = null;
  let measurementFile = null;
  let detailFile = null;
  let headerFile = null;
  for (const file of files) {
    const parts = String(file.webkitRelativePath || file.name).split("/");
    if (parts.length !== 2) continue;
    const name = parts[1].toLowerCase();
    present.add(name);
    if (name === "aemwork.txt") workFile = file;
    if (name === "aemsubwork.txt") subWorkFile = file;
    if (name === "aemmeasurement.txt") measurementFile = file;
    if (name === "aedmeasurement.txt") detailFile = file;
    if (name === "header.txt") headerFile = file;
  }
  const missing = REQUIRED_FILES.filter((name) => !present.has(name.toLowerCase()));
  return {
    folderName,
    missing,
    workFile,
    subWorkFile,
    measurementFile,
    detailFile,
    headerFile,
  };
}

function pickFolderWithInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;
    input.onchange = () => resolve(input.files);
    input.click();
  });
}

export async function readImportedWorkFolder() {
  if (typeof window.showDirectoryPicker === "function") {
    const dir = await window.showDirectoryPicker();
    if (!isExportedWorksFolderName(dir.name)) {
      throw new Error(
        "Unable to proceed, select a folder named ExportedWorks_ followed by the work code and date",
      );
    }
    return readDirectoryHandle(dir);
  }

  const fileList = await pickFolderWithInput();
  if (!fileList || !fileList.length) return null;
  const {
    folderName,
    missing,
    workFile,
    subWorkFile,
    measurementFile,
    detailFile,
    headerFile,
  } = readInputFolder(fileList);
  if (!isExportedWorksFolderName(folderName)) {
    throw new Error(
      "Unable to proceed, select a folder named ExportedWorks_ followed by the work code and date",
    );
  }
  if (
    missing.length ||
    !workFile ||
    !subWorkFile ||
    !measurementFile ||
    !detailFile ||
    !headerFile
  ) {
    throw new Error("Unable to proceed, the Folder has incomplete Files");
  }
  return folderContents(
    await workFile.text(),
    await subWorkFile.text(),
    await measurementFile.text(),
    await detailFile.text(),
    await headerFile.text(),
  );
}
