const DB_NAME = "werms-civil-estimate";
const STORE = "handles";
const HANDLE_KEY = "estimate2223a";
const FILE_NAME = "estimate2223a.mdb";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredHandle() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function saveHandle(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearHandle() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const request = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .delete(HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

function isEstimateFile(file) {
  return String(file?.name || "").toLowerCase() === FILE_NAME;
}

async function fileFromHandle(handle) {
  if (!handle?.queryPermission) return null;
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    permission = await handle.requestPermission({ mode: "read" });
  }
  if (permission !== "granted") return null;
  const file = await handle.getFile();
  return isEstimateFile(file) ? file : null;
}

function pickWithInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mdb";
    input.onchange = () => resolve((input.files && input.files[0]) || null);
    input.click();
  });
}

export async function pickCivilEstimateFile() {
  const stored = await readStoredHandle();
  if (stored) {
    try {
      const remembered = await fileFromHandle(stored);
      if (remembered) return remembered;
    } catch (error) {
      if (error?.name === "NotFoundError") await clearHandle();
    }
  }

  if (typeof window.showOpenFilePicker === "function") {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Estimate2223A.mdb",
          accept: { "application/octet-stream": [".mdb"] },
        },
      ],
    });
    const file = await handle.getFile();
    if (!isEstimateFile(file)) return file;
    await saveHandle(handle);
    return file;
  }

  return pickWithInput();
}
