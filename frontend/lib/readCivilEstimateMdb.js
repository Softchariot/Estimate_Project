import { Buffer } from "buffer";
import MDBReader from "mdb-reader";

function text(value) {
  return String(value ?? "").trim();
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function quantityOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function byCode(a, b, key) {
  return Number(a[key]) - Number(b[key]);
}

export function readCivilEstimateDatabase(arrayBuffer, password) {
  const reader = new MDBReader(Buffer.from(arrayBuffer), { password });
  const userRow = reader
    .getTable("USERS")
    .getData()
    .find((row) => text(row.USERNAME));
  const works = reader
    .getTable("AEMWORK")
    .getData()
    .map((row) => ({
      WorkCode: intOrNull(row.WORKCODE),
      WorkDescription: text(row.WORKDESCRIPTION),
    }))
    .filter((row) => row.WorkCode && row.WorkDescription)
    .sort((a, b) => byCode(a, b, "WorkCode"));
  const subWorks = reader
    .getTable("AEMSUBWORK")
    .getData()
    .map((row) => ({
      WorkCode: intOrNull(row.WORKCODE),
      SubWorkCode: intOrNull(row.SUBWORKCODE),
      SubWorkDescription: text(row.SUBWORKDESCRIPTION),
    }))
    .filter((row) => row.WorkCode && row.SubWorkCode)
    .sort((a, b) => byCode(a, b, "SubWorkCode"));
  const measurements = reader
    .getTable("AEMMEASUREMENT")
    .getData()
    .map((row) => ({
      WorkCode: intOrNull(row.WORKCODE),
      SubWorkCode: intOrNull(row.SUBWORKCODE),
      MeasurementId: intOrNull(row.MeasurementId),
      ItemNo: intOrNull(row.ITEMNO),
      ItemCode: text(row.ITEMCODE),
    }))
    .filter((row) => row.WorkCode)
    .sort((a, b) => {
      if (a.SubWorkCode !== b.SubWorkCode) return byCode(a, b, "SubWorkCode");
      return byCode(a, b, "MeasurementId");
    });
  const details = reader
    .getTable("AEDMEASUREMENT")
    .getData()
    .map((row) => ({
      WorkCode: intOrNull(row.WORKCODE),
      SubWorkCode: intOrNull(row.SUBWORKCODE),
      ItemNo: intOrNull(row.ITEMNO),
      AedMeasurementId: intOrNull(row.AedMeasurementId),
      Description: text(row.WORKDESCRIPTION),
      MathString: text(row.MATHSTRING),
      Quantity: quantityOrNull(row.QUANTITY),
    }))
    .filter((row) => row.WorkCode)
    .sort((a, b) => {
      if (a.SubWorkCode !== b.SubWorkCode) return byCode(a, b, "SubWorkCode");
      if (a.ItemNo !== b.ItemNo) return byCode(a, b, "ItemNo");
      return byCode(a, b, "AedMeasurementId");
    });
  const items = reader
    .getTable("AEMITEM")
    .getData()
    .map((row) => ({
      ItemNo: intOrNull(row.ITEMNO),
      ItemDescription: text(row.ITEMDESCRIPTION),
    }))
    .filter((row) => row.ItemNo);

  return {
    userName: text(userRow?.USERNAME),
    userAddress: text(userRow?.ADDRESS),
    works,
    subWorks,
    measurements,
    details,
    items,
  };
}

export function selectionFromDatabase(database, workCode) {
  const code = Number(workCode);
  const work = (database?.works || []).find((row) => row.WorkCode === code);
  const subWorks = (database?.subWorks || []).filter(
    (row) => row.WorkCode === code && row.SubWorkDescription,
  );
  return {
    userName: database?.userName || "",
    userAddress: database?.userAddress || "",
    workCode: code,
    workDescription: work?.WorkDescription || "",
    subWorks,
  };
}

export function sourceFromDatabase(database, workCode) {
  const code = Number(workCode);
  const work = (database?.works || []).find((row) => row.WorkCode === code);
  const measurements = (database?.measurements || []).filter(
    (row) => row.WorkCode === code,
  );
  const itemNos = new Set(measurements.map((row) => row.ItemNo));
  return {
    workDescription: work?.WorkDescription || "",
    subWorks: (database?.subWorks || []).filter((row) => row.WorkCode === code),
    measurements,
    details: (database?.details || []).filter((row) => row.WorkCode === code),
    items: (database?.items || []).filter((row) => itemNos.has(row.ItemNo)),
  };
}
