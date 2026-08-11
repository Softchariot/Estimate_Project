const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Pool, Client } = require("pg");
require("dotenv").config();
const PDFDocument = require("pdfkit");

const app = express();
const port = process.env.PORT || 4000;

// const allowedOrigins = ("https://estimate-project-omega.vercel.app/" || "http://localhost:3000" || "http://127.0.0.1:3000")
//   .split(",")
//   .map((origin) => origin.trim())
//   .filter(Boolean);

app.use(cors());
app.use(express.json());

const useSsl = String(process.env.DB_SSL || "false").toLowerCase() === "true";
const connectionString =
  process.env.DB_STRING ||
  "postgresql://neondb_owner:npg_7zq0fResbhYE@ep-billowing-band-ansoxrxg-pooler.c-6.us-east-1.aws.neon.tech/01_WERMS?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

/** Convert a whole-rupee amount to Indian currency words. */
function amountInIndianWords(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return "Rupees Zero Only";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const twoDigits = (num) => {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ""}`.trim();
  };

  const threeDigits = (num) => {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    const parts = [];
    if (h) parts.push(`${ones[h]} Hundred`);
    if (rest) parts.push(twoDigits(rest));
    return parts.join(" ");
  };

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return `Rupees ${parts.join(" ")} Only`;
}

/** Fonts that can render the ₹ glyph (Helvetica cannot). */
function resolveRupeeFontPaths() {
  const candidates = [
    {
      regular: path.join(__dirname, "fonts", "NotoSans-Regular.ttf"),
      bold: path.join(__dirname, "fonts", "NotoSans-Bold.ttf"),
    },
    {
      regular: "C:\\Windows\\Fonts\\arial.ttf",
      bold: "C:\\Windows\\Fonts\\arialbd.ttf",
    },
    {
      regular: "C:\\Windows\\Fonts\\calibri.ttf",
      bold: "C:\\Windows\\Fonts\\calibrib.ttf",
    },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.regular)) {
      return {
        regular: c.regular,
        bold: fs.existsSync(c.bold) ? c.bold : c.regular,
      };
    }
  }
  return null;
}

/** Register Unicode fonts on a PDFDocument so ₹ amounts render correctly. */
function registerRupeeFonts(doc) {
  const fonts = resolveRupeeFontPaths();
  if (!fonts) return { regular: "Helvetica", bold: "Helvetica-Bold" };
  try {
    doc.registerFont("Rupee", fonts.regular);
    doc.registerFont("Rupee-Bold", fonts.bold);
    return { regular: "Rupee", bold: "Rupee-Bold" };
  } catch (err) {
    console.error("Failed to register rupee fonts:", err.message);
    return { regular: "Helvetica", bold: "Helvetica-Bold" };
  }
}

/** Format amount with ₹ and Indian grouping. */
function formatInrAmount(n, { roundToRupee = false } = {}) {
  const value = roundToRupee
    ? Math.round(Number(n || 0))
    : Number(n || 0);
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: roundToRupee ? 0 : 2,
    maximumFractionDigits: roundToRupee ? 0 : 2,
  });
  return `₹  ${formatted}`;
}

/**
 * WorkAbstract historically keyed "ProjectId" to MasterProject.
 * Estimation now selects MasterWork, so we add "WorkId" -> MasterWork and
 * stop forcing ProjectId as the work key (avoids FK failures + ID collisions).
 */
async function ensureWorkAbstractSchema() {
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      DROP CONSTRAINT IF EXISTS "FK_WorkAbstract_Project"
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ALTER COLUMN "ProjectId" DROP NOT NULL
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ADD COLUMN IF NOT EXISTS "WorkId" integer
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ADD COLUMN IF NOT EXISTS "IsRA" boolean NOT NULL DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ADD COLUMN IF NOT EXISTS "RateString" character varying
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ADD COLUMN IF NOT EXISTS "FinalRate" numeric
  `);
  await pool.query(`
    ALTER TABLE "WorkAbstract"
      ADD COLUMN IF NOT EXISTS "Comment" character varying
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_WorkAbstract_Work'
      ) THEN
        ALTER TABLE "WorkAbstract"
          ADD CONSTRAINT "FK_WorkAbstract_Work"
          FOREIGN KEY ("WorkId") REFERENCES "MasterWork"("MasterWorkId");
      END IF;
    END $$;
  `);
  // Do not auto-migrate ProjectId -> WorkId: MasterWorkId can collide with
  // historical MasterProject ids, which would mix old project abstracts into
  // the Estimation Checked Items List.
  console.log(
    "WorkAbstract schema ensured (WorkId, IsRA, RateString, FinalRate, Comment).",
  );
}

/** Ensure MasterWork.CreationDate exists for Work Master. */
async function ensureMasterWorkCreationDate() {
  await pool.query(`
    ALTER TABLE "MasterWork"
      ADD COLUMN IF NOT EXISTS "CreationDate" date
  `);
  console.log("MasterWork CreationDate ensured.");
}

/** Renumber WorkAbstract.Sequence per Work + SubWork (1, 2, 3…). */
async function renumberWorkAbstractSequences(workId, subWorkId, client = pool) {
  await client.query(
    `
    WITH ranked AS (
      SELECT "WorkAbstractId",
             ROW_NUMBER() OVER (
               ORDER BY COALESCE("Sequence", 999999), "WorkAbstractId"
             ) AS rn
      FROM "WorkAbstract"
      WHERE "WorkId" = $1 AND "SubWorkId" = $2
    )
    UPDATE "WorkAbstract" wa
    SET "Sequence" = ranked.rn
    FROM ranked
    WHERE wa."WorkAbstractId" = ranked."WorkAbstractId"
    `,
    [workId, subWorkId],
  );
}

/** Backfill / repair WorkAbstract sequences SubWork-wise. */
async function ensureWorkAbstractSequence() {
  // Repair groups that have nulls or duplicate Sequence within WorkId+SubWorkId
  await pool.query(`
    WITH problem_groups AS (
      SELECT "WorkId", "SubWorkId"
      FROM "WorkAbstract"
      WHERE "WorkId" IS NOT NULL
      GROUP BY "WorkId", "SubWorkId"
      HAVING COUNT(*) FILTER (WHERE "Sequence" IS NULL) > 0
          OR COUNT(*) <> COUNT(DISTINCT "Sequence")
    ),
    ranked AS (
      SELECT wa."WorkAbstractId",
             ROW_NUMBER() OVER (
               PARTITION BY wa."WorkId", wa."SubWorkId"
               ORDER BY COALESCE(wa."Sequence", 999999), wa."WorkAbstractId"
             ) AS rn
      FROM "WorkAbstract" wa
      INNER JOIN problem_groups pg
        ON pg."WorkId" = wa."WorkId"
       AND pg."SubWorkId" = wa."SubWorkId"
    )
    UPDATE "WorkAbstract" wa
    SET "Sequence" = ranked.rn
    FROM ranked
    WHERE wa."WorkAbstractId" = ranked."WorkAbstractId"
  `);
  console.log("WorkAbstract Sequence ensured (SubWork-wise).");
}

/** Keep MaterialComponentId serial in sync after bulk imports. */
async function ensureMaterialComponentIdSequence() {
  const seqRes = await pool.query(`
    SELECT pg_get_serial_sequence('"MasterMaterialComponent"', 'MaterialComponentId') AS seq
  `);
  const seq = seqRes.rows[0]?.seq;
  if (!seq) return;
  const maxRes = await pool.query(
    `SELECT COALESCE(MAX("MaterialComponentId"), 0)::bigint AS max
     FROM "MasterMaterialComponent"`,
  );
  await pool.query(
    `SELECT setval($1::regclass, GREATEST($2::bigint, 1), true)`,
    [seq, maxRes.rows[0].max],
  );
  console.log("MasterMaterialComponent Id sequence ensured.");
}

/** Ensure WorkMeasurement.Sequence is populated per item (starts at 1). */
async function ensureWorkMeasurementSequence() {
  await pool.query(`
    ALTER TABLE "WorkMeasurement"
      ADD COLUMN IF NOT EXISTS "Sequence" integer
  `);

  // Backfill nulls
  await pool.query(`
    WITH ranked AS (
      SELECT "MeasurementId",
             ROW_NUMBER() OVER (
               PARTITION BY "WorkAbstractId"
               ORDER BY COALESCE("Sequence", 999999), "MeasurementId"
             ) AS rn
      FROM "WorkMeasurement"
      WHERE "WorkAbstractId" IN (
        SELECT DISTINCT "WorkAbstractId"
        FROM "WorkMeasurement"
        WHERE "Sequence" IS NULL
      )
    )
    UPDATE "WorkMeasurement" wm
    SET "Sequence" = ranked.rn
    FROM ranked
    WHERE wm."MeasurementId" = ranked."MeasurementId"
      AND wm."Sequence" IS NULL
  `);

  // Fix duplicate Sequence values within the same item (e.g. parallel inserts)
  await pool.query(`
    WITH dups AS (
      SELECT "WorkAbstractId"
      FROM "WorkMeasurement"
      GROUP BY "WorkAbstractId", "Sequence"
      HAVING COUNT(*) > 1
    ),
    ranked AS (
      SELECT wm."MeasurementId",
             ROW_NUMBER() OVER (
               PARTITION BY wm."WorkAbstractId"
               ORDER BY wm."MeasurementId"
             ) AS rn
      FROM "WorkMeasurement" wm
      INNER JOIN dups d ON d."WorkAbstractId" = wm."WorkAbstractId"
    )
    UPDATE "WorkMeasurement" wm
    SET "Sequence" = ranked.rn
    FROM ranked
    WHERE wm."MeasurementId" = ranked."MeasurementId"
  `);

  console.log("WorkMeasurement Sequence ensured.");
}

async function renumberWorkMeasurementSequences(workAbstractId, client = pool) {
  await client.query(
    `
    WITH ranked AS (
      SELECT "MeasurementId",
             ROW_NUMBER() OVER (
               ORDER BY COALESCE("Sequence", 999999), "MeasurementId"
             ) AS rn
      FROM "WorkMeasurement"
      WHERE "WorkAbstractId" = $1
    )
    UPDATE "WorkMeasurement" wm
    SET "Sequence" = ranked.rn
    FROM ranked
    WHERE wm."MeasurementId" = ranked."MeasurementId"
    `,
    [workAbstractId],
  );
}

// const client = await pool.connect();

// ? new Pool({
//     connectionString,
//     ssl: useSsl ? { rejectUnauthorized: false } : false
//   })
// : new Pool({
//     host: process.env.DB_HOST || "localhost",
//     port: Number(process.env.DB_PORT || 5432),
//     database: process.env.DB_NAME || "01_WERMS",
//     user: process.env.DB_USER || "postgres",
//     password: process.env.DB_PASSWORD || "",
//     ssl: useSsl ? { rejectUnauthorized: false } : false
//   });

// pool.on("error", (err) => {
//   console.error("Unexpected database pool error", err);
// });

app.get("/", async (_req, res) => {
  res.json({ message: "Welcome to Estimate Project Server." });
});

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1");
    res.json({ ok: true, message: "API and DB are reachable." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/api/ssr-regions", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT "SSRRegionId", "SSRRegionName", "SSRRegionShortName", "DOrder", "DOrder1", "Remarks"
       FROM "MasterSSRRegion"
       ORDER BY "DOrder" ASC NULLS LAST, "SSRRegionName" ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/ssr-regions", async (req, res) => {
  const { SSRRegionName, SSRRegionShortName, DOrder, DOrder1, Remarks } =
    req.body;

  if (!SSRRegionName || !SSRRegionShortName) {
    return res.status(400).json({
      message: "SSRRegionName and SSRRegionShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterSSRRegion"
       ("SSRRegionName", "SSRRegionShortName", "DOrder", "DOrder1", "Remarks")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "SSRRegionId", "SSRRegionName", "SSRRegionShortName", "DOrder", "DOrder1", "Remarks"`,
      [
        SSRRegionName.trim(),
        SSRRegionShortName.trim(),
        DOrder === "" || DOrder === null ? null : Number(DOrder),
        DOrder1 === "" || DOrder1 === null ? null : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
      ],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/ssr-categories/:regionId", async (req, res) => {
  const { regionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT "SSRCategoryId", "SSRRegionId", "SSRCategoryName", "SSRCategoryShortName"
       FROM "MasterSSRCategory"
       WHERE "SSRRegionId" = $1
       ORDER BY "DOrder" ASC NULLS LAST, "SSRCategoryName" ASC`,
      [regionId],
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/ssr-sub-categories", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT sc."SSRSubCategoryId", sc."SSRCategoryId",
              c."SSRCategoryName", c."SSRCategoryShortName", c."SSRRegionId",
              r."SSRRegionName", r."SSRRegionShortName",
              sc."SSRSubCategoryName", sc."SSRSubCategoryShortName",
              sc."DOrder", sc."DOrder1", sc."Remarks", sc."MarkForDeletion"
       FROM "MasterSSRSubCategory" sc
       INNER JOIN "MasterSSRCategory" c ON c."SSRCategoryId" = sc."SSRCategoryId"
       INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = c."SSRRegionId"
       ORDER BY sc."DOrder" ASC NULLS LAST, sc."SSRSubCategoryName" ASC`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/ssr-sub-categories/:categoryId", async (req, res) => {
  const { categoryId } = req.params;
  console.log("Category ID: ", categoryId);
  try {
    const result = await pool.query(
      `SELECT "SSRSubCategoryId", "SSRSubCategoryName" FROM "MasterSSRSubCategory" WHERE "SSRCategoryId" = $1 ORDER BY "DOrder";`,
      [categoryId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

app.post("/api/ssr-sub-categories", async (req, res) => {
  const {
    SSRCategoryId,
    SSRSubCategoryName,
    SSRSubCategoryShortName,
    DOrder,
    DOrder1,
    Remarks,
    MarkForDeletion,
  } = req.body;

  if (!SSRCategoryId || !SSRSubCategoryName || !SSRSubCategoryShortName) {
    return res.status(400).json({
      message:
        "SSRCategoryId, SSRSubCategoryName and SSRSubCategoryShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterSSRSubCategory"
       ("SSRCategoryId", "SSRSubCategoryName", "SSRSubCategoryShortName", "DOrder", "DOrder1", "Remarks", "MarkForDeletion")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "SSRSubCategoryId", "SSRCategoryId", "SSRSubCategoryName", "SSRSubCategoryShortName",
                 "DOrder", "DOrder1", "Remarks", "MarkForDeletion"`,
      [
        Number(SSRCategoryId),
        SSRSubCategoryName.trim(),
        SSRSubCategoryShortName.trim(),
        DOrder === "" || DOrder === null || DOrder === undefined
          ? null
          : Number(DOrder),
        DOrder1 === "" || DOrder1 === null || DOrder1 === undefined
          ? null
          : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
        Boolean(MarkForDeletion),
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/ssr-sub-categories/:id", async (req, res) => {
  const { id } = req.params;
  const {
    SSRCategoryId,
    SSRSubCategoryName,
    SSRSubCategoryShortName,
    DOrder,
    DOrder1,
    Remarks,
    MarkForDeletion,
  } = req.body;

  if (!SSRCategoryId || !SSRSubCategoryName || !SSRSubCategoryShortName) {
    return res.status(400).json({
      message:
        "SSRCategoryId, SSRSubCategoryName and SSRSubCategoryShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterSSRSubCategory"
       SET "SSRCategoryId" = $1,
           "SSRSubCategoryName" = $2,
           "SSRSubCategoryShortName" = $3,
           "DOrder" = $4,
           "DOrder1" = $5,
           "Remarks" = $6,
           "MarkForDeletion" = $7
       WHERE "SSRSubCategoryId" = $8
       RETURNING "SSRSubCategoryId", "SSRCategoryId", "SSRSubCategoryName", "SSRSubCategoryShortName",
                 "DOrder", "DOrder1", "Remarks", "MarkForDeletion"`,
      [
        Number(SSRCategoryId),
        SSRSubCategoryName.trim(),
        SSRSubCategoryShortName.trim(),
        DOrder === "" || DOrder === null || DOrder === undefined
          ? null
          : Number(DOrder),
        DOrder1 === "" || DOrder1 === null || DOrder1 === undefined
          ? null
          : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
        Boolean(MarkForDeletion),
        Number(id),
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Subcategory not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/master-years", async (req, res) => {
  const { regionId } = req.query;
  try {
    if (regionId !== undefined && regionId !== null && String(regionId).trim() !== "") {
      const result = await pool.query(
        `SELECT DISTINCT y."YearId", y."Year", y."DOrder", y."DOrder1", y."Remarks"
         FROM "MasterYear" y
         INNER JOIN "MasterItem" i ON i."SSRYearId" = y."YearId"
         WHERE i."RegionId" = $1
         ORDER BY y."DOrder" ASC NULLS LAST, y."Year" ASC`,
        [Number(regionId)],
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT "YearId", "Year", "DOrder", "DOrder1", "Remarks"
       FROM "MasterYear"
       ORDER BY "DOrder" ASC NULLS LAST, "Year" ASC`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/ssr-items-load", async (req, res) => {
  const { regionId, categoryId, subCategoryId, ssrYearId } = req.query;
  console.log("Region Id: ", regionId);
  console.log("Category Id: ", categoryId);
  console.log("Sub Category Id: ", subCategoryId);
  console.log("SSR Year Id: ", ssrYearId);

  if (!regionId || !categoryId) {
    return res.status(400).json({
      message: "regionId and categoryId are required.",
    });
  }

  try {
    const params = [regionId, categoryId];
    let query = `
      SELECT
        i."ItemId",
        i."ItemNumber",
        i."ItemDescription",
        i."CompletedRate",
        i."UnitId",
        i."IsFinal",
        i."IsChild",
        i."ParentId",
        i."SSRYearId",
        u."UnitShortName"
      FROM "MasterItem" i
      LEFT JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
      WHERE i."RegionId" = $1
        AND i."CategoryId" = $2`;

    if (ssrYearId !== undefined && ssrYearId !== null && String(ssrYearId).trim() !== "") {
      params.push(ssrYearId);
      query += ` AND i."SSRYearId" = $${params.length}`;
    }

    if (subCategoryId !== undefined && subCategoryId !== null && String(subCategoryId).trim() !== "") {
      params.push(subCategoryId);
      query += ` AND i."SubCategoryId" = $${params.length}`;
    }

    query += ` ORDER BY i."ItemNumber" ASC`;

    const result = await pool.query(query, params);
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/work-abstract-get", async (req, res) => {
  const { workId, subWorkId } = req.query;
  console.log("Work Id: ", workId);
  console.log("Sub Work Id: ", subWorkId);
  console.log("Get Checked Items Called");
  try {
    const result = await pool.query(
      `SELECT "ItemId" FROM "WorkAbstract"
       WHERE "WorkId" = $1 AND "SubWorkId" = $2
       ORDER BY "ItemId";`,
      [workId, subWorkId],
    );
    console.log(result);
    console.log("Checked Items: ", result.rows);
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.put("/api/ssr-regions/:id", async (req, res) => {
  const { id } = req.params;
  const { SSRRegionName, SSRRegionShortName, DOrder, DOrder1, Remarks } =
    req.body;

  if (!SSRRegionName || !SSRRegionShortName) {
    return res.status(400).json({
      message: "SSRRegionName and SSRRegionShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterSSRRegion"
       SET "SSRRegionName" = $1,
           "SSRRegionShortName" = $2,
           "DOrder" = $3,
           "DOrder1" = $4,
           "Remarks" = $5
       WHERE "SSRRegionId" = $6
       RETURNING "SSRRegionId", "SSRRegionName", "SSRRegionShortName", "DOrder", "DOrder1", "Remarks"`,
      [
        SSRRegionName.trim(),
        SSRRegionShortName.trim(),
        DOrder === "" || DOrder === null ? null : Number(DOrder),
        DOrder1 === "" || DOrder1 === null ? null : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
        Number(id),
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Region not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/ssr-categories", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c."SSRCategoryId", c."SSRRegionId", r."SSRRegionName", r."SSRRegionShortName",
              c."SSRCategoryName", c."SSRCategoryShortName", c."DOrder", c."DOrder1", c."Remarks"
       FROM "MasterSSRCategory" c
       INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = c."SSRRegionId"
       ORDER BY c."DOrder" ASC NULLS LAST, c."SSRCategoryName" ASC`,
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/load-projects", async (req, res) => {
  const { org_id } = req.query;
  console.log("Projects Load Called.");
  console.log("Org Id Passed: ", org_id);
  try {
    const params = [];
    let whereClause = "";
    if (org_id) {
      params.push(org_id);
      whereClause = `WHERE p."OrganizationID" = $1`;
    }

    const result = await pool.query(
      `SELECT p."ProjectId", p."ProjectName", p."ProjectCode", p."OrganizationID",
              o."OrgName", o."OrgCode",
              p."ClientName", p."ClientAddress", p."ClientContactInfo",
              p."DOrder", p."Remarks", p."ArchAssigned", p."EngrAssigned",
              p."MarkForDeletion"
       FROM "MasterProject" p
       LEFT JOIN "MasterOrganization" o ON o."OrganizationId" = p."OrganizationID"
       ${whereClause}
       ORDER BY COALESCE(p."DOrder", 999999), o."OrgName" NULLS LAST, p."ProjectCode"`,
      params,
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/org-users", async (req, res) => {
  const organizationId = Number(req.query.organizationId || req.query.org_id);
  if (!organizationId) {
    return res
      .status(400)
      .json({ message: "organizationId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "UserId", "UserName", "UserLoginName"
       FROM "MasterUser"
       WHERE "OrganizationId" = $1
         AND COALESCE("MarkForDeletion", false) = false
       ORDER BY "UserName"`,
      [organizationId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/countries", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT "CountryId", "CountryName"
       FROM "MasterCountry"
       WHERE COALESCE("MarkForDeletion", false) = false
       ORDER BY COALESCE("DOrder", 999999), "CountryName"`,
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/states", async (req, res) => {
  const countryId = Number(req.query.countryId);
  if (!countryId) {
    return res
      .status(400)
      .json({ message: "countryId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "StateId", "CountryId", "StateName"
       FROM "MasterState"
       WHERE "CountryId" = $1
         AND COALESCE("MarkForDeletion", false) = false
       ORDER BY COALESCE("DOrder", 999999), "StateName"`,
      [countryId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/districts", async (req, res) => {
  const stateId = Number(req.query.stateId);
  if (!stateId) {
    return res
      .status(400)
      .json({ message: "stateId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "DistrictId", "StateId", "DistrictName"
       FROM "MasterDistrict"
       WHERE "StateId" = $1
         AND COALESCE("MarkForDeletion", false) = false
       ORDER BY COALESCE("DOrder", 999999), "DistrictName"`,
      [stateId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/master-organizations", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT o."OrganizationId", o."OrgCode", o."OrgName", o."OrgAddress",
              o."OrgCountryId", o."OrgStateId", o."OrgDistrictId",
              o."OrgPinZip", o."OrgEmail", o."OrgContact",
              o."OrgContactPerson", o."OrgConPerDesig",
              o."DOrder", o."DOrder1", o."MarkForDeletion",
              c."CountryName", s."StateName", d."DistrictName"
       FROM "MasterOrganization" o
       LEFT JOIN "MasterCountry" c ON c."CountryId" = o."OrgCountryId"
       LEFT JOIN "MasterState" s ON s."StateId" = o."OrgStateId"
       LEFT JOIN "MasterDistrict" d ON d."DistrictId" = o."OrgDistrictId"
       ORDER BY COALESCE(o."DOrder", 999999), o."OrgCode"`,
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/master-organizations", async (req, res) => {
  const {
    orgCode,
    orgName,
    orgAddress,
    orgCountryId,
    orgStateId,
    orgDistrictId,
    orgPinZip,
    orgEmail,
    orgContact,
    orgContactPerson,
    orgConPerDesig,
    dOrder,
    dOrder1,
    markForDeletion,
  } = req.body || {};

  if (!orgCode || !String(orgCode).trim()) {
    return res.status(400).json({ message: "Organization code is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterOrganization"
        ("OrgCode", "OrgName", "OrgAddress", "OrgCountryId", "OrgStateId",
         "OrgDistrictId", "OrgPinZip", "OrgEmail", "OrgContact",
         "OrgContactPerson", "OrgConPerDesig", "DOrder", "DOrder1",
         "MarkForDeletion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING "OrganizationId", "OrgCode", "OrgName", "OrgAddress",
                 "OrgCountryId", "OrgStateId", "OrgDistrictId",
                 "OrgPinZip", "OrgEmail", "OrgContact",
                 "OrgContactPerson", "OrgConPerDesig",
                 "DOrder", "DOrder1", "MarkForDeletion"`,
      [
        String(orgCode).trim(),
        orgName ? String(orgName).trim() : null,
        orgAddress ? String(orgAddress).trim() : null,
        orgCountryId ? Number(orgCountryId) : null,
        orgStateId ? Number(orgStateId) : null,
        orgDistrictId ? Number(orgDistrictId) : null,
        orgPinZip ? String(orgPinZip).trim() : null,
        orgEmail ? String(orgEmail).trim() : null,
        orgContact ? String(orgContact).trim() : null,
        orgContactPerson ? String(orgContactPerson).trim() : null,
        orgConPerDesig ? String(orgConPerDesig).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        dOrder1 === "" || dOrder1 === null || dOrder1 === undefined
          ? null
          : Number(dOrder1),
        Boolean(markForDeletion),
      ],
    );
    return res.status(201).json({
      message: "Organization created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/master-organizations/:id", async (req, res) => {
  const organizationId = Number(req.params.id);
  if (!organizationId) {
    return res
      .status(400)
      .json({ message: "Valid organization id is required." });
  }

  const {
    orgCode,
    orgName,
    orgAddress,
    orgCountryId,
    orgStateId,
    orgDistrictId,
    orgPinZip,
    orgEmail,
    orgContact,
    orgContactPerson,
    orgConPerDesig,
    dOrder,
    dOrder1,
    markForDeletion,
  } = req.body || {};

  if (!orgCode || !String(orgCode).trim()) {
    return res.status(400).json({ message: "Organization code is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterOrganization"
       SET "OrgCode" = $1,
           "OrgName" = $2,
           "OrgAddress" = $3,
           "OrgCountryId" = $4,
           "OrgStateId" = $5,
           "OrgDistrictId" = $6,
           "OrgPinZip" = $7,
           "OrgEmail" = $8,
           "OrgContact" = $9,
           "OrgContactPerson" = $10,
           "OrgConPerDesig" = $11,
           "DOrder" = $12,
           "DOrder1" = $13,
           "MarkForDeletion" = $14
       WHERE "OrganizationId" = $15
       RETURNING "OrganizationId", "OrgCode", "OrgName", "OrgAddress",
                 "OrgCountryId", "OrgStateId", "OrgDistrictId",
                 "OrgPinZip", "OrgEmail", "OrgContact",
                 "OrgContactPerson", "OrgConPerDesig",
                 "DOrder", "DOrder1", "MarkForDeletion"`,
      [
        String(orgCode).trim(),
        orgName ? String(orgName).trim() : null,
        orgAddress ? String(orgAddress).trim() : null,
        orgCountryId ? Number(orgCountryId) : null,
        orgStateId ? Number(orgStateId) : null,
        orgDistrictId ? Number(orgDistrictId) : null,
        orgPinZip ? String(orgPinZip).trim() : null,
        orgEmail ? String(orgEmail).trim() : null,
        orgContact ? String(orgContact).trim() : null,
        orgContactPerson ? String(orgContactPerson).trim() : null,
        orgConPerDesig ? String(orgConPerDesig).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        dOrder1 === "" || dOrder1 === null || dOrder1 === undefined
          ? null
          : Number(dOrder1),
        Boolean(markForDeletion),
        organizationId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Organization not found." });
    }

    return res.json({
      message: "Organization updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/user-categories", async (req, res) => {
  const organizationId = Number(req.query.organizationId);
  if (!organizationId) {
    return res
      .status(400)
      .json({ message: "organizationId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "UserCategoryId", "UserCategoryName", "OrganizationId"
       FROM "MasterUserCategory"
       WHERE "OrganizationId" = $1
         AND COALESCE("MarkForDeletion", false) = false
       ORDER BY "UserCategoryName"`,
      [organizationId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/master-users", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u."UserId", u."UserCategoryId", u."OrganizationId", u."DesignationId",
              u."UserLoginName", u."UserName", u."UserAddress",
              u."UserDateOfJoining", u."UserDateOfBirth", u."UserContact",
              u."UserEmail", u."MarkForDeletion", u."IsActive",
              u."DateOfRelieving", u."DOrder", u."Remarks",
              o."OrgCode", o."OrgName",
              d."DesignationName",
              uc."UserCategoryName"
       FROM "MasterUser" u
       INNER JOIN "MasterOrganization" o ON o."OrganizationId" = u."OrganizationId"
       INNER JOIN "MasterDesignation" d ON d."DesignationId" = u."DesignationId"
       INNER JOIN "MasterUserCategory" uc ON uc."UserCategoryId" = u."UserCategoryId"
       ORDER BY COALESCE(u."DOrder", 999999), u."UserName"`,
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/master-users", async (req, res) => {
  const {
    userCategoryId,
    organizationId,
    designationId,
    userLoginName,
    userName,
    userAddress,
    userDateOfJoining,
    userDateOfBirth,
    userContact,
    userEmail,
    userPWD,
    isActive,
    dateOfRelieving,
    dOrder,
    remarks,
    markForDeletion,
  } = req.body || {};

  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!userCategoryId) {
    return res.status(400).json({ message: "User category is required." });
  }
  if (!designationId) {
    return res.status(400).json({ message: "Designation is required." });
  }
  if (!userLoginName || !String(userLoginName).trim()) {
    return res.status(400).json({ message: "User login name is required." });
  }
  if (!userName || !String(userName).trim()) {
    return res.status(400).json({ message: "User name is required." });
  }
  if (!userPWD || !String(userPWD).trim()) {
    return res.status(400).json({ message: "Password is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterUser"
        ("UserCategoryId", "OrganizationId", "DesignationId", "UserLoginName",
         "UserName", "UserAddress", "UserDateOfJoining", "UserDateOfBirth",
         "UserContact", "UserEmail", "MarkForDeletion", "UserPWD", "IsActive",
         "DateOfRelieving", "DOrder", "Remarks")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING "UserId", "UserCategoryId", "OrganizationId", "DesignationId",
                 "UserLoginName", "UserName", "UserAddress",
                 "UserDateOfJoining", "UserDateOfBirth", "UserContact",
                 "UserEmail", "MarkForDeletion", "IsActive",
                 "DateOfRelieving", "DOrder", "Remarks"`,
      [
        Number(userCategoryId),
        Number(organizationId),
        Number(designationId),
        String(userLoginName).trim(),
        String(userName).trim(),
        userAddress ? String(userAddress).trim() : null,
        userDateOfJoining || null,
        userDateOfBirth || null,
        userContact ? String(userContact).trim() : null,
        userEmail ? String(userEmail).trim() : null,
        Boolean(markForDeletion),
        String(userPWD),
        isActive === undefined || isActive === null ? true : Boolean(isActive),
        dateOfRelieving || null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        remarks ? String(remarks).trim() : null,
      ],
    );
    return res.status(201).json({
      message: "User created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/master-users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Valid user id is required." });
  }

  const {
    userCategoryId,
    organizationId,
    designationId,
    userLoginName,
    userName,
    userAddress,
    userDateOfJoining,
    userDateOfBirth,
    userContact,
    userEmail,
    userPWD,
    isActive,
    dateOfRelieving,
    dOrder,
    remarks,
    markForDeletion,
  } = req.body || {};

  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!userCategoryId) {
    return res.status(400).json({ message: "User category is required." });
  }
  if (!designationId) {
    return res.status(400).json({ message: "Designation is required." });
  }
  if (!userLoginName || !String(userLoginName).trim()) {
    return res.status(400).json({ message: "User login name is required." });
  }
  if (!userName || !String(userName).trim()) {
    return res.status(400).json({ message: "User name is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterUser"
       SET "UserCategoryId" = $1,
           "OrganizationId" = $2,
           "DesignationId" = $3,
           "UserLoginName" = $4,
           "UserName" = $5,
           "UserAddress" = $6,
           "UserDateOfJoining" = $7,
           "UserDateOfBirth" = $8,
           "UserContact" = $9,
           "UserEmail" = $10,
           "MarkForDeletion" = $11,
           "UserPWD" = CASE
             WHEN $12::text IS NULL OR TRIM($12::text) = '' THEN "UserPWD"
             ELSE $12::text
           END,
           "IsActive" = $13,
           "DateOfRelieving" = $14,
           "DOrder" = $15,
           "Remarks" = $16
       WHERE "UserId" = $17
       RETURNING "UserId", "UserCategoryId", "OrganizationId", "DesignationId",
                 "UserLoginName", "UserName", "UserAddress",
                 "UserDateOfJoining", "UserDateOfBirth", "UserContact",
                 "UserEmail", "MarkForDeletion", "IsActive",
                 "DateOfRelieving", "DOrder", "Remarks"`,
      [
        Number(userCategoryId),
        Number(organizationId),
        Number(designationId),
        String(userLoginName).trim(),
        String(userName).trim(),
        userAddress ? String(userAddress).trim() : null,
        userDateOfJoining || null,
        userDateOfBirth || null,
        userContact ? String(userContact).trim() : null,
        userEmail ? String(userEmail).trim() : null,
        Boolean(markForDeletion),
        userPWD ? String(userPWD) : null,
        isActive === undefined || isActive === null ? true : Boolean(isActive),
        dateOfRelieving || null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        remarks ? String(remarks).trim() : null,
        userId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({
      message: "User updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/insert-work-abstract", async (req, res) => {
  const { projectId, workId, subWorkId, items } = req.body;
  const resolvedWorkId = Number(workId || projectId);
  const resolvedSubWorkId = Number(subWorkId);
  const itemIds = Array.isArray(items)
    ? [...new Set(items.map((id) => Number(id)).filter((id) => id > 0))]
    : [];

  console.log("Work Id (Work Abstract): ", resolvedWorkId);
  console.log("SubWork Id (Work Abstract): ", resolvedSubWorkId);
  console.log("Items List (Work Abstract): ", itemIds);

  if (!resolvedWorkId || !resolvedSubWorkId) {
    return res.status(400).json({
      message: "Work and Sub Work are required.",
    });
  }
  if (itemIds.length === 0) {
    return res.status(400).json({
      message: "Please check at least one item in the SSR Item List.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize Sequence assignment per Work + SubWork
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [
      resolvedWorkId,
      resolvedSubWorkId,
    ]);

    const workRow = await client.query(
      `SELECT "MasterWorkId", "ProjectId" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    if (!workRow.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Selected Work was not found." });
    }
    const linkedProjectId = workRow.rows[0].ProjectId
      ? Number(workRow.rows[0].ProjectId)
      : null;

    const existing = await client.query(
      `SELECT "ItemId" FROM "WorkAbstract"
       WHERE "WorkId" = $1 AND "SubWorkId" = $2 AND "ItemId" = ANY($3::int[])`,
      [resolvedWorkId, resolvedSubWorkId, itemIds],
    );
    const already = new Set(existing.rows.map((r) => Number(r.ItemId)));
    const toInsert = itemIds.filter((id) => !already.has(id));

    const maxSeq = await client.query(
      `SELECT COALESCE(MAX("Sequence"), 0) AS "MaxSequence"
       FROM "WorkAbstract"
       WHERE "WorkId" = $1 AND "SubWorkId" = $2`,
      [resolvedWorkId, resolvedSubWorkId],
    );
    let nextSequence = Number(maxSeq.rows[0]?.MaxSequence || 0) + 1;

    let inserted = 0;
    for (const itemId of toInsert) {
      await client.query(
        `INSERT INTO "WorkAbstract"
        ("ProjectId", "WorkId", "SubWorkId", "ItemId", "Sequence")
        VALUES ($1, $2, $3, $4, $5);`,
        [
          linkedProjectId,
          resolvedWorkId,
          resolvedSubWorkId,
          itemId,
          nextSequence,
        ],
      );
      nextSequence += 1;
      inserted += 1;
    }

    await client.query("COMMIT");
    return res.status(200).send({
      message:
        inserted === 0
          ? "Selected items were already in the Checked Items List."
          : `Inserted ${inserted} item(s) into the Checked Items List.`,
      inserted,
      skipped: itemIds.length - inserted,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/insert-work", async (req, res) => {
  const { workName, projectId, userId, remarks, markForDeletion, creationDate } =
    req.body;

  if (!workName || !String(workName).trim()) {
    return res.status(400).json({ message: "Work name is required." });
  }
  if (!userId) {
    return res.status(400).json({ message: "User is required." });
  }

  const projectIdValue =
    projectId === null ||
    projectId === undefined ||
    projectId === "" ||
    projectId === 0
      ? null
      : Number(projectId);

  const creationDateValue =
    creationDate && String(creationDate).trim()
      ? String(creationDate).trim().slice(0, 10)
      : null;

  try {
    await ensureMasterWorkCreationDate();
    const result = await pool.query(
      `INSERT INTO "MasterWork"
       ("WorkName", "ProjectId", "UserId", "Remarks", "MarkForDeletion", "CreationDate")
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE))
       RETURNING "MasterWorkId", "WorkName", "ProjectId", "UserId", "Remarks",
                 "MarkForDeletion",
                 to_char("CreationDate", 'YYYY-MM-DD') AS "CreationDate"`,
      [
        String(workName).trim(),
        projectIdValue,
        Number(userId),
        remarks ? String(remarks).trim() : null,
        Boolean(markForDeletion),
        creationDateValue,
      ],
    );
    return res.status(201).send({
      message: "Work Created Successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/load-works", async (req, res) => {
  const { userId, organizationId, userCategory } = req.query;

  if (!userId) {
    return res.status(400).json({ message: "userId is required." });
  }

  const category = String(userCategory || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const isSuperAdmin = category === "superadmin";
  const isOrgAdmin = category === "orgadmin";

  try {
    await ensureMasterWorkCreationDate();
    const selectSql = `
      SELECT w."MasterWorkId", w."WorkName", w."ProjectId", w."UserId",
             w."Remarks", w."MarkForDeletion",
             to_char(w."CreationDate", 'YYYY-MM-DD') AS "CreationDate",
             p."ProjectCode", p."ProjectName",
             COALESCE(p."OrganizationID", u."OrganizationId") AS "OrganizationID",
             COALESCE(o."OrgName", uo."OrgName") AS "OrgName",
             COALESCE(o."OrgCode", uo."OrgCode") AS "OrgCode",
             u."UserName"
      FROM "MasterWork" w
      LEFT JOIN "MasterProject" p ON p."ProjectId" = w."ProjectId"
      LEFT JOIN "MasterOrganization" o ON o."OrganizationId" = p."OrganizationID"
      LEFT JOIN "MasterUser" u ON u."UserId" = w."UserId"
      LEFT JOIN "MasterOrganization" uo ON uo."OrganizationId" = u."OrganizationId"
    `;

    let result;
    if (isSuperAdmin) {
      result = await pool.query(
        `${selectSql}
         ORDER BY COALESCE(p."OrganizationID", u."OrganizationId") ASC NULLS LAST,
                  p."ProjectCode" ASC NULLS LAST,
                  w."MasterWorkId" ASC`,
      );
    } else if (isOrgAdmin) {
      if (!organizationId) {
        return res
          .status(400)
          .json({ message: "organizationId is required for OrgAdmin." });
      }
      result = await pool.query(
        `${selectSql}
         WHERE COALESCE(p."OrganizationID", u."OrganizationId") = $1
         ORDER BY p."ProjectCode" ASC NULLS LAST,
                  w."MasterWorkId" ASC`,
        [Number(organizationId)],
      );
    } else {
      result = await pool.query(
        `${selectSql}
         WHERE w."UserId" = $1
         ORDER BY p."ProjectCode" ASC NULLS LAST,
                  w."MasterWorkId" ASC`,
        [Number(userId)],
      );
    }

    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.put("/api/master-works/:id", async (req, res) => {
  const workId = Number(req.params.id);
  if (!workId) {
    return res.status(400).json({ message: "Valid work id is required." });
  }

  const { workName, projectId, remarks, markForDeletion, creationDate } =
    req.body || {};

  if (!workName || !String(workName).trim()) {
    return res.status(400).json({ message: "Work name is required." });
  }

  const projectIdValue =
    projectId === null ||
    projectId === undefined ||
    projectId === "" ||
    projectId === 0
      ? null
      : Number(projectId);

  const creationDateValue =
    creationDate && String(creationDate).trim()
      ? String(creationDate).trim().slice(0, 10)
      : null;

  try {
    await ensureMasterWorkCreationDate();
    const result = await pool.query(
      `UPDATE "MasterWork"
       SET "WorkName" = $1,
           "ProjectId" = $2,
           "Remarks" = $3,
           "MarkForDeletion" = $4,
           "CreationDate" = COALESCE($5::date, CURRENT_DATE)
       WHERE "MasterWorkId" = $6
       RETURNING "MasterWorkId", "WorkName", "ProjectId", "UserId", "Remarks",
                 "MarkForDeletion",
                 to_char("CreationDate", 'YYYY-MM-DD') AS "CreationDate"`,
      [
        String(workName).trim(),
        projectIdValue,
        remarks ? String(remarks).trim() : null,
        Boolean(markForDeletion),
        creationDateValue,
        workId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Work not found." });
    }

    return res.json({
      message: "Work updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/load-sub-works", async (req, res) => {
  const { projectId, workId, masterWorkId } = req.query;
  const resolvedWorkId = workId || masterWorkId;
  console.log("Project Id: ", projectId);
  console.log("Work Id: ", resolvedWorkId);

  try {
    if (resolvedWorkId) {
      const result = await pool.query(
        `SELECT sw."SubWorkId", sw."SubWorkName", sw."WorkId",
                sw."Sequence", sw."MarkForDeletion",
                w."WorkName", p."ProjectCode", p."ProjectName", w."ProjectId"
         FROM "MasterSubWork" sw
         INNER JOIN "MasterWork" w ON w."MasterWorkId" = sw."WorkId"
         LEFT JOIN "MasterProject" p ON p."ProjectId" = w."ProjectId"
         WHERE sw."WorkId" = $1
         ORDER BY COALESCE(sw."Sequence", 999999), sw."SubWorkId"`,
        [Number(resolvedWorkId)],
      );
      return res.status(200).send({ data: result.rows });
    }

    if (!projectId) {
      return res.status(400).json({
        message: "workId or projectId query parameter is required.",
      });
    }

    // Estimation: load sub-works for all MasterWorks under a project
    const result = await pool.query(
      `SELECT sw."SubWorkId", sw."SubWorkName", sw."WorkId",
              sw."Sequence", sw."MarkForDeletion",
              w."WorkName", w."ProjectId"
       FROM "MasterSubWork" sw
       INNER JOIN "MasterWork" w ON w."MasterWorkId" = sw."WorkId"
       WHERE w."ProjectId" = $1
       ORDER BY COALESCE(sw."Sequence", 999999), sw."SubWorkId"`,
      [Number(projectId)],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.get("/api/load-all-sub-works", async (req, res) => {
  console.log("Load All Sub Works Called.");
  try {
    const result = await pool.query(
      `SELECT sw."SubWorkId", sw."SubWorkName", sw."WorkId",
              sw."Sequence", sw."MarkForDeletion",
              w."WorkName"
       FROM "MasterSubWork" sw
       LEFT JOIN "MasterWork" w ON w."MasterWorkId" = sw."WorkId"
       ORDER BY sw."SubWorkId"`,
    );
    return res.status(200).send({ data: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/ssr-categories", async (req, res) => {
  const {
    SSRRegionId,
    SSRCategoryName,
    SSRCategoryShortName,
    DOrder,
    DOrder1,
    Remarks,
  } = req.body;

  if (!SSRRegionId || !SSRCategoryName || !SSRCategoryShortName) {
    return res.status(400).json({
      message:
        "SSRRegionId, SSRCategoryName and SSRCategoryShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterSSRCategory"
       ("SSRRegionId", "SSRCategoryName", "SSRCategoryShortName", "DOrder", "DOrder1", "Remarks")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING "SSRCategoryId", "SSRRegionId", "SSRCategoryName", "SSRCategoryShortName", "DOrder", "DOrder1", "Remarks"`,
      [
        Number(SSRRegionId),
        SSRCategoryName.trim(),
        SSRCategoryShortName.trim(),
        DOrder === "" || DOrder === null ? null : Number(DOrder),
        DOrder1 === "" || DOrder1 === null ? null : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/ssr-categories/:id", async (req, res) => {
  const { id } = req.params;
  const {
    SSRRegionId,
    SSRCategoryName,
    SSRCategoryShortName,
    DOrder,
    DOrder1,
    Remarks,
  } = req.body;

  if (!SSRRegionId || !SSRCategoryName || !SSRCategoryShortName) {
    return res.status(400).json({
      message:
        "SSRRegionId, SSRCategoryName and SSRCategoryShortName are required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterSSRCategory"
       SET "SSRRegionId" = $1,
           "SSRCategoryName" = $2,
           "SSRCategoryShortName" = $3,
           "DOrder" = $4,
           "DOrder1" = $5,
           "Remarks" = $6
       WHERE "SSRCategoryId" = $7
       RETURNING "SSRCategoryId", "SSRRegionId", "SSRCategoryName", "SSRCategoryShortName", "DOrder", "DOrder1", "Remarks"`,
      [
        Number(SSRRegionId),
        SSRCategoryName.trim(),
        SSRCategoryShortName.trim(),
        DOrder === "" || DOrder === null ? null : Number(DOrder),
        DOrder1 === "" || DOrder1 === null ? null : Number(DOrder1),
        Remarks ? Remarks.trim() : null,
        Number(id),
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Category not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/get-items-checked-list", async (req, res) => {
  console.log("Get Checked Items List Called.");
  const { projectId, workId, subWorkId } = req.query;
  const resolvedWorkId = Number(workId || projectId);
  const resolvedSubWorkId = Number(subWorkId);
  console.log("Work Id: ", resolvedWorkId);
  console.log("Sub Work Id: ", resolvedSubWorkId);
  if (!resolvedWorkId || !resolvedSubWorkId) {
    return res
      .status(400)
      .send({ message: "WorkId and SubWorkId are required." });
  }
  try {
    // Heal duplicate / null sequences for this SubWork
    const healCheck = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE "Sequence" IS NULL)::int AS nulls,
         COUNT(*)::int AS total,
         COUNT(DISTINCT "Sequence")::int AS distinct_seq
       FROM "WorkAbstract"
       WHERE "WorkId" = $1 AND "SubWorkId" = $2`,
      [resolvedWorkId, resolvedSubWorkId],
    );
    const heal = healCheck.rows[0];
    if (
      heal &&
      (Number(heal.nulls) > 0 || Number(heal.total) !== Number(heal.distinct_seq))
    ) {
      await renumberWorkAbstractSequences(resolvedWorkId, resolvedSubWorkId);
    }

    const result = await pool.query(
      `SELECT w."WorkAbstractId", w."ItemId", w."Sequence", w."Comment",
              i."ItemNumber", i."ItemDescription",
              i."CompletedRate", u."UnitShortName"
       FROM "WorkAbstract" w
       JOIN "MasterItem" i ON i."ItemId" = w."ItemId"
       LEFT JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
       WHERE w."WorkId" = $1 AND w."SubWorkId" = $2
       ORDER BY COALESCE(w."Sequence", 999999) ASC, w."WorkAbstractId" ASC`,
      [resolvedWorkId, resolvedSubWorkId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

/** Save Comment on a WorkAbstract row (checked item). Max 500 characters. */
app.put("/api/work-abstract/:workAbstractId/comment", async (req, res) => {
  const workAbstractId = Number(req.params.workAbstractId);
  if (!workAbstractId) {
    return res.status(400).json({ message: "workAbstractId is required." });
  }
  const COMMENT_MAX_LEN = 500;
  let comment =
    req.body?.comment === null || req.body?.comment === undefined
      ? null
      : String(req.body.comment);
  if (comment !== null) {
    if (comment.length > COMMENT_MAX_LEN) {
      return res.status(400).json({
        message: `Comment cannot exceed ${COMMENT_MAX_LEN} characters.`,
      });
    }
    comment = comment.trim() || null;
  }

  try {
    await ensureWorkAbstractSchema();
    const result = await pool.query(
      `UPDATE "WorkAbstract"
       SET "Comment" = $1
       WHERE "WorkAbstractId" = $2
       RETURNING "WorkAbstractId", "ItemId", "Comment"`,
      [comment, workAbstractId],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Checked item was not found." });
    }
    return res.status(200).json({
      message: "Comment saved successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.put("/api/work-abstract/reorder", async (req, res) => {
  const { workId, projectId, subWorkId, orderedIds } = req.body || {};
  const resolvedWorkId = Number(workId || projectId);
  const resolvedSubWorkId = Number(subWorkId);
  const ids = Array.isArray(orderedIds)
    ? orderedIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (!resolvedWorkId || !resolvedSubWorkId || ids.length === 0) {
    return res.status(400).json({
      message: "workId, subWorkId and orderedIds are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT "WorkAbstractId" FROM "WorkAbstract"
       WHERE "WorkId" = $1 AND "SubWorkId" = $2`,
      [resolvedWorkId, resolvedSubWorkId],
    );
    const existingIds = new Set(
      existing.rows.map((r) => Number(r.WorkAbstractId)),
    );
    if (
      ids.length !== existingIds.size ||
      ids.some((id) => !existingIds.has(id))
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "orderedIds must include every checked item for this Sub Work exactly once.",
      });
    }

    await client.query(
      `UPDATE "WorkAbstract"
       SET "Sequence" = "Sequence" + 100000
       WHERE "WorkId" = $1 AND "SubWorkId" = $2`,
      [resolvedWorkId, resolvedSubWorkId],
    );

    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE "WorkAbstract"
         SET "Sequence" = $1
         WHERE "WorkAbstractId" = $2 AND "WorkId" = $3 AND "SubWorkId" = $4`,
        [i + 1, ids[i], resolvedWorkId, resolvedSubWorkId],
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Checked item sequence updated." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/insert-project", async (req, res) => {
  const {
    projectName,
    projectCode,
    organizationId,
    userId,
    clientName,
    clientAddress,
    clientContactInfo,
    dOrder,
    remarks,
    archAssigned,
    engrAssigned,
    markForDeletion,
  } = req.body;

  if (!projectCode || !String(projectCode).trim()) {
    return res.status(400).json({ message: "Project code is required." });
  }
  if (!projectName || !String(projectName).trim()) {
    return res.status(400).json({ message: "Project name is required." });
  }
  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!userId) {
    return res.status(400).json({ message: "User is required." });
  }

  try {
    const userCheck = await pool.query(
      `SELECT u."UserId", u."OrganizationId", uc."UserCategoryName"
       FROM "MasterUser" u
       INNER JOIN "MasterUserCategory" uc
         ON uc."UserCategoryId" = u."UserCategoryId"
       WHERE u."UserId" = $1
         AND COALESCE(u."MarkForDeletion", false) = false`,
      [Number(userId)],
    );
    const actor = userCheck.rows[0];
    if (!actor) {
      return res.status(403).json({ message: "User not found or inactive." });
    }
    const category = String(actor.UserCategoryName || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    const isSuperAdmin = category === "superadmin";
    const isOrgAdmin = category === "orgadmin";
    if (!isOrgAdmin && !isSuperAdmin) {
      return res.status(403).json({
        message: "Only OrgAdmin or SuperAdmin can create projects.",
      });
    }
    if (isOrgAdmin && Number(actor.OrganizationId) !== Number(organizationId)) {
      return res.status(403).json({
        message: "You can only create projects for your organization.",
      });
    }

    const result = await pool.query(
      `INSERT INTO "MasterProject"
        ("ProjectName", "OrganizationID", "ProjectCode", "ClientName",
         "ClientAddress", "ClientContactInfo", "DOrder", "Remarks",
         "ArchAssigned", "EngrAssigned", "MarkForDeletion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING "ProjectId", "ProjectName", "ProjectCode", "OrganizationID",
                 "ClientName", "ClientAddress", "ClientContactInfo",
                 "DOrder", "Remarks", "ArchAssigned", "EngrAssigned",
                 "MarkForDeletion"`,
      [
        String(projectName).trim(),
        Number(organizationId),
        String(projectCode).trim(),
        clientName ? String(clientName).trim() : null,
        clientAddress ? String(clientAddress).trim() : null,
        clientContactInfo ? String(clientContactInfo).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        remarks ? String(remarks).trim() : null,
        archAssigned ? Number(archAssigned) : null,
        engrAssigned ? Number(engrAssigned) : null,
        Boolean(markForDeletion),
      ],
    );
    return res.status(201).json({
      message: "Project created successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.put("/api/master-projects/:id", async (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectId) {
    return res.status(400).json({ message: "Valid project id is required." });
  }

  const {
    projectName,
    projectCode,
    organizationId,
    userId,
    clientName,
    clientAddress,
    clientContactInfo,
    dOrder,
    remarks,
    archAssigned,
    engrAssigned,
    markForDeletion,
  } = req.body;

  if (!projectCode || !String(projectCode).trim()) {
    return res.status(400).json({ message: "Project code is required." });
  }
  if (!projectName || !String(projectName).trim()) {
    return res.status(400).json({ message: "Project name is required." });
  }
  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!userId) {
    return res.status(400).json({ message: "User is required." });
  }

  try {
    const userCheck = await pool.query(
      `SELECT u."UserId", u."OrganizationId", uc."UserCategoryName"
       FROM "MasterUser" u
       INNER JOIN "MasterUserCategory" uc
         ON uc."UserCategoryId" = u."UserCategoryId"
       WHERE u."UserId" = $1
         AND COALESCE(u."MarkForDeletion", false) = false`,
      [Number(userId)],
    );
    const actor = userCheck.rows[0];
    if (!actor) {
      return res.status(403).json({ message: "User not found or inactive." });
    }
    const category = String(actor.UserCategoryName || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    const isSuperAdmin = category === "superadmin";
    const isOrgAdmin = category === "orgadmin";
    if (!isOrgAdmin && !isSuperAdmin) {
      return res.status(403).json({
        message: "Only OrgAdmin or SuperAdmin can update projects.",
      });
    }
    if (isOrgAdmin && Number(actor.OrganizationId) !== Number(organizationId)) {
      return res.status(403).json({
        message: "You can only update projects for your organization.",
      });
    }

    const result = await pool.query(
      `UPDATE "MasterProject"
       SET "ProjectName" = $1,
           "OrganizationID" = $2,
           "ProjectCode" = $3,
           "ClientName" = $4,
           "ClientAddress" = $5,
           "ClientContactInfo" = $6,
           "DOrder" = $7,
           "Remarks" = $8,
           "ArchAssigned" = $9,
           "EngrAssigned" = $10,
           "MarkForDeletion" = $11
       WHERE "ProjectId" = $12
         AND ($13::boolean OR "OrganizationID" = $2)
       RETURNING "ProjectId", "ProjectName", "ProjectCode", "OrganizationID",
                 "ClientName", "ClientAddress", "ClientContactInfo",
                 "DOrder", "Remarks", "ArchAssigned", "EngrAssigned",
                 "MarkForDeletion"`,
      [
        String(projectName).trim(),
        Number(organizationId),
        String(projectCode).trim(),
        clientName ? String(clientName).trim() : null,
        clientAddress ? String(clientAddress).trim() : null,
        clientContactInfo ? String(clientContactInfo).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        remarks ? String(remarks).trim() : null,
        archAssigned ? Number(archAssigned) : null,
        engrAssigned ? Number(engrAssigned) : null,
        Boolean(markForDeletion),
        projectId,
        isSuperAdmin,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json({
      message: "Project updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

/** Next MasterSubWork.Sequence for a Work (entry order). */
async function nextMasterSubWorkSequence(workId, client = pool) {
  const maxSeq = await client.query(
    `SELECT COALESCE(MAX("Sequence"), 0) + 1 AS "NextSequence"
     FROM "MasterSubWork"
     WHERE "WorkId" = $1`,
    [Number(workId)],
  );
  return Number(maxSeq.rows[0]?.NextSequence || 1);
}

app.post("/api/insert-subwork", async (req, res) => {
  const { workId, masterWorkId, subWorkName, sequence, markForDeletion } =
    req.body || {};
  const resolvedWorkId = Number(workId || masterWorkId);

  if (!subWorkName || !String(subWorkName).trim()) {
    return res.status(400).json({ message: "Sub Work name is required." });
  }
  if (!resolvedWorkId) {
    return res.status(400).json({ message: "Work is required." });
  }

  try {
    const workCheck = await pool.query(
      `SELECT "MasterWorkId" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    if (!workCheck.rows[0]) {
      return res.status(400).json({ message: "Selected work was not found." });
    }

    let resolvedSequence =
      sequence === "" || sequence === null || sequence === undefined
        ? null
        : Number(sequence);
    if (
      resolvedSequence === null ||
      Number.isNaN(resolvedSequence)
    ) {
      // No Sequence entered — assign next by entry order for this Work
      resolvedSequence = await nextMasterSubWorkSequence(resolvedWorkId);
    }

    const result = await pool.query(
      `INSERT INTO "MasterSubWork"
        ("WorkId", "SubWorkName", "Sequence", "MarkForDeletion")
       VALUES ($1, $2, $3, $4)
       RETURNING "SubWorkId", "WorkId", "SubWorkName", "Sequence", "MarkForDeletion"`,
      [
        resolvedWorkId,
        String(subWorkName).trim(),
        resolvedSequence,
        Boolean(markForDeletion),
      ],
    );
    return res.status(201).send({
      message: "Sub Work Created.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

/** Reorder MasterSubWork.Sequence for a Work (1, 2, 3…). */
app.put("/api/master-sub-works/reorder", async (req, res) => {
  const { workId, masterWorkId, orderedIds } = req.body || {};
  const resolvedWorkId = Number(workId || masterWorkId);
  const ids = Array.isArray(orderedIds)
    ? orderedIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (!resolvedWorkId || ids.length === 0) {
    return res.status(400).json({
      message: "workId and orderedIds are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT "SubWorkId" FROM "MasterSubWork" WHERE "WorkId" = $1`,
      [resolvedWorkId],
    );
    const existingIds = new Set(
      existing.rows.map((r) => Number(r.SubWorkId)),
    );
    if (
      ids.length !== existingIds.size ||
      ids.some((id) => !existingIds.has(id))
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "orderedIds must include every Sub Work for this Work exactly once.",
      });
    }

    await client.query(
      `UPDATE "MasterSubWork"
       SET "Sequence" = "Sequence" + 100000
       WHERE "WorkId" = $1`,
      [resolvedWorkId],
    );

    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE "MasterSubWork"
         SET "Sequence" = $1
         WHERE "SubWorkId" = $2 AND "WorkId" = $3`,
        [i + 1, ids[i], resolvedWorkId],
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Sub Work sequence updated." });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

app.put("/api/master-sub-works/:id", async (req, res) => {
  const subWorkId = Number(req.params.id);
  if (!subWorkId) {
    return res.status(400).json({ message: "Valid sub work id is required." });
  }

  const { workId, masterWorkId, subWorkName, sequence, markForDeletion } =
    req.body || {};
  const resolvedWorkId = Number(workId || masterWorkId);

  if (!subWorkName || !String(subWorkName).trim()) {
    return res.status(400).json({ message: "Sub Work name is required." });
  }
  if (!resolvedWorkId) {
    return res.status(400).json({ message: "Work is required." });
  }

  try {
    const workCheck = await pool.query(
      `SELECT "MasterWorkId" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    if (!workCheck.rows[0]) {
      return res.status(400).json({ message: "Selected work was not found." });
    }

    const existing = await pool.query(
      `SELECT "Sequence" FROM "MasterSubWork" WHERE "SubWorkId" = $1`,
      [subWorkId],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ message: "Sub Work not found." });
    }

    let resolvedSequence =
      sequence === "" || sequence === null || sequence === undefined
        ? null
        : Number(sequence);
    if (
      resolvedSequence === null ||
      Number.isNaN(resolvedSequence)
    ) {
      // Keep existing Sequence; if it was never set, assign next by entry order
      const existingSeq = existing.rows[0].Sequence;
      resolvedSequence =
        existingSeq === null || existingSeq === undefined
          ? await nextMasterSubWorkSequence(resolvedWorkId)
          : Number(existingSeq);
    }

    const result = await pool.query(
      `UPDATE "MasterSubWork"
       SET "WorkId" = $1,
           "SubWorkName" = $2,
           "Sequence" = $3,
           "MarkForDeletion" = $4
       WHERE "SubWorkId" = $5
       RETURNING "SubWorkId", "WorkId", "SubWorkName", "Sequence", "MarkForDeletion"`,
      [
        resolvedWorkId,
        String(subWorkName).trim(),
        resolvedSequence,
        Boolean(markForDeletion),
        subWorkId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Sub Work not found." });
    }

    return res.json({
      message: "Sub Work updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/validate-organization", async (req, res) => {
  const { orgCode } = req.body;

  if (!orgCode || !String(orgCode).trim()) {
    return res.status(400).json({ message: "Organization code is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "OrganizationId", "OrgCode", "OrgName"
       FROM "MasterOrganization"
       WHERE UPPER("OrgCode") = UPPER($1)
         AND COALESCE("MarkForDeletion", false) = false`,
      [String(orgCode).trim()],
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: "Organization not found. Please check the organization code.",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/insert-work-measurements", async (req, res) => {
  const {
    workAbstractId,
    description,
    expression,
    quantity,
    number,
    length,
    breadth,
    height,
  } = req.body;

  console.log("Work Abstract Id: ", workAbstractId);
  console.log("Description: ", description);
  console.log("Expression: ", expression);
  console.log("Quantity: ", quantity);
  console.log("Number: ", number);
  console.log("Length: ", length);
  console.log("Breadth: ", breadth);
  console.log("Height: ", height);

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize sequence assignment per WorkAbstractId (avoids all rows getting 1)
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [
        Number(workAbstractId),
      ]);

      const nextSeq = await client.query(
        `SELECT COALESCE(MAX("Sequence"), 0) + 1 AS "NextSequence"
         FROM "WorkMeasurement"
         WHERE "WorkAbstractId" = $1`,
        [workAbstractId],
      );
      const sequence = Number(nextSeq.rows[0]?.NextSequence || 1);

      const result = await client.query(
        `INSERT INTO "WorkMeasurement"
          ("WorkAbstractId", "Description", "Expression", "Quantity", "Number", "Length", "Breadth", "Height", "Sequence") 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) 
         RETURNING "MeasurementId", "Sequence";`,
        [
          workAbstractId,
          description ?? "",
          expression,
          quantity,
          number,
          length,
          breadth,
          height,
          sequence,
        ],
      );
      await client.query("COMMIT");
      return res.status(200).send({
        message: "Measurements Successfully Recorded.",
        data: {
          MeasurementId: result.rows[0].MeasurementId,
          Sequence: result.rows[0].Sequence,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: err.message || "Failed to insert measurement." });
  }
});

app.get("/api/measurements", async (req, res) => {
  console.log("Measurments API called.");
  const { workAbstractId } = req.query;

  console.log("Work Abstract Id: ", workAbstractId);

  try {
    // Heal duplicate sequences for this item (e.g. older parallel saves)
    const dupCheck = await pool.query(
      `SELECT "Sequence", COUNT(*)::int AS cnt
       FROM "WorkMeasurement"
       WHERE "WorkAbstractId" = $1
       GROUP BY "Sequence"
       HAVING COUNT(*) > 1
       LIMIT 1`,
      [workAbstractId],
    );
    if (dupCheck.rows.length > 0) {
      await renumberWorkMeasurementSequences(workAbstractId);
    }

    const result = await pool.query(
      `SELECT "MeasurementId", "Description", "Expression", "Number", "Length", "Breadth", "Height", "Quantity", "Sequence"
       FROM "WorkMeasurement"
       WHERE "WorkAbstractId" = $1
       ORDER BY "Sequence" ASC, "MeasurementId" ASC`,
      [workAbstractId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

// PUT route for editing existing rows
app.put("/api/update-work-measurements/:id", async (req, res) => {
  const { id } = req.params;
  const { description, expression, number, length, breadth, height, quantity } =
    req.body;

  try {
    const result = await pool.query(
      `UPDATE "WorkMeasurement" 
       SET "Description"=$1, "Expression"=$2, "Number"=$3, "Length"=$4, "Breadth"=$5, "Height"=$6, "Quantity"=$7 
       WHERE "MeasurementId"=$8
       RETURNING "MeasurementId";`,
      [description, expression, number, length, breadth, height, quantity, id],
    );
    if (!result.rows[0]) {
      return res.status(404).send({ message: "Measurement not found." });
    }
    return res.status(200).send({ message: "Measurement Updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: err.message || "Failed to update measurement." });
  }
});

app.put("/api/measurements/reorder", async (req, res) => {
  const { workAbstractId, orderedIds } = req.body || {};
  const abstractId = Number(workAbstractId);
  const ids = Array.isArray(orderedIds)
    ? orderedIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (!abstractId || ids.length === 0) {
    return res.status(400).json({
      message: "workAbstractId and orderedIds are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT "MeasurementId" FROM "WorkMeasurement" WHERE "WorkAbstractId" = $1`,
      [abstractId],
    );
    const existingIds = new Set(existing.rows.map((r) => Number(r.MeasurementId)));
    if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "orderedIds must include every measurement for this item exactly once.",
      });
    }

    // Temporary offset avoids unique conflicts if a unique index is added later
    await client.query(
      `UPDATE "WorkMeasurement"
       SET "Sequence" = "Sequence" + 100000
       WHERE "WorkAbstractId" = $1`,
      [abstractId],
    );

    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE "WorkMeasurement"
         SET "Sequence" = $1
         WHERE "MeasurementId" = $2 AND "WorkAbstractId" = $3`,
        [i + 1, ids[i], abstractId],
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Measurement sequence updated." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

app.delete("/api/measurements/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(
      `DELETE FROM "WorkMeasurement"
       WHERE "MeasurementId" = $1
       RETURNING "MeasurementId", "WorkAbstractId"`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ message: "Measurement not found." });
    }
    await renumberWorkMeasurementSequences(existing.rows[0].WorkAbstractId);
    return res.status(200).json({ message: "Measurement deleted." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { orgCode, userLoginName, password } = req.body;

  if (!orgCode || !String(orgCode).trim()) {
    return res.status(400).json({ message: "Organization code is required." });
  }
  if (!userLoginName || !String(userLoginName).trim()) {
    return res.status(400).json({ message: "User name is required." });
  }
  if (!password) {
    return res.status(400).json({ message: "Password is required." });
  }

  try {
    const result = await pool.query(
      `SELECT u."UserId", u."UserCategoryId", u."OrganizationId", u."DesignationId",
              u."UserLoginName", u."UserName", u."UserAddress",
              u."UserDateOfJoining", u."UserDateOfBirth", u."UserContact",
              u."UserEmail", u."MarkForDeletion", u."IsActive",
              u."DateOfRelieving", u."DOrder", u."Remarks",
              d."DesignationName", uc."UserCategoryName",
              o."OrgCode", o."OrgName"
       FROM "MasterUser" u
       INNER JOIN "MasterOrganization" o ON o."OrganizationId" = u."OrganizationId"
       INNER JOIN "MasterDesignation" d ON d."DesignationId" = u."DesignationId"
       INNER JOIN "MasterUserCategory" uc ON uc."UserCategoryId" = u."UserCategoryId"
       WHERE UPPER(o."OrgCode") = UPPER($1)
         AND UPPER(u."UserLoginName") = UPPER($2)
         AND u."UserPWD" = $3
         AND COALESCE(u."MarkForDeletion", false) = false
         AND COALESCE(o."MarkForDeletion", false) = false`,
      [String(orgCode).trim(), String(userLoginName).trim(), String(password)],
    );

    if (!result.rows[0]) {
      return res
        .status(401)
        .json({ message: "Invalid user name or password." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (error.message && error.message.includes('"UserPWD"')) {
      return res.status(500).json({
        message:
          "UserPWD column is missing. Run database/add_master_user_pwd.sql on your database.",
      });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/user-profile/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "Valid user id is required." });
  }

  try {
    const result = await pool.query(
      `SELECT u."UserId", u."UserCategoryId", u."OrganizationId", u."DesignationId",
              u."UserLoginName", u."UserName", u."UserAddress",
              u."UserDateOfJoining", u."UserDateOfBirth", u."UserContact",
              u."UserEmail", u."MarkForDeletion", u."UserPWD", u."IsActive",
              u."DateOfRelieving", u."DOrder", u."Remarks",
              d."DesignationName", uc."UserCategoryName",
              o."OrgCode", o."OrgName"
       FROM "MasterUser" u
       INNER JOIN "MasterOrganization" o ON o."OrganizationId" = u."OrganizationId"
       INNER JOIN "MasterDesignation" d ON d."DesignationId" = u."DesignationId"
       INNER JOIN "MasterUserCategory" uc ON uc."UserCategoryId" = u."UserCategoryId"
       WHERE u."UserId" = $1
         AND COALESCE(u."MarkForDeletion", false) = false`,
      [userId],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/auth/user-profile/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "Valid user id is required." });
  }

  const {
    userAddress,
    userDateOfJoining,
    userDateOfBirth,
    designationId,
  } = req.body || {};

  if (!designationId) {
    return res.status(400).json({ message: "Designation is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterUser" u
       SET "UserAddress" = $1,
           "UserDateOfJoining" = $2,
           "UserDateOfBirth" = $3,
           "DesignationId" = $4
       FROM "MasterDesignation" d
       WHERE u."UserId" = $5
         AND d."DesignationId" = $4
         AND d."OrganizationId" = u."OrganizationId"
         AND COALESCE(u."MarkForDeletion", false) = false
         AND COALESCE(d."MarkForDeletion", false) = false
       RETURNING u."UserId", u."UserCategoryId", u."OrganizationId", u."DesignationId",
                 u."UserLoginName", u."UserName", u."UserAddress",
                 u."UserDateOfJoining", u."UserDateOfBirth", u."UserContact",
                 u."UserEmail", u."MarkForDeletion", u."UserPWD", u."IsActive",
                 u."DateOfRelieving", u."DOrder", u."Remarks"`,
      [
        userAddress != null ? String(userAddress) : null,
        userDateOfJoining || null,
        userDateOfBirth || null,
        Number(designationId),
        userId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message:
          "User not found or designation is invalid for this organization.",
      });
    }

    const joined = await pool.query(
      `SELECT u."UserId", u."UserCategoryId", u."OrganizationId", u."DesignationId",
              u."UserLoginName", u."UserName", u."UserAddress",
              u."UserDateOfJoining", u."UserDateOfBirth", u."UserContact",
              u."UserEmail", u."MarkForDeletion", u."UserPWD", u."IsActive",
              u."DateOfRelieving", u."DOrder", u."Remarks",
              d."DesignationName", uc."UserCategoryName",
              o."OrgCode", o."OrgName"
       FROM "MasterUser" u
       INNER JOIN "MasterOrganization" o ON o."OrganizationId" = u."OrganizationId"
       INNER JOIN "MasterDesignation" d ON d."DesignationId" = u."DesignationId"
       INNER JOIN "MasterUserCategory" uc ON uc."UserCategoryId" = u."UserCategoryId"
       WHERE u."UserId" = $1`,
      [userId],
    );

    return res.json(joined.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/designations", async (req, res) => {
  const organizationId = Number(req.query.organizationId);
  if (!organizationId) {
    return res
      .status(400)
      .json({ message: "organizationId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "DesignationId", "DesignationName", "DesignationShortName"
       FROM "MasterDesignation"
       WHERE "OrganizationId" = $1
         AND COALESCE("MarkForDeletion", false) = false
       ORDER BY COALESCE("DOrder", 999999), "DesignationName"`,
      [organizationId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/branches", async (req, res) => {
  const organizationId = Number(req.query.organizationId);
  if (!organizationId) {
    return res
      .status(400)
      .json({ message: "organizationId query parameter is required." });
  }

  try {
    const result = await pool.query(
      `SELECT "BranchID", "OrganisationID", "BranchCode", "BranchName"
       FROM "MasterBranch"
       WHERE "OrganisationID" = $1
       ORDER BY COALESCE("DOrder", 999999), "BranchName"`,
      [organizationId],
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/master-designations", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT d."DesignationId", d."OrganizationId", d."DesignationName",
              d."DesignationShortName", d."Remarks", d."DOrder", d."DOrder1",
              d."MarkForDeletion", d."BranchId",
              o."OrgCode", o."OrgName",
              b."BranchCode", b."BranchName"
       FROM "MasterDesignation" d
       INNER JOIN "MasterOrganization" o ON o."OrganizationId" = d."OrganizationId"
       LEFT JOIN "MasterBranch" b ON b."BranchID" = d."BranchId"
       ORDER BY COALESCE(d."DOrder", 999999), d."DesignationName"`,
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/master-designations", async (req, res) => {
  const {
    organizationId,
    designationName,
    designationShortName,
    remarks,
    dOrder,
    dOrder1,
    branchId,
    markForDeletion,
  } = req.body || {};

  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!designationName || !String(designationName).trim()) {
    return res.status(400).json({ message: "Designation name is required." });
  }
  if (!designationShortName || !String(designationShortName).trim()) {
    return res
      .status(400)
      .json({ message: "Designation short name is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterDesignation"
        ("OrganizationId", "DesignationName", "DesignationShortName",
         "Remarks", "DOrder", "DOrder1", "MarkForDeletion", "BranchId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING "DesignationId", "OrganizationId", "DesignationName",
                 "DesignationShortName", "Remarks", "DOrder", "DOrder1",
                 "MarkForDeletion", "BranchId"`,
      [
        Number(organizationId),
        String(designationName).trim(),
        String(designationShortName).trim(),
        remarks ? String(remarks).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        dOrder1 === "" || dOrder1 === null || dOrder1 === undefined
          ? null
          : Number(dOrder1),
        Boolean(markForDeletion),
        branchId ? Number(branchId) : null,
      ],
    );
    return res.status(201).json({
      message: "Designation created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/master-designations/:id", async (req, res) => {
  const designationId = Number(req.params.id);
  if (!designationId) {
    return res.status(400).json({ message: "Valid designation id is required." });
  }

  const {
    organizationId,
    designationName,
    designationShortName,
    remarks,
    dOrder,
    dOrder1,
    branchId,
    markForDeletion,
  } = req.body || {};

  if (!organizationId) {
    return res.status(400).json({ message: "Organization is required." });
  }
  if (!designationName || !String(designationName).trim()) {
    return res.status(400).json({ message: "Designation name is required." });
  }
  if (!designationShortName || !String(designationShortName).trim()) {
    return res
      .status(400)
      .json({ message: "Designation short name is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterDesignation"
       SET "OrganizationId" = $1,
           "DesignationName" = $2,
           "DesignationShortName" = $3,
           "Remarks" = $4,
           "DOrder" = $5,
           "DOrder1" = $6,
           "MarkForDeletion" = $7,
           "BranchId" = $8
       WHERE "DesignationId" = $9
       RETURNING "DesignationId", "OrganizationId", "DesignationName",
                 "DesignationShortName", "Remarks", "DOrder", "DOrder1",
                 "MarkForDeletion", "BranchId"`,
      [
        Number(organizationId),
        String(designationName).trim(),
        String(designationShortName).trim(),
        remarks ? String(remarks).trim() : null,
        dOrder === "" || dOrder === null || dOrder === undefined
          ? null
          : Number(dOrder),
        dOrder1 === "" || dOrder1 === null || dOrder1 === undefined
          ? null
          : Number(dOrder1),
        Boolean(markForDeletion),
        branchId ? Number(branchId) : null,
        designationId,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Designation not found." });
    }

    return res.json({
      message: "Designation updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/master-units", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT "UnitId", "UnitName", "UnitShortName", "DOrder", "DOrder1",
              "Remarks", "MarkForDeletion"
       FROM "MasterUnit"
       ORDER BY "DOrder" ASC NULLS LAST, "UnitName" ASC`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/master-units", async (req, res) => {
  const {
    UnitName,
    UnitShortName,
    DOrder,
    DOrder1,
    Remarks,
    MarkForDeletion,
  } = req.body || {};

  if (!UnitName || !String(UnitName).trim()) {
    return res.status(400).json({ message: "UnitName is required." });
  }
  if (!UnitShortName || !String(UnitShortName).trim()) {
    return res.status(400).json({ message: "UnitShortName is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "MasterUnit"
       ("UnitName", "UnitShortName", "DOrder", "DOrder1", "Remarks", "MarkForDeletion")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING "UnitId", "UnitName", "UnitShortName", "DOrder", "DOrder1",
                 "Remarks", "MarkForDeletion"`,
      [
        String(UnitName).trim(),
        String(UnitShortName).trim(),
        DOrder === "" || DOrder === null || DOrder === undefined
          ? null
          : Number(DOrder),
        DOrder1 === "" || DOrder1 === null || DOrder1 === undefined
          ? null
          : Number(DOrder1),
        Remarks ? String(Remarks).trim() : null,
        Boolean(MarkForDeletion),
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/master-units/:id", async (req, res) => {
  const { id } = req.params;
  const {
    UnitName,
    UnitShortName,
    DOrder,
    DOrder1,
    Remarks,
    MarkForDeletion,
  } = req.body || {};

  if (!UnitName || !String(UnitName).trim()) {
    return res.status(400).json({ message: "UnitName is required." });
  }
  if (!UnitShortName || !String(UnitShortName).trim()) {
    return res.status(400).json({ message: "UnitShortName is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE "MasterUnit"
       SET "UnitName" = $1,
           "UnitShortName" = $2,
           "DOrder" = $3,
           "DOrder1" = $4,
           "Remarks" = $5,
           "MarkForDeletion" = $6
       WHERE "UnitId" = $7
       RETURNING "UnitId", "UnitName", "UnitShortName", "DOrder", "DOrder1",
                 "Remarks", "MarkForDeletion"`,
      [
        String(UnitName).trim(),
        String(UnitShortName).trim(),
        DOrder === "" || DOrder === null || DOrder === undefined
          ? null
          : Number(DOrder),
        DOrder1 === "" || DOrder1 === null || DOrder1 === undefined
          ? null
          : Number(DOrder1),
        Remarks ? String(Remarks).trim() : null,
        Boolean(MarkForDeletion),
        Number(id),
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Unit not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.delete("/api/delete-selected-items", async (req, res) => {
  const workId = Number(req.query.workId || req.query.projectId);
  const subWorkId = Number(req.query.subWorkId);
  let rawIds = req.query.workAbstractIds || req.query.deleteItems;

  if (!Array.isArray(rawIds)) {
    rawIds = rawIds != null && rawIds !== "" ? [rawIds] : [];
  }
  const workAbstractIds = [
    ...new Set(rawIds.map((id) => Number(id)).filter((id) => id > 0)),
  ];

  if (!workId || !subWorkId) {
    return res.status(400).json({
      message: "workId and subWorkId are required.",
    });
  }
  if (!workAbstractIds.length) {
    return res.status(400).json({
      message: "Select at least one checked item to delete.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const abstracts = await client.query(
      `SELECT "WorkAbstractId", "ItemId"
       FROM "WorkAbstract"
       WHERE "WorkId" = $1
         AND "SubWorkId" = $2
         AND "WorkAbstractId" = ANY($3::int[])`,
      [workId, subWorkId, workAbstractIds],
    );

    if (!abstracts.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "No matching checked items found for this Work and Sub Work.",
      });
    }

    const abstractIds = abstracts.rows.map((r) => Number(r.WorkAbstractId));
    const itemIds = [
      ...new Set(abstracts.rows.map((r) => Number(r.ItemId)).filter((id) => id > 0)),
    ];

    // 1) Measurements for these abstract rows only
    await client.query(
      `DELETE FROM "WorkMeasurement"
       WHERE "WorkAbstractId" = ANY($1::int[])`,
      [abstractIds],
    );

    // 2) Abstract rows for this Work + Sub Work only
    await client.query(
      `DELETE FROM "WorkAbstract"
       WHERE "WorkId" = $1
         AND "SubWorkId" = $2
         AND "WorkAbstractId" = ANY($3::int[])`,
      [workId, subWorkId, abstractIds],
    );

    // 3) WorkMaterial only when ItemId is no longer used by any Sub Work of this Work
    let materialsDeleted = 0;
    for (const itemId of itemIds) {
      const stillUsed = await client.query(
        `SELECT 1
         FROM "WorkAbstract"
         WHERE "WorkId" = $1 AND "ItemId" = $2
         LIMIT 1`,
        [workId, itemId],
      );
      if (stillUsed.rows.length > 0) continue;

      const matDel = await client.query(
        `DELETE FROM "WorkMaterial"
         WHERE "WorkId" = $1 AND "ItemId" = $2`,
        [workId, itemId],
      );
      materialsDeleted += matDel.rowCount || 0;
    }

    await renumberWorkAbstractSequences(workId, subWorkId, client);
    await client.query("COMMIT");

    return res.status(200).json({
      message: `Deleted ${abstractIds.length} checked item(s) successfully.`,
      deletedAbstracts: abstractIds.length,
      materialsDeleted,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

app.get("/api/get-work-abstract-report", async (req, res) => {
  const { workId, subWorkId } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM "WorkAbstract" WHERE "WorkId" = $1 AND "SubWorkId" = $2`,
      [workId, subWorkId],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to fetch work abstract report." });
  }
});

app.get("/api/generate-report", async (req, res) => {
  const { projectId, subWorkId } = req.query;

  if (!projectId) {
    return res.status(400).json({ message: "projectId is required." });
  }

  // ItemNumber: chapter.parent.child... — ancestor prefixes for parent wording
  const ancestorItemNumbers = (itemNumber) => {
    if (!itemNumber) return [];
    const segments = String(itemNumber).split(".");
    const ancestors = [];
    for (let i = segments.length - 1; i >= 2; i -= 1) {
      ancestors.push(segments.slice(0, i).join("."));
    }
    return ancestors.reverse();
  };

  try {
    // WorkAbstract."ProjectId" stores MasterWorkId (Estimation "Select Work")
    const workResult = await pool.query(
      `SELECT "WorkName" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [projectId],
    );
    const projectName = workResult.rows[0]?.WorkName || "Untitled Work";

    const params = [projectId];
    let subWorkFilter = "";
    if (subWorkId && subWorkId !== "all") {
      subWorkFilter = `AND sw."SubWorkId" = $2`;
      params.push(subWorkId);
    }

    const query = `
        SELECT
          sw."SubWorkId",
          sw."SubWorkName",
          wa."WorkAbstractId",
          wa."Sequence",
          wa."FinalRate",
          wa."RateString",
          wa."IsRA",
          i."ItemId",
          i."ItemNumber",
          i."ItemDescription",
          i."RegionId",
          i."CategoryId",
          u."UnitShortName",
          COALESCE(SUM(wm."Quantity"), 0) AS "Quantity"
        FROM "WorkAbstract" wa
        INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
        INNER JOIN "MasterSubWork" sw ON sw."SubWorkId" = wa."SubWorkId"
        LEFT JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
        LEFT JOIN "WorkMeasurement" wm ON wm."WorkAbstractId" = wa."WorkAbstractId"
        WHERE wa."WorkId" = $1
        ${subWorkFilter}
        GROUP BY
          sw."SubWorkId", sw."SubWorkName",
          wa."WorkAbstractId", wa."Sequence", wa."FinalRate", wa."RateString", wa."IsRA",
          i."ItemId", i."ItemNumber", i."ItemDescription", i."RegionId", i."CategoryId",
          u."UnitShortName"
        ORDER BY
          COALESCE(sw."Sequence", 999999) ASC,
          sw."SubWorkName" ASC,
          COALESCE(wa."Sequence", 999999) ASC,
          wa."WorkAbstractId" ASC
      `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this selection." });
    }

    // Collect ancestor ItemNumbers (parent wording) for selected leaves
    const neededParents = new Set();
    for (const row of rows) {
      for (const ancestor of ancestorItemNumbers(row.ItemNumber)) {
        neededParents.add(ancestor);
      }
    }

    // Map "RegionId|CategoryId|ItemNumber" -> parent description
    const parentByKey = new Map();
    if (neededParents.size > 0) {
      const parentResult = await pool.query(
        `SELECT "ItemNumber", "ItemDescription", "RegionId", "CategoryId"
         FROM "MasterItem"
         WHERE "ItemNumber" = ANY($1::text[])`,
        [Array.from(neededParents)],
      );
      for (const p of parentResult.rows) {
        const key = `${p.RegionId}|${p.CategoryId}|${p.ItemNumber}`;
        if (!parentByKey.has(key)) {
          parentByKey.set(key, p.ItemDescription || "");
        }
        // Also keep a number-only fallback when region/category match is ambiguous
        if (!parentByKey.has(p.ItemNumber)) {
          parentByKey.set(p.ItemNumber, p.ItemDescription || "");
        }
      }
    }

    const resolveParentDescription = (row, ancestorNumber) => {
      const scoped = parentByKey.get(
        `${row.RegionId}|${row.CategoryId}|${ancestorNumber}`,
      );
      if (scoped !== undefined) return scoped;
      return parentByKey.get(ancestorNumber) || "";
    };

    // ── Group rows by sub work; inject parent heading rows before leaves ──
    const subWorkGroups = [];
    const groupIndexBySubWorkId = new Map();
    for (const row of rows) {
      if (!groupIndexBySubWorkId.has(row.SubWorkId)) {
        groupIndexBySubWorkId.set(row.SubWorkId, subWorkGroups.length);
        subWorkGroups.push({
          subWorkName: row.SubWorkName,
          items: [],
          printedParents: new Set(),
        });
      }
      const group = subWorkGroups[groupIndexBySubWorkId.get(row.SubWorkId)];

      for (const ancestor of ancestorItemNumbers(row.ItemNumber)) {
        if (group.printedParents.has(ancestor)) continue;
        group.printedParents.add(ancestor);
        const parentDesc = resolveParentDescription(row, ancestor);
        if (!parentDesc) continue;
        group.items.push({
          isParentHeading: true,
          ItemNumber: ancestor,
          ItemDescription: parentDesc,
        });
      }

      group.items.push({
        isParentHeading: false,
        ItemNumber: row.ItemNumber,
        ItemDescription: row.ItemDescription,
        UnitShortName: row.UnitShortName,
        FinalRate: Number(row.FinalRate || 0),
        RateString: row.RateString || "",
        IsRA: Boolean(row.IsRA),
        Quantity: row.Quantity,
      });
    }

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName.replace(/[^\w\-]+/g, "_")}_Abstract.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const rupeeFonts = registerRupeeFonts(doc);

    const money = (n) =>
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // Amount / totals: round to whole Rupees, Indian grouping with ₹
    const rupees = (n) => formatInrAmount(n, { roundToRupee: true });

    // Item No | Description | Quantity | Rate/Unit | Amount
    const colX = { itemNo: 40, desc: 105, qty: 340, rate: 410, amount: 490 };
    const itemNoWidth = colX.desc - colX.itemNo - 6;
    const descWidth = colX.qty - colX.desc - 10;
    const amountWidth = 555 - colX.amount;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    const drawHeader = () => {
      doc.font("Helvetica-Bold").fontSize(14);
      doc.text("Abstract", 0, 40, { align: "center" });
      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`Name of Work :   ${projectName}`, colX.itemNo, doc.y);
      doc.moveDown(0.5);
    };

    const drawSubWorkTitleAndTableHeader = (groupIdx, subWorkName) => {
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(
        `${groupIdx + 1}. NAME OF SUB WORK -- ${subWorkName}`,
        colX.itemNo,
        doc.y,
      );
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.3);
      const tableTop = doc.y;
      doc.text("Item No", colX.itemNo, tableTop);
      doc.text("Description", colX.desc, tableTop);
      doc.text("Quantity", colX.qty, tableTop);
      doc.text("Rate/Unit", colX.rate, tableTop);
      doc.text("Amount", colX.amount, tableTop, {
        width: amountWidth,
        align: "right",
      });
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);
    };

    subWorkGroups.forEach((group, groupIdx) => {
      if (groupIdx > 0) doc.addPage();
      drawHeader();
      drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);

      let subWorkTotal = 0;

      group.items.forEach((item) => {
        const isParent = Boolean(item.isParentHeading);
        const quantity = isParent ? 0 : Number(item.Quantity || 0);
        const rate = isParent ? 0 : Number(item.FinalRate || 0);
        const amount = Math.round(quantity * rate);
        if (!isParent) subWorkTotal += amount;

        const itemNoText = item.ItemNumber || "";
        const rateString = String(item.RateString || "").trim();
        const baseDesc = String(item.ItemDescription || "").trim();
        const descText = isParent
          ? baseDesc
          : [baseDesc, rateString].filter(Boolean).join("\n");

        doc.font(isParent ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        const itemNoHeight = doc.heightOfString(itemNoText, {
          width: itemNoWidth,
        });
        const descHeight = doc.heightOfString(descText, {
          width: descWidth,
          align: "justify",
        });
        const rowHeight = Math.max(itemNoHeight, descHeight) + 6;

        if (doc.y + rowHeight > pageBottom - 40) {
          doc.addPage();
          drawHeader();
          drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);
        }

        const rowTop = doc.y;

        doc.font(isParent ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        doc.text(itemNoText, colX.itemNo, rowTop, { width: itemNoWidth });
        doc.text(descText, colX.desc, rowTop, {
          width: descWidth,
          align: "justify",
        });

        if (!isParent) {
          doc.font("Helvetica").fontSize(9);
          doc.text(quantity.toFixed(3), colX.qty, rowTop, { width: 60 });
          doc.text(
            `${money(rate)}/${item.UnitShortName || ""}`,
            colX.rate,
            rowTop,
            { width: 75 },
          );
          doc.font(rupeeFonts.regular).fontSize(9);
          doc.text(rupees(amount), colX.amount, rowTop, {
            width: amountWidth,
            align: "right",
          });
        }

        doc.y = Math.max(doc.y, rowTop + rowHeight);
        doc.moveDown(0.35);
      });

      if (doc.y > pageBottom - 40) {
        doc.addPage();
        drawHeader();
        drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);
      }
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.3);
      const totalY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Total", colX.rate, totalY);
      doc.font(rupeeFonts.bold).fontSize(10);
      doc.text(rupees(subWorkTotal), colX.amount, totalY, {
        width: amountWidth,
        align: "right",
      });

      // Total in words (Indian currency)
      const words = amountInIndianWords(subWorkTotal);
      doc.moveDown(0.6);
      const wordsHeight = doc.heightOfString(words, { width: 515 });
      if (doc.y + wordsHeight > pageBottom - 20) {
        doc.addPage();
        drawHeader();
      }
      doc.font("Helvetica-Oblique").fontSize(9);
      doc.text(words, colX.itemNo, doc.y, { width: 515 });
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

/**
 * Rate Analysis Report — one block per WorkAbstract where IsRA = true,
 * using WorkMaterial lead/component lines (layout matches RateAnalysis.pdf).
 */
app.get("/api/generate-rate-analysis-report", async (req, res) => {
  const workId = Number(req.query.workId || req.query.projectId);
  if (!workId) {
    return res.status(400).json({ message: "Please Select Work." });
  }

  try {
    const workResult = await pool.query(
      `SELECT "MasterWorkId", "WorkName"
       FROM "MasterWork"
       WHERE "MasterWorkId" = $1`,
      [workId],
    );
    if (!workResult.rows[0]) {
      return res.status(404).json({ message: "Selected Work was not found." });
    }
    const workName = workResult.rows[0].WorkName || "Untitled Work";

    const abstracts = await pool.query(
      `SELECT wa."WorkAbstractId", wa."WorkId", wa."SubWorkId", wa."ItemId",
              wa."Sequence", wa."IsRA", wa."RateString", wa."FinalRate",
              i."ItemNumber", i."ItemDescription", i."PageNumber",
              i."CompletedRate", i."RegionId", i."SSRYearId",
              u."UnitShortName",
              y."Year" AS "SSRYear",
              r."SSRRegionShortName"
       FROM "WorkAbstract" wa
       INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
       LEFT JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
       LEFT JOIN "MasterYear" y ON y."YearId" = i."SSRYearId"
       LEFT JOIN "MasterSSRRegion" r ON r."SSRRegionId" = i."RegionId"
       WHERE wa."WorkId" = $1
         AND wa."IsRA" = true
       ORDER BY wa."WorkId" ASC, wa."SubWorkId" ASC, wa."Sequence" ASC,
                wa."WorkAbstractId" ASC`,
      [workId],
    );

    if (!abstracts.rows.length) {
      return res.status(404).json({
        message:
          "No Rate Analysis items (IsRA = true) found for the selected Work.",
      });
    }

    const additionsResult = await pool.query(
      `SELECT "SSRRegionId", "Description", "Percentage", "ApplyForLead"
       FROM "WorkStandardAddition"
       WHERE "MasterWorkId" = $1`,
      [workId],
    );
    const additionByRegion = new Map(
      additionsResult.rows.map((row) => [
        Number(row.SSRRegionId),
        {
          Description: row.Description || "",
          Percentage: Number(row.Percentage) || 0,
          ApplyForLead: row.ApplyForLead !== false,
        },
      ]),
    );

    const ssrYears = [
      ...new Set(
        abstracts.rows.map((r) => r.SSRYear).filter((y) => y != null && y !== ""),
      ),
    ];
    const ssrYearLabel = ssrYears.length ? ssrYears.join(", ") : "—";

    const money2 = (n) =>
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const rs = (n) => `Rs.${money2(n)}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(workName).replace(/[^\w\-]+/g, "_")}_RateAnalysis.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    doc.pipe(res);

    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const left = 40;
    const right = 555;
    const width = right - left;

    const ensureSpace = (needed) => {
      if (doc.y + needed > pageBottom - 30) {
        doc.addPage();
        return true;
      }
      return false;
    };

    const drawRule = () => {
      doc
        .moveTo(left, doc.y)
        .lineTo(right, doc.y)
        .stroke();
      doc.moveDown(0.35);
    };

    // Header
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(`Name of Work:  ${workName}`, left, doc.y, { width });
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(13);
    doc.text("Rate Analysis Report", left, doc.y, {
      width,
      align: "center",
    });
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text(`SSR YEAR ${ssrYearLabel}`, left, doc.y, {
      width,
      align: "center",
    });
    doc.moveDown(0.8);

    let raNo = 0;
    for (const abstract of abstracts.rows) {
      raNo += 1;
      const itemId = Number(abstract.ItemId);
      const basicRate = Number(abstract.CompletedRate) || 0;
      const unit = abstract.UnitShortName || "";
      const itemNumber = abstract.ItemNumber || "";
      const pageNumber =
        abstract.PageNumber === null || abstract.PageNumber === undefined
          ? ""
          : String(abstract.PageNumber);
      const description = abstract.ItemDescription || "";
      const regionId = Number(abstract.RegionId);
      const addition = additionByRegion.get(regionId) || null;

      const materials = await pool.query(
        `SELECT wm."Sequence", wm."Component", wm."LeadDistanceKm", wm."Lead",
                wm."Amount", wm."UnitId",
                m."MaterialShortDescription", m."MaterialDescription",
                u."UnitShortName"
         FROM "WorkMaterial" wm
         LEFT JOIN "MasterMaterial" m ON m."MaterialId" = wm."MaterialId"
         LEFT JOIN "MasterUnit" u ON u."UnitId" = wm."UnitId"
         WHERE wm."WorkId" = $1
           AND wm."ItemId" = $2
         ORDER BY COALESCE(wm."Sequence", 999999) ASC, wm."WorkMaterialId" ASC`,
        [workId, itemId],
      );

      ensureSpace(120);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`R.A. NO. : ${raNo} - ${description}`, left, doc.y, {
        width,
        align: "justify",
      });
      doc.moveDown(0.35);

      const regionShortName = String(
        abstract.SSRRegionShortName || "",
      ).trim();
      const metaLeft = `INo${itemNumber}${pageNumber ? `, PgNo ${pageNumber}` : ""}${
        regionShortName ? ` ( ${regionShortName} )` : ""
      }`;
      const metaRight = `Basic Rate.......  ${money2(basicRate)} / ${unit}`;
      doc.font("Helvetica").fontSize(9);
      const metaY = doc.y;
      doc.text(metaLeft, left, metaY, { width: width * 0.55 });
      doc.text(metaRight, left + width * 0.55, metaY, {
        width: width * 0.45,
        align: "right",
      });
      doc.y = Math.max(doc.y, metaY + 12);
      doc.moveDown(0.45);

      // Column headers for lead charges
      const colMat = left;
      const colQty = left + 175;
      const colDist = left + 275;
      const colLead = left + 355;
      const colAmt = left + 445;

      ensureSpace(40);
      doc.font("Helvetica-Bold").fontSize(9);
      const hdrY = doc.y;
      doc.text("Add For Lead Charges", colMat, hdrY, { width: 170 });
      doc.text("Qty. / Unit", colQty, hdrY, { width: 95 });
      doc.text("Distance", colDist, hdrY, { width: 75 });
      doc.text("Lead Charge", colLead, hdrY, { width: 85 });
      doc.y = hdrY + 12;
      doc.moveDown(0.2);

      let sumAmount = 0;
      doc.font("Helvetica").fontSize(9);
      if (!materials.rows.length) {
        doc.text("No WorkMaterial rows for this item.", left, doc.y, {
          width,
        });
        doc.moveDown(0.4);
      } else {
        for (const mat of materials.rows) {
          ensureSpace(28);
          const matName =
            mat.MaterialShortDescription ||
            mat.MaterialDescription ||
            `Material ${mat.MaterialId || ""}`;
          const component = Number(mat.Component) || 0;
          const matUnit = mat.UnitShortName || "";
          const distance =
            mat.LeadDistanceKm === null || mat.LeadDistanceKm === undefined
              ? ""
              : `${money2(mat.LeadDistanceKm)} Km.`;
          const lead = Number(mat.Lead) || 0;
          const amount = Number(mat.Amount) || 0;
          sumAmount += amount;

          const rowY = doc.y;
          const matHeight = doc.heightOfString(matName, { width: 165 });
          doc.text(matName, colMat, rowY, { width: 165 });
          doc.text(`${money2(component)} / ${matUnit}`, colQty, rowY, {
            width: 95,
          });
          doc.text(distance, colDist, rowY, { width: 75 });
          doc.text(rs(lead), colLead, rowY, { width: 85 });
          doc.text(rs(amount), colAmt, rowY, { width: 70, align: "right" });
          doc.y = rowY + Math.max(matHeight, 12) + 4;
        }
      }

      const subTotal = basicRate + sumAmount;
      let additionAmount = 0;
      let additionLabel = "";
      if (addition && Number(addition.Percentage)) {
        const percentage = Number(addition.Percentage) || 0;
        if (addition.ApplyForLead) {
          // % on Basic + Lead Amount
          additionAmount = subTotal * (percentage / 100);
          additionLabel = `${addition.Description || "Standard Addition"} @ ${money2(percentage)}% Including Lead Charges`;
        } else {
          // Present logic: % on Basic Rate only
          additionAmount = basicRate * (percentage / 100);
          additionLabel = `${addition.Description || "Standard Addition"} @ ${money2(percentage)}%`;
        }
      }

      const totalAmount = subTotal + additionAmount;
      const rateValue = Number(totalAmount.toFixed(2));

      ensureSpace(90);
      drawRule();
      doc.font("Helvetica-Bold").fontSize(9);
      {
        const y = doc.y;
        doc.text("Sub Total", left, y, { width: width * 0.65 });
        doc.text(rs(subTotal), left + width * 0.65, y, {
          width: width * 0.35,
          align: "right",
        });
        doc.y = y + 12;
      }
      doc.moveDown(0.2);
      drawRule();

      if (additionLabel) {
        doc.font("Helvetica").fontSize(9);
        const labelWidth = width * 0.65;
        const labelHeight = doc.heightOfString(additionLabel, {
          width: labelWidth,
        });
        ensureSpace(labelHeight + 20);
        {
          const y = doc.y;
          doc.text(additionLabel, left, y, {
            width: labelWidth,
            align: "left",
          });
          doc.text(rs(additionAmount), left + labelWidth, y, {
            width: width * 0.35,
            align: "right",
          });
          doc.y = y + Math.max(labelHeight, 12);
        }
        doc.moveDown(0.2);
        drawRule();
      }

      doc.font("Helvetica-Bold").fontSize(9);
      {
        const y = doc.y;
        doc.text("Total Amount", left, y, { width: width * 0.65 });
        doc.text(rs(totalAmount), left + width * 0.65, y, {
          width: width * 0.35,
          align: "right",
        });
        doc.y = y + 12;
      }
      doc.moveDown(0.2);
      drawRule();
      {
        const y = doc.y;
        doc.text("Rate", left, y, { width: width * 0.45 });
        doc.text(`${rs(rateValue)} / ${unit}`, left + width * 0.45, y, {
          width: width * 0.55,
          align: "right",
        });
        doc.y = y + 12;
      }
      doc.moveDown(0.2);
      drawRule();
      doc.moveDown(0.7);
    }

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(8);
      doc.text(
        `Page ${i + 1} of ${range.count} of Rate Analysis`,
        left,
        doc.page.height - 30,
        { width, align: "center" },
      );
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

app.get("/api/generate-recap-report", async (req, res) => {
  const { projectId } = req.query;
  console.log("Generate Recapitulation Report Called.");
  console.log("Work Id: ", projectId);

  if (!projectId) {
    return res.status(400).json({ message: "Work is required." });
  }

  try {
    const workResult = await pool.query(
      `SELECT "WorkName" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [projectId],
    );
    if (!workResult.rows[0]) {
      return res.status(404).json({ message: "Selected Work was not found." });
    }
    const projectName = workResult.rows[0].WorkName || "Untitled Work";

    // Sub works for this MasterWork, in assigned Sequence order
    const subWorkResult = await pool.query(
      `SELECT sw."SubWorkId", sw."SubWorkName", sw."Sequence",
              COALESCE(SUM(wm."Quantity" * i."CompletedRate"), 0) AS "Amount"
       FROM "MasterSubWork" sw
       LEFT JOIN "WorkAbstract" wa
         ON wa."SubWorkId" = sw."SubWorkId"
        AND wa."WorkId" = sw."WorkId"
       LEFT JOIN "WorkMeasurement" wm
         ON wm."WorkAbstractId" = wa."WorkAbstractId"
       LEFT JOIN "MasterItem" i
         ON i."ItemId" = wa."ItemId"
       WHERE sw."WorkId" = $1
         AND COALESCE(sw."MarkForDeletion", false) = false
       GROUP BY sw."SubWorkId", sw."SubWorkName", sw."Sequence"
       ORDER BY COALESCE(sw."Sequence", 999999) ASC, sw."SubWorkId" ASC`,
      [projectId],
    );

    if (subWorkResult.rows.length === 0) {
      return res.status(404).json({
        message: "No Sub Works found for the selected Work.",
      });
    }

    const subWorkRows = subWorkResult.rows.map((row) => ({
      label: row.SubWorkName || `Sub Work #${row.SubWorkId}`,
      amount: Number(row.Amount || 0),
    }));

    const totalAmount = subWorkRows.reduce((sum, r) => sum + r.amount, 0);
    const roundOff = Math.round(totalAmount);

    if (totalAmount === 0) {
      return res.status(404).json({
        message: "No measured amounts found for Sub Works under this Work.",
      });
    }

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName.replace(/[^\w\-]+/g, "_")}_Recapitulation.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const rupeeFonts = registerRupeeFonts(doc);

    const money = (n) => formatInrAmount(n, { roundToRupee: false });

    const left = 40;
    const right = 555;
    const labelX = 40;
    const nameValueX = 150;
    const nameValueWidth = right - nameValueX;
    const numX = 55;
    const subWorkX = 90;
    const amountX = 460;
    const amountWidth = right - amountX;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    doc.font("Helvetica-Bold").fontSize(14);
    doc.text("Recapitulation Sheet", 0, 40, { align: "center" });
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold").fontSize(10);
    const nameOfWorkTop = doc.y;
    doc.text("Name of Work", labelX, nameOfWorkTop);
    doc.text(projectName, nameValueX, nameOfWorkTop, { width: nameValueWidth });

    doc.moveDown(0.9);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font("Helvetica-Bold").fontSize(10);
    const headingY = doc.y;
    doc.text("Sub Work", subWorkX, headingY);
    doc.text("Amount", amountX, headingY, {
      width: amountWidth,
      align: "right",
    });
    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.1);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.6);

    subWorkRows.forEach((row, idx) => {
      if (doc.y > pageBottom - 40) {
        doc.addPage();
      }
      const rowY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(String(idx + 1), numX, rowY);
      doc.font("Helvetica").fontSize(10);
      doc.text(row.label, subWorkX, rowY, { width: amountX - subWorkX - 10 });
      doc.font(rupeeFonts.regular).fontSize(10);
      doc.text(money(row.amount), amountX, rowY, {
        width: amountWidth,
        align: "right",
      });
      doc.moveDown(1);
    });

    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    doc.text("-".repeat(88), left, doc.y);
    doc.moveDown(0.8);

    const totalLabelY = doc.y;
    doc.font("Helvetica").fontSize(10);
    doc.text("Total Amount", subWorkX, totalLabelY);
    doc.font(rupeeFonts.regular).fontSize(10);
    doc.text(money(totalAmount), amountX, totalLabelY, {
      width: amountWidth,
      align: "right",
    });
    doc.moveDown(1);

    const roundLabelY = doc.y;
    doc.font("Helvetica").fontSize(10);
    doc.text("Round off", subWorkX, roundLabelY);
    doc.font(rupeeFonts.regular).fontSize(10);
    doc.text(money(roundOff), amountX, roundLabelY, {
      width: amountWidth,
      align: "right",
    });
    doc.moveDown(1);

    doc.font("Helvetica").fontSize(10);
    doc.text("-".repeat(88), left, doc.y);

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

/**
 * Lead Statement Report — portrait table grouped by SSR Region.
 * Columns: Sr.No. | Material Name | Quarry Name | Lead Distance in Km | Lead Charges
 */
app.get("/api/generate-lead-statement-report", async (req, res) => {
  const workId = Number(req.query.workId || req.query.projectId);
  if (!workId) {
    return res.status(400).json({ message: "Please Select Work." });
  }

  try {
    const workResult = await pool.query(
      `SELECT "MasterWorkId", "WorkName"
       FROM "MasterWork"
       WHERE "MasterWorkId" = $1`,
      [workId],
    );
    if (!workResult.rows[0]) {
      return res.status(404).json({ message: "Selected Work was not found." });
    }
    const workName = workResult.rows[0].WorkName || "Untitled Work";

    const regionResult = await pool.query(
      `SELECT DISTINCT i."RegionId" AS "SSRRegionId",
              r."SSRRegionName", r."SSRRegionShortName"
       FROM "WorkAbstract" wa
       INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
       INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = i."RegionId"
       WHERE wa."WorkId" = $1
         AND i."RegionId" IS NOT NULL
       ORDER BY r."SSRRegionName" ASC`,
      [workId],
    );

    const leadGroups = [];
    for (const region of regionResult.rows) {
      const materialsResult = await pool.query(
        `
        SELECT DISTINCT ON (mc."MaterialId")
          mc."MaterialId",
          m."MaterialShortDescription",
          u."UnitShortName",
          wl."QuaryName",
          wl."LeadDistanceKm",
          wl."Remarks",
          wl."Lead"
        FROM "WorkAbstract" wa
        INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
        INNER JOIN "MasterMaterialComponent" mc ON mc."ItemId" = i."ItemId"
        INNER JOIN "MasterMaterial" m ON m."MaterialId" = mc."MaterialId"
        LEFT JOIN "MasterUnit" u ON u."UnitId" = m."MaterialUnitId"
        LEFT JOIN "WorkLead" wl
          ON wl."MasterWorkId" = $1
         AND wl."MaterialId" = mc."MaterialId"
        WHERE wa."WorkId" = $1
          AND i."RegionId" = $2
        ORDER BY mc."MaterialId", m."MaterialShortDescription" ASC NULLS LAST
        `,
        [workId, region.SSRRegionId],
      );

      if (!materialsResult.rows.length) continue;

      const rows = [...materialsResult.rows].sort((a, b) =>
        String(a.MaterialShortDescription || "").localeCompare(
          String(b.MaterialShortDescription || ""),
        ),
      );

      leadGroups.push({
        SSRRegionId: region.SSRRegionId,
        SSRRegionName: region.SSRRegionName,
        SSRRegionShortName: region.SSRRegionShortName,
        rows,
      });
    }

    if (!leadGroups.length) {
      return res.status(404).json({
        message:
          "No lead materials found for this work. Add abstract items with material components first.",
      });
    }

    const fmtNum = (value, digits = 2) => {
      if (value === null || value === undefined || value === "") return "";
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      return n.toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    };

    const fmtLeadKm = (value) => {
      if (value === null || value === undefined || value === "") return "";
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      const text = Number.isInteger(n) ? String(n) : fmtNum(n, 2);
      return `${text} Km.`;
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(workName).replace(/[^\w\-]+/g, "_")}_LeadStatement.pdf"`,
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
    });
    doc.pipe(res);

    const left = 40;
    const right = doc.page.width - 40;
    const width = right - left;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    // Portrait columns:
    // 1 Sr.No. | 2 Material Name | 3 Quarry Name | 4 Lead Distance in Km | 5 Lead Charges
    const col = {
      sr: left,
      material: left + 40,
      quarry: left + 220,
      leadKm: left + 355,
      lead: left + 445,
    };
    const colW = {
      sr: 40,
      material: 180,
      quarry: 135,
      leadKm: 90,
      lead: right - (left + 445),
    };
    const xLines = [
      left,
      col.material,
      col.quarry,
      col.leadKm,
      col.lead,
      right,
    ];

    const ensureSpace = (needed) => {
      if (doc.y + needed > pageBottom - 24) {
        doc.addPage();
        return true;
      }
      return false;
    };

    const drawOuterBoxTop = (y) => {
      doc.moveTo(left, y).lineTo(right, y).stroke();
    };

    const drawRowBorders = (yTop, yBottom) => {
      doc.moveTo(left, yBottom).lineTo(right, yBottom).stroke();
      for (const x of xLines) {
        doc.moveTo(x, yTop).lineTo(x, yBottom).stroke();
      }
    };

    const drawPageHeader = () => {
      doc.font("Helvetica-Bold").fontSize(14);
      doc.text("Lead Statement", left, doc.y, { width, align: "center" });
      doc.moveDown(0.55);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`Name of Work : ${workName}`, left, doc.y, { width });
      doc.moveDown(0.7);
    };

    const drawColumnHeader = () => {
      const pad = 4;
      const headerLines = [
        { x: col.sr, w: colW.sr, t: "Sr.No.", align: "center" },
        { x: col.material, w: colW.material, t: "Material Name", align: "left" },
        { x: col.quarry, w: colW.quarry, t: "Quarry Name", align: "left" },
        {
          x: col.leadKm,
          w: colW.leadKm,
          t: "Lead Distance\n(in Km.)",
          align: "center",
        },
        {
          x: col.lead,
          w: colW.lead,
          t: "Lead Charges\n(In Rs.)",
          align: "center",
        },
      ];
      const h = Math.max(
        28,
        ...headerLines.map(
          (c) => doc.heightOfString(c.t, { width: c.w - pad * 2 }) + pad * 2,
        ),
      );
      const yTop = doc.y;
      drawOuterBoxTop(yTop);
      doc.font("Helvetica-Bold").fontSize(8);
      for (const c of headerLines) {
        doc.text(c.t, c.x + pad, yTop + pad, {
          width: c.w - pad * 2,
          align: c.align,
        });
      }
      const yBottom = yTop + h;
      drawRowBorders(yTop, yBottom);
      doc.y = yBottom;
    };

    const drawRegionRow = (regionLabel) => {
      const pad = 4;
      const h = 18;
      const yTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text(regionLabel, left + pad, yTop + pad, {
        width: width - pad * 2,
        align: "left",
      });
      const yBottom = yTop + h;
      doc.moveTo(left, yBottom).lineTo(right, yBottom).stroke();
      doc.moveTo(left, yTop).lineTo(left, yBottom).stroke();
      doc.moveTo(right, yTop).lineTo(right, yBottom).stroke();
      doc.y = yBottom;
    };

    drawPageHeader();
    drawColumnHeader();

    for (const group of leadGroups) {
      const regionLabel =
        group.SSRRegionName || group.SSRRegionShortName || "Region";

      if (ensureSpace(50)) {
        drawPageHeader();
        drawColumnHeader();
      }
      drawRegionRow(regionLabel);

      let sr = 0;
      for (const row of group.rows) {
        sr += 1;
        const material =
          row.MaterialShortDescription || String(row.MaterialId || "");
        const quarry = row.QuaryName || "";
        const leadKm = fmtLeadKm(row.LeadDistanceKm);
        const leadCharges = fmtNum(row.Lead, 2);
        const pad = 3;

        doc.font("Helvetica").fontSize(8);
        const rowHeight = Math.max(
          16,
          doc.heightOfString(material, { width: colW.material - pad * 2 }) +
            pad * 2,
          doc.heightOfString(quarry, { width: colW.quarry - pad * 2 }) +
            pad * 2,
        );

        if (ensureSpace(rowHeight + 4)) {
          drawPageHeader();
          drawColumnHeader();
          drawRegionRow(`${regionLabel} (contd.)`);
          doc.font("Helvetica").fontSize(8);
        }

        const yTop = doc.y;
        doc.text(String(sr), col.sr + pad, yTop + pad, {
          width: colW.sr - pad * 2,
          align: "center",
        });
        doc.text(material, col.material + pad, yTop + pad, {
          width: colW.material - pad * 2,
        });
        doc.text(quarry, col.quarry + pad, yTop + pad, {
          width: colW.quarry - pad * 2,
        });
        doc.text(leadKm, col.leadKm + pad, yTop + pad, {
          width: colW.leadKm - pad * 2,
          align: "center",
        });
        doc.text(leadCharges, col.lead + pad, yTop + pad, {
          width: colW.lead - pad * 2,
          align: "right",
        });
        const yBottom = yTop + rowHeight;
        drawRowBorders(yTop, yBottom);
        doc.y = yBottom;
      }
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i += 1) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8);
      doc.text(`Page ${i + 1} of ${pageCount}`, left, doc.page.height - 28, {
        width,
        align: "center",
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

app.get("/api/generate-measurement-report", async (req, res) => {
  const { projectId, subWorkId } = req.query;

  if (!projectId) {
    return res.status(400).json({ message: "projectId is required." });
  }

  try {
    // WorkAbstract."ProjectId" stores MasterWorkId
    const workResult = await pool.query(
      `SELECT "WorkName" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [projectId],
    );
    const projectName = workResult.rows[0]?.WorkName || "Untitled Work";

    // ── Pull every WorkAbstract (item) for the work, LEFT JOINed to its
    //    measurements so items with zero measurement rows still come back
    //    (with null measurement columns) instead of being dropped ──
    const params = [projectId];
    let subWorkFilter = "";
    if (subWorkId && subWorkId !== "all") {
      subWorkFilter = `AND sw."SubWorkId" = $2`;
      params.push(subWorkId);
    }

    const query = `
        SELECT
          sw."SubWorkId",
          sw."SubWorkName",
          wa."WorkAbstractId",
          i."ItemId",
          i."ItemNumber",
          i."ItemDescription",
          u."UnitShortName",
          wm."MeasurementId",
          wm."Sequence",
          wm."Description"    AS "MeasurementDescription",
          wm."Expression",
          wm."Number",
          wm."Length",
          wm."Breadth",
          wm."Height",
          wm."Quantity"       AS "MeasurementQuantity"
        FROM "WorkAbstract" wa
        JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
        JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
        JOIN "MasterSubWork" sw ON sw."SubWorkId" = wa."SubWorkId"
        JOIN "WorkMeasurement" wm ON wm."WorkAbstractId" = wa."WorkAbstractId"
        WHERE wa."WorkId" = $1
        ${subWorkFilter}
        ORDER BY sw."SubWorkName",
                 COALESCE(wa."Sequence", 999999) ASC,
                 i."ItemNumber",
                 COALESCE(wm."Sequence", 999999) ASC,
                 wm."MeasurementId" ASC
      `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this selection." });
    }

    // ── Format a single measurement line's "expression" ──
    // Prefer the stored Expression text verbatim (it's typically hand-entered,
    // e.g. "1*69*3.00*0.30"). Fall back to composing one from the numeric
    // columns only if Expression itself is missing.
    const formatExpression = (row) => {
      if (row.Expression && row.Expression.trim() !== "") {
        return row.Expression.trim();
      }
      const parts = [row.Number, row.Length, row.Breadth, row.Height].filter(
        (v) => v !== null && v !== undefined && Number(v) !== 0,
      );
      if (parts.length === 0) return "";
      return parts
        .map((v) => {
          const n = Number(v);
          return Number.isInteger(n) ? String(n) : n.toFixed(2);
        })
        .join("*");
    };

    // ── Group rows into SubWork -> Item -> Measurement[] ──
    // Key by ItemId (not WorkAbstractId) so duplicate abstract rows for the
    // same SSR item collapse into one report block.
    const subWorkGroups = [];
    const subWorkIndexById = new Map();
    const itemIndexByKey = new Map();

    for (const row of rows) {
      if (!subWorkIndexById.has(row.SubWorkId)) {
        subWorkIndexById.set(row.SubWorkId, subWorkGroups.length);
        subWorkGroups.push({ subWorkName: row.SubWorkName, items: [] });
      }
      const group = subWorkGroups[subWorkIndexById.get(row.SubWorkId)];
      const itemKey = `${row.SubWorkId}:${row.ItemId}`;

      if (!itemIndexByKey.has(itemKey)) {
        itemIndexByKey.set(itemKey, group.items.length);
        group.items.push({
          itemNumber: row.ItemNumber,
          itemDescription: row.ItemDescription,
          unitShortName: row.UnitShortName,
          measurements: [],
        });
      }
      const item = group.items[itemIndexByKey.get(itemKey)];

      item.measurements.push({
        measurementId: Number(row.MeasurementId),
        sequence: Number(row.Sequence || 0),
        description: row.MeasurementDescription || "",
        expressionText: formatExpression(row),
        quantity: Number(row.MeasurementQuantity || 0),
      });
    }

    // Order by Sequence (then MeasurementId) — first sequence at the top
    for (const group of subWorkGroups) {
      for (const item of group.items) {
        item.measurements.sort((a, b) => {
          const seqDiff =
            (a.sequence || 999999) - (b.sequence || 999999);
          if (seqDiff !== 0) return seqDiff;
          return a.measurementId - b.measurementId;
        });
      }
    }

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName.replace(/[^\w\-]+/g, "_")}_Measurement.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const colX = { desc: 40, measurement: 272, qty: 490 };
    const descWidth = 555 - colX.desc; // full-width description line
    const measurementColWidth = colX.qty - colX.measurement - 8;
    const measurementQtyWidth = 555 - colX.qty;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    // Title / SSR year / name of work — no table header here, that's drawn
    // per sub-work group below (so it always sits above the table, as agreed).
    const drawPageHeader = () => {
      doc.font("Helvetica-Bold").fontSize(14);
      doc.text("Measurement Sheet", 0, 40, { align: "center" });
      doc.moveDown(1.2);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`Name of Work :   ${projectName}`, colX.desc, doc.y, {
        width: descWidth,
      });
      doc.moveDown(0.3);
      doc.text("SSR YEAR   2022-2023", 0, doc.y, { align: "right" });
      doc.moveDown(0.5);
    };

    const drawSubWorkTitleAndTableHeader = (groupIdx, subWorkName) => {
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(
        `${groupIdx + 1}. NAME OF SUB WORK -- ${subWorkName}`,
        colX.desc,
        doc.y,
      );
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.3);
      const tableTop = doc.y;
      doc.text("Item No. & Description", colX.desc, tableTop);
      doc.text("Measurement", colX.measurement, tableTop, {
        width: measurementColWidth,
        align: "left",
      });
      doc.text("Quantity", colX.qty, tableTop, {
        width: measurementQtyWidth,
        align: "right",
      });
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(8);
      doc.text("No.   L.   B.   D.", colX.measurement, doc.y, {
        width: measurementColWidth,
        align: "left",
      });
      doc.moveDown(0.4);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);
    };

    subWorkGroups.forEach((group, groupIdx) => {
      if (groupIdx > 0) doc.addPage();
      drawPageHeader();
      drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);

      group.items.forEach((item, itemIdx) => {
        const numberSuffix = item.itemNumber
          ? ` (Ref Item No: ${item.itemNumber})`
          : "";
        const descriptionWithNumber = `${item.itemDescription || ""}${numberSuffix}`;
        const itemLabel = `ITEM NO. : ${itemIdx + 1}  ${descriptionWithNumber}`;
        const leftDescWidth = colX.measurement - colX.desc - 10;

        doc.font("Helvetica").fontSize(9);
        const itemLabelHeight = doc.heightOfString(itemLabel, {
          width: leftDescWidth,
        });

        const lineHeight = 14;
        const measurementBlockHeight = item.measurements.reduce((sum, m) => {
          const descText = (m.description || "").trim();
          doc.font("Helvetica").fontSize(9);
          const leftH = descText
            ? doc.heightOfString(descText, { width: leftDescWidth })
            : 0;
          const exprH = doc.heightOfString(m.expressionText || "", {
            width: measurementColWidth,
          });
          return sum + Math.max(leftH, exprH, lineHeight) + 6;
        }, 0);
        const totalLineHeight = lineHeight;
        const blockPadding = 14;

        const blockHeight =
          itemLabelHeight +
          measurementBlockHeight +
          totalLineHeight +
          blockPadding;

        if (doc.y + blockHeight > pageBottom - 30) {
          doc.addPage();
          drawPageHeader();
          drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);
        }

        // ── Item heading on the left ──
        doc.font("Helvetica-Bold").fontSize(9);
        doc.text(`ITEM NO. : ${itemIdx + 1}`, colX.desc, doc.y, {
          continued: true,
        });
        doc.font("Helvetica").fontSize(9);
        doc.text(`  ${descriptionWithNumber}`, { width: leftDescWidth });
        doc.moveDown(0.4);

        // ── Per row: Description (left) | Measurements (center) | Quantity (right) ──
        let totalQuantity = 0;
        item.measurements.forEach((m) => {
          totalQuantity += m.quantity;
          const descText = (m.description || "").trim();
          const rowTop = doc.y;

          doc.font("Helvetica").fontSize(9);
          const leftH = descText
            ? doc.heightOfString(descText, { width: leftDescWidth })
            : 0;
          const exprH = doc.heightOfString(m.expressionText || "", {
            width: measurementColWidth,
          });
          const rowH = Math.max(leftH, exprH, lineHeight);

          if (descText) {
            doc.text(descText, colX.desc, rowTop, { width: leftDescWidth });
          }
          doc.text(m.expressionText || "", colX.measurement, rowTop, {
            width: measurementColWidth,
          });
          doc.text(m.quantity.toFixed(3), colX.qty, rowTop, {
            width: measurementQtyWidth,
            align: "right",
          });

          doc.y = Math.max(doc.y, rowTop + rowH);
          doc.moveDown(0.45);
        });

        // ── Total Quantity line ──
        doc.font("Helvetica-Bold").fontSize(9);
        const totalY = doc.y;
        doc.text("Total Quantity", colX.measurement, totalY, {
          width: measurementColWidth,
        });
        doc.text(
          `${totalQuantity.toFixed(3)} ${item.unitShortName}`,
          colX.qty,
          totalY,
          { width: measurementQtyWidth, align: "right" },
        );
        doc.moveDown(1.2);
      });
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

app.get("/api/generate-item-catalog-report", async (req, res) => {
  const { ssrYearId, regionId, categoryId, subCategoryId } = req.query;

  if (!ssrYearId || !regionId) {
    return res
      .status(400)
      .json({ message: "ssrYearId and regionId are required." });
  }

  try {
    const params = [ssrYearId, regionId];
    let extraFilters = "";
    if (categoryId) {
      params.push(categoryId);
      extraFilters += ` AND i."CategoryId" = $${params.length}`;
    }
    if (subCategoryId) {
      params.push(subCategoryId);
      extraFilters += ` AND i."SubCategoryId" = $${params.length}`;
    }

    // NOTE: assumes MasterSSRCategory has a "CategoryName" column, following
    // the same naming convention as ProjectName / SubWorkName elsewhere.
    // Adjust the join/column name if that's not the case.
    const query = `
        SELECT
          i."ItemId",
          i."ItemNumber",
          i."ItemDescription",
          i."ItemShortDescription",
          i."ParentId",
          i."IsChild",
          i."IsFinal",
          i."CompletedRate",
          i."LabourRate",
          i."CategoryId",
          cat."SSRCategoryName",
          i."DOrder",
          i."DOrder1",
          u."UnitShortName"
        FROM "MasterItem" i
        LEFT JOIN "MasterSSRCategory" cat ON cat."SSRCategoryId" = i."CategoryId"
        LEFT JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
        WHERE i."SSRYearId" = $1
          AND i."RegionId" = $2
          AND i."MarkForDeletion" = false
          ${extraFilters}
        ORDER BY i."CategoryId", i."DOrder", i."DOrder1", i."ItemNumber"
      `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this selection." });
    }

    // ── Group into categories (first-seen order) ──
    const categories = [];
    const categoryIndexById = new Map();

    for (const row of rows) {
      const catKey = row.CategoryId ?? "uncategorized";
      if (!categoryIndexById.has(catKey)) {
        categoryIndexById.set(catKey, categories.length);
        categories.push({
          categoryName: row.SSRCategoryName || "Uncategorized",
          itemsByNumber: new Map(),
          rootNumbers: [],
        });
      }
      const cat = categories[categoryIndexById.get(catKey)];
      // Rows are pre-sorted by DOrder/DOrder1/ItemNumber, so insertion order
      // into this map already reflects display order.
      const key = row.ItemNumber || `__no_number_${row.ItemId}`;
      cat.itemsByNumber.set(key, { ...row, children: [] });
    }

    // ── Build parent/child links from ItemNumber's dot-notation, NOT
    //    ParentId (ParentId wasn't reliably linking rows in practice).
    //    "4.1.10"  -> parent "4.1"
    //    "4.1.10A" -> parent "4.1"  (letter suffix stays on the last
    //                                segment, so it's a SIBLING of 4.1.10,
    //                                not its child) ──
    categories.forEach((cat) => {
      for (const [itemNumber, item] of cat.itemsByNumber) {
        const segments = itemNumber.split(".");
        const parentNumber = segments.slice(0, -1).join(".");
        if (parentNumber && cat.itemsByNumber.has(parentNumber)) {
          cat.itemsByNumber.get(parentNumber).children.push(item);
        } else {
          cat.rootNumbers.push(itemNumber);
        }
      }
    });

    // ── A non-final node is rendered bold ONLY if every one of its children
    //    is a final (priced) leaf — i.e. it's a heading directly above
    //    priced rows, rather than a paragraph with further sub-headings
    //    beneath it. Matches "5.33" (paragraph) vs "5.33.1" (bold) pattern. ──
    const isBoldHeading = (item) =>
      !item.IsFinal &&
      item.children.length > 0 &&
      item.children.every((c) => c.IsFinal);

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="SSR_Item_Catalog.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const money = (n) =>
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const pageLeft = 40;
    const pageRight = 555;
    const colCode = 40;
    const colCodeWidth = 52;
    const colUnit = 370;
    const colUnitWidth = 42;
    const colCompleted = 415;
    const colLabour = 485;
    const rateColWidth = 65;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const indentPerDepth = 12;
    const rowGap = 6;

    const drawPageHeader = () => {
      doc.font("Helvetica-Bold").fontSize(9);
      const y = doc.page.margins.top;
      doc.text("Code No", colCode, y, { width: colCodeWidth, lineBreak: false });
      doc.text("Description", 100, y, {
        width: colUnit - 110,
        lineBreak: false,
      });
      doc.text("Unit", colUnit, y, { width: colUnitWidth, lineBreak: false });
      doc.text("Completed Rate", colCompleted, y, {
        width: rateColWidth,
        align: "right",
        lineBreak: false,
      });
      doc.text("Labour Rate", colLabour, y, {
        width: rateColWidth,
        align: "right",
        lineBreak: false,
      });
      const headerBottom = y + 14;
      doc
        .moveTo(pageLeft, headerBottom)
        .lineTo(pageRight, headerBottom)
        .stroke();
      doc.y = headerBottom + 8;
    };

    const drawCategoryHeading = (categoryName) => {
      const needed = 24;
      if (doc.y + needed > pageBottom) {
        doc.addPage();
        drawPageHeader();
      }
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(categoryName || "Uncategorized", colCode, doc.y, {
        width: pageRight - colCode,
      });
      doc.moveDown(0.4);
    };

    // Measures + draws a single item row; advances doc.y past full description.
    const drawItemRow = (item, depth) => {
      if (!item) return;

      const descX = 100 + depth * indentPerDepth;
      const descWidth = colUnit - descX - 8;
      const codeX = colCode + depth * indentPerDepth;
      const codeWidth = Math.max(28, descX - codeX - 4);

      const bold = isBoldHeading(item);
      const isLeaf = item.IsFinal;
      const label = String(
        item.ItemDescription || item.ItemShortDescription || "",
      );

      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      const descHeight = Math.max(
        12,
        doc.heightOfString(label, {
          width: descWidth,
          align: "justify",
        }),
      );
      const rowHeight = descHeight + rowGap;

      if (doc.y + rowHeight > pageBottom) {
        doc.addPage();
        drawPageHeader();
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      }

      const rowTop = doc.y;

      if (item.ItemNumber) {
        doc.text(String(item.ItemNumber), codeX, rowTop, {
          width: codeWidth,
          lineBreak: false,
        });
      }

      doc.text(label, descX, rowTop, {
        width: descWidth,
        align: "justify",
      });

      // Capture bottom after justified description, then pin unit/rates to row top.
      const afterDescY = doc.y;

      if (isLeaf) {
        doc.font("Helvetica").fontSize(9);
        doc.text(item.UnitShortName || "", colUnit, rowTop, {
          width: colUnitWidth,
          lineBreak: false,
        });
        doc.text(money(item.CompletedRate), colCompleted, rowTop, {
          width: rateColWidth,
          align: "right",
          lineBreak: false,
        });
        doc.text(money(item.LabourRate), colLabour, rowTop, {
          width: rateColWidth,
          align: "right",
          lineBreak: false,
        });
      }

      doc.y = Math.max(afterDescY, rowTop + rowHeight) + 2;

      item.children.forEach((child) => drawItemRow(child, depth + 1));
    };

    categories.forEach((cat, catIdx) => {
      if (catIdx > 0) doc.addPage();
      drawPageHeader();
      drawCategoryHeading(cat.categoryName);

      cat.rootNumbers.forEach((rootNumber) => {
        drawItemRow(cat.itemsByNumber.get(rootNumber), 0);
      });
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
});

/** Ensure WorkStandardAddition labour-cess columns exist. */
async function ensureWorkStandardAdditionSchema() {
  await pool.query(`
    ALTER TABLE "WorkStandardAddition"
      ADD COLUMN IF NOT EXISTS "ApplyLabourCess" boolean NOT NULL DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE "WorkStandardAddition"
      ADD COLUMN IF NOT EXISTS "LabourCess" numeric
  `);
  console.log("WorkStandardAddition schema ensured (ApplyLabourCess, LabourCess).");
}

/** Keep WorkStandardAddition / WorkLead / WorkMaterial serials in sync after bulk imports. */
async function ensureWorkEstimateSequences() {
  for (const [table, column] of [
    ["WorkStandardAddition", "WorkStandardAdditionId"],
    ["WorkLead", "WorkLeadId"],
    ["WorkMaterial", "WorkMaterialId"],
  ]) {
    const seqRes = await pool.query(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [`"${table}"`, column],
    );
    const seq = seqRes.rows[0]?.seq;
    if (!seq) continue;
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX("${column}"), 0)::bigint AS max FROM "${table}"`,
    );
    await pool.query(
      `SELECT setval($1::regclass, GREATEST($2::bigint, 1), true)`,
      [seq, maxRes.rows[0].max],
    );
  }
}

/** Interpolate CostPerTrip for a kilometer against sorted schedule rows. */
function interpolateCostPerTrip(leadKm, scheduleRows) {
  const km = Number(leadKm);
  if (!Number.isFinite(km) || !Array.isArray(scheduleRows) || !scheduleRows.length) {
    return null;
  }
  const rows = scheduleRows
    .map((r) => ({
      Kilometer: Number(r.Kilometer),
      CostPerTrip: Number(r.CostPerTrip),
    }))
    .filter((r) => Number.isFinite(r.Kilometer) && Number.isFinite(r.CostPerTrip))
    .sort((a, b) => a.Kilometer - b.Kilometer);

  if (!rows.length) return null;

  const exact = rows.find((r) => r.Kilometer === km);
  if (exact) return exact.CostPerTrip;

  let lower = null;
  let upper = null;
  for (const r of rows) {
    if (r.Kilometer <= km) lower = r;
    if (r.Kilometer >= km && !upper) upper = r;
  }

  if (lower && upper && lower.Kilometer !== upper.Kilometer) {
    return (
      lower.CostPerTrip +
      ((upper.CostPerTrip - lower.CostPerTrip) * (km - lower.Kilometer)) /
        (upper.Kilometer - lower.Kilometer)
    );
  }
  if (lower) return lower.CostPerTrip;
  if (upper) return upper.CostPerTrip;
  return null;
}

async function loadEffectiveCostSchedule(isManual, regionId, creationDate) {
  const table = isManual ? "CostPerTripManual" : "CostPerTrip";
  const effResult = await pool.query(
    `
    SELECT MAX("EffectiveDate") AS "EffectiveDate"
    FROM "${table}"
    WHERE "SSRRegionId" = $1
      AND (
        $2::date IS NULL
        OR "EffectiveDate" IS NULL
        OR "EffectiveDate" <= $2::date
      )
    `,
    [Number(regionId), creationDate || null],
  );
  let effectiveDate = effResult.rows[0]?.EffectiveDate || null;

  if (!effectiveDate) {
    const fallback = await pool.query(
      `SELECT MAX("EffectiveDate") AS "EffectiveDate"
       FROM "${table}"
       WHERE "SSRRegionId" = $1`,
      [Number(regionId)],
    );
    effectiveDate = fallback.rows[0]?.EffectiveDate || null;
  }

  if (!effectiveDate) {
    const anyRows = await pool.query(
      `SELECT "Kilometer", "CostPerTrip"
       FROM "${table}"
       WHERE "SSRRegionId" = $1
       ORDER BY "Kilometer" ASC`,
      [Number(regionId)],
    );
    return anyRows.rows;
  }

  const result = await pool.query(
    `SELECT "Kilometer", "CostPerTrip"
     FROM "${table}"
     WHERE "SSRRegionId" = $1
       AND "EffectiveDate" = $2::date
     ORDER BY "Kilometer" ASC`,
    [Number(regionId), effectiveDate],
  );
  return result.rows;
}

async function calculateLeadAmount({
  workId,
  materialId,
  regionId,
  leadDistanceKm,
}) {
  const workResult = await pool.query(
    `SELECT to_char("CreationDate", 'YYYY-MM-DD') AS "CreationDate"
     FROM "MasterWork"
     WHERE "MasterWorkId" = $1`,
    [Number(workId)],
  );
  const creationDate = workResult.rows[0]?.CreationDate || null;

  const materialResult = await pool.query(
    `SELECT m."MaterialId", m."SSRRegionId", m."IsManual",
            m."MaterialLoadFactor", m."MaterialUnitId", m."MaterialLocalUnitId"
     FROM "MasterMaterial" m
     WHERE m."MaterialId" = $1`,
    [Number(materialId)],
  );
  const material = materialResult.rows[0];
  if (!material) {
    return { lead: null, message: "Material not found." };
  }

  const effectiveRegionId = regionId || material.SSRRegionId;
  const isManual = Boolean(material.IsManual);
  const loadFactor = Number(material.MaterialLoadFactor);
  const schedule = await loadEffectiveCostSchedule(
    isManual,
    effectiveRegionId,
    creationDate,
  );
  const costPerTrip = interpolateCostPerTrip(leadDistanceKm, schedule);
  if (costPerTrip === null || !Number.isFinite(costPerTrip)) {
    return { lead: null, message: "No cost schedule found for this lead." };
  }
  const factor = Number.isFinite(loadFactor) ? loadFactor : 0;
  if (!factor) {
    return {
      lead: null,
      message: "Material LoadFactor is missing or zero.",
    };
  }
  const lead = Number((costPerTrip / factor).toFixed(4));
  return {
    lead,
    costPerTrip,
    loadFactor: factor,
    isManual,
    creationDate,
  };
}

app.get("/api/generate-estimate", async (req, res) => {
  const { workId, regionId, ssrYearId } = req.query;
  if (!workId) {
    return res.status(400).json({ message: "workId is required." });
  }

  try {
    await ensureWorkStandardAdditionSchema();
    const workResult = await pool.query(
      `SELECT "MasterWorkId", "WorkName"
       FROM "MasterWork"
       WHERE "MasterWorkId" = $1
         AND COALESCE("MarkForDeletion", false) = false`,
      [Number(workId)],
    );
    const work = workResult.rows[0];
    if (!work) {
      return res.status(404).json({ message: "Work not found." });
    }

    // Distinct SSR regions from WorkAbstract checked items
    // PLUS any region previously saved in WorkStandardAddition for this Work
    const regionResult = await pool.query(
      `
      SELECT DISTINCT x."SSRRegionId", r."SSRRegionName", r."SSRRegionShortName"
      FROM (
        SELECT DISTINCT i."RegionId" AS "SSRRegionId"
        FROM "WorkAbstract" wa
        INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
        WHERE wa."WorkId" = $1
          AND i."RegionId" IS NOT NULL
        UNION
        SELECT DISTINCT wsa."SSRRegionId"
        FROM "WorkStandardAddition" wsa
        WHERE wsa."MasterWorkId" = $1
          AND wsa."SSRRegionId" IS NOT NULL
      ) x
      INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = x."SSRRegionId"
      ORDER BY r."SSRRegionName" ASC
      `,
      [Number(workId)],
    );

    const regions = [];
    for (const region of regionResult.rows) {
      // Years used by checked items of this Work in this region (via MasterItem.SSRYearId)
      const yearsResult = await pool.query(
        `SELECT DISTINCT y."Year"
         FROM "WorkAbstract" wa
         INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
         INNER JOIN "MasterYear" y ON y."YearId" = i."SSRYearId"
         WHERE wa."WorkId" = $1
           AND i."RegionId" = $2
           AND y."Year" IS NOT NULL`,
        [Number(workId), region.SSRRegionId],
      );
      const yearLabels = yearsResult.rows
        .map((row) => row.Year)
        .filter((y) => y != null && String(y).trim() !== "");

      const additionParams = [region.SSRRegionId];
      let additionQuery = `
        SELECT msa."MasterStandardAdditionId", msa."SSRRegionId",
               msa."Description", msa."Percentage", msa."Year",
               r."SSRRegionName", r."SSRRegionShortName"
        FROM "MasterStandardAddition" msa
        INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = msa."SSRRegionId"
        WHERE msa."SSRRegionId" = $1`;
      if (yearLabels.length > 0) {
        additionParams.push(yearLabels);
        additionQuery += ` AND msa."Year" = ANY($${additionParams.length}::text[])`;
      }
      additionQuery += ` ORDER BY msa."Year" ASC, msa."Description" ASC`;

      const additions = await pool.query(additionQuery, additionParams);

      const existing = await pool.query(
        `SELECT "WorkStandardAdditionId", "Description", "Percentage", "ApplyForLead",
                "ApplyLabourCess", "LabourCess"
         FROM "WorkStandardAddition"
         WHERE "MasterWorkId" = $1 AND "SSRRegionId" = $2
         ORDER BY "WorkStandardAdditionId" ASC
         LIMIT 1`,
        [Number(workId), region.SSRRegionId],
      );

      let selectedAdditionId = "";
      let applyForLead = true;
      let applyLabourCess = false;
      let labourCess = "";
      if (existing.rows[0]) {
        const match = additions.rows.find(
          (a) =>
            String(a.Description) === String(existing.rows[0].Description) &&
            Number(a.Percentage) === Number(existing.rows[0].Percentage),
        );
        selectedAdditionId = match
          ? String(match.MasterStandardAdditionId)
          : "";
        applyForLead = existing.rows[0].ApplyForLead !== false;
        applyLabourCess = existing.rows[0].ApplyLabourCess === true;
        labourCess =
          existing.rows[0].LabourCess === null ||
          existing.rows[0].LabourCess === undefined
            ? ""
            : String(existing.rows[0].LabourCess);
      }

      // Always show the region row: pre-filled if previously saved, otherwise blank
      regions.push({
        SSRRegionId: region.SSRRegionId,
        SSRRegionName: region.SSRRegionName,
        SSRRegionShortName: region.SSRRegionShortName,
        selectedAdditionId,
        ApplyForLead: applyForLead,
        ApplyLabourCess: applyLabourCess,
        LabourCess: labourCess,
        options: additions.rows,
      });
    }

    const workMeta = await pool.query(
      `SELECT "MasterWorkId", "WorkName",
              to_char("CreationDate", 'YYYY-MM-DD') AS "CreationDate"
       FROM "MasterWork"
       WHERE "MasterWorkId" = $1`,
      [Number(workId)],
    );
    const workInfo = workMeta.rows[0] || work;

    const leadRegionResult = await pool.query(
      `SELECT DISTINCT i."RegionId" AS "SSRRegionId",
              r."SSRRegionName", r."SSRRegionShortName"
       FROM "WorkAbstract" wa
       INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
       INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = i."RegionId"
       WHERE wa."WorkId" = $1
         AND i."RegionId" IS NOT NULL
       ORDER BY r."SSRRegionName" ASC`,
      [Number(workId)],
    );

    const leadGroups = [];
    for (const region of leadRegionResult.rows) {
      const materialsResult = await pool.query(
        `
        SELECT DISTINCT ON (mc."MaterialId")
          mc."MaterialId",
          m."MaterialShortDescription",
          m."MaterialUnitId",
          m."MaterialLocalUnitId",
          m."IsManual",
          m."MaterialLoadFactor",
          u."UnitShortName",
          wl."WorkLeadId",
          wl."QuaryName",
          wl."LeadDistanceKm",
          wl."Remarks",
          wl."Lead"
        FROM "WorkAbstract" wa
        INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
        INNER JOIN "MasterMaterialComponent" mc ON mc."ItemId" = i."ItemId"
        INNER JOIN "MasterMaterial" m ON m."MaterialId" = mc."MaterialId"
        LEFT JOIN "MasterUnit" u ON u."UnitId" = m."MaterialUnitId"
        LEFT JOIN "WorkLead" wl
          ON wl."MasterWorkId" = $1
         AND wl."MaterialId" = mc."MaterialId"
        WHERE wa."WorkId" = $1
          AND i."RegionId" = $2
        ORDER BY mc."MaterialId", m."MaterialShortDescription" ASC NULLS LAST
        `,
        [Number(workId), region.SSRRegionId],
      );

      if (!materialsResult.rows.length) continue;

      const sortedMaterials = [...materialsResult.rows].sort((a, b) =>
        String(a.MaterialShortDescription || "").localeCompare(
          String(b.MaterialShortDescription || ""),
        ),
      );

      const rows = [];
      for (const mat of sortedMaterials) {
        let leadValue =
          mat.Lead === null || mat.Lead === undefined ? null : Number(mat.Lead);
        const distance =
          mat.LeadDistanceKm === null || mat.LeadDistanceKm === undefined
            ? null
            : Number(mat.LeadDistanceKm);

        if (distance !== null && Number.isFinite(distance)) {
          const calc = await calculateLeadAmount({
            workId,
            materialId: mat.MaterialId,
            regionId: region.SSRRegionId,
            leadDistanceKm: distance,
          });
          if (calc.lead !== null) leadValue = calc.lead;
        }

        rows.push({
          MaterialId: mat.MaterialId,
          MaterialShortDescription: mat.MaterialShortDescription,
          MaterialUnitId: mat.MaterialUnitId,
          UnitShortName: mat.UnitShortName || "",
          IsManual: Boolean(mat.IsManual),
          MaterialLoadFactor: mat.MaterialLoadFactor,
          WorkLeadId: mat.WorkLeadId || null,
          QuaryName: mat.QuaryName || "",
          LeadDistanceKm:
            distance === null || !Number.isFinite(distance) ? "" : String(distance),
          Remarks: mat.Remarks || "",
          Lead: leadValue,
        });
      }

      leadGroups.push({
        SSRRegionId: region.SSRRegionId,
        SSRRegionName: region.SSRRegionName,
        SSRRegionShortName: region.SSRRegionShortName,
        rows,
      });
    }

    return res.json({
      work: {
        MasterWorkId: workInfo.MasterWorkId,
        WorkName: workInfo.WorkName,
        CreationDate: workInfo.CreationDate || null,
      },
      regions,
      leadGroups,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/calculate-lead", async (req, res) => {
  const { workId, materialId, regionId, leadDistanceKm } = req.body || {};
  if (!workId) {
    return res.status(400).json({ message: "workId is required." });
  }
  if (!materialId) {
    return res.status(400).json({ message: "materialId is required." });
  }
  if (
    leadDistanceKm === "" ||
    leadDistanceKm === null ||
    leadDistanceKm === undefined ||
    Number.isNaN(Number(leadDistanceKm))
  ) {
    return res.status(400).json({ message: "leadDistanceKm is required." });
  }

  try {
    const result = await calculateLeadAmount({
      workId,
      materialId,
      regionId,
      leadDistanceKm: Number(leadDistanceKm),
    });
    if (result.lead === null) {
      return res.status(400).json({
        message: result.message || "Unable to calculate lead.",
      });
    }
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/work-leads", async (req, res) => {
  const { workId, rows } = req.body || {};
  if (!workId) {
    return res.status(400).json({ message: "workId is required." });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "rows array is required." });
  }

  const client = await pool.connect();
  try {
    await ensureWorkEstimateSequences();
    await client.query("BEGIN");
    await client.query(`DELETE FROM "WorkLead" WHERE "MasterWorkId" = $1`, [
      Number(workId),
    ]);

    const inserted = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      if (!row.MaterialId) {
        throw Object.assign(
          new Error(`Row ${i + 1}: MaterialId is required.`),
          { status: 400 },
        );
      }
      if (
        row.LeadDistanceKm === "" ||
        row.LeadDistanceKm === null ||
        row.LeadDistanceKm === undefined ||
        Number.isNaN(Number(row.LeadDistanceKm))
      ) {
        throw Object.assign(
          new Error(`Row ${i + 1}: Lead in Km is required.`),
          { status: 400 },
        );
      }

      const materialMeta = await client.query(
        `SELECT "MaterialUnitId"
         FROM "MasterMaterial"
         WHERE "MaterialId" = $1`,
        [Number(row.MaterialId)],
      );
      const materialUnitId = Number(materialMeta.rows[0]?.MaterialUnitId);
      if (!materialUnitId) {
        throw Object.assign(
          new Error(
            `Row ${i + 1}: MaterialUnitId not found on MasterMaterial.`,
          ),
          { status: 400 },
        );
      }

      let leadValue =
        row.Lead === "" || row.Lead === null || row.Lead === undefined
          ? null
          : Number(row.Lead);
      if (leadValue === null || Number.isNaN(leadValue)) {
        const calc = await calculateLeadAmount({
          workId,
          materialId: row.MaterialId,
          regionId: row.SSRRegionId,
          leadDistanceKm: Number(row.LeadDistanceKm),
        });
        leadValue = calc.lead;
      }
      if (leadValue === null || Number.isNaN(Number(leadValue))) {
        throw Object.assign(
          new Error(`Row ${i + 1}: Unable to calculate Lead.`),
          { status: 400 },
        );
      }

      const result = await client.query(
        `INSERT INTO "WorkLead"
         ("MasterWorkId", "MaterialId", "Lead", "MaterialUnitId",
          "QuaryName", "Remarks", "LeadDistanceKm")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "WorkLeadId", "MasterWorkId", "MaterialId", "Lead",
                   "MaterialUnitId", "QuaryName", "Remarks", "LeadDistanceKm"`,
        [
          Number(workId),
          Number(row.MaterialId),
          Number(leadValue),
          materialUnitId,
          row.QuaryName ? String(row.QuaryName).trim() : null,
          row.Remarks ? String(row.Remarks).trim() : null,
          Number(row.LeadDistanceKm),
        ],
      );
      inserted.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return res.status(201).json({ data: inserted, count: inserted.length });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(error);
    return res
      .status(error.status || 500)
      .json({ message: error.message });
  } finally {
    client.release();
  }
});

app.post("/api/work-standard-additions", async (req, res) => {
  const { workId, rows } = req.body || {};
  if (!workId) {
    return res.status(400).json({ message: "workId is required." });
  }
  if (!Array.isArray(rows)) {
    return res.status(400).json({
      message: "rows must be an array (blank regions are omitted).",
    });
  }

  const client = await pool.connect();
  try {
    await ensureWorkStandardAdditionSchema();
    await ensureWorkEstimateSequences();
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM "WorkStandardAddition" WHERE "MasterWorkId" = $1`,
      [Number(workId)],
    );

    const inserted = [];
    for (const row of rows) {
      const regionId = row.SSRRegionId || row.regionId;
      const description = row.Description;
      const percentage = row.Percentage;
      if (!regionId || description === undefined || description === null) {
        throw Object.assign(
          new Error("Each row needs SSRRegionId, Description, and Percentage."),
          { status: 400 },
        );
      }
      const applyForLead =
        row.ApplyForLead === false ||
        row.ApplyForLead === "false" ||
        row.ApplyForLead === 0 ||
        row.ApplyForLead === "0"
          ? false
          : true;
      const applyLabourCess =
        row.ApplyLabourCess === true ||
        row.ApplyLabourCess === "true" ||
        row.ApplyLabourCess === 1 ||
        row.ApplyLabourCess === "1";
      let labourCess = null;
      if (applyLabourCess) {
        if (
          row.LabourCess === "" ||
          row.LabourCess === null ||
          row.LabourCess === undefined ||
          Number.isNaN(Number(row.LabourCess))
        ) {
          throw Object.assign(
            new Error(
              "Labour Cess (%) is required when Apply Labour Cess is Yes.",
            ),
            { status: 400 },
          );
        }
        labourCess = Number(row.LabourCess);
      }
      const result = await client.query(
        `INSERT INTO "WorkStandardAddition"
         ("MasterWorkId", "SSRRegionId", "Description", "Percentage",
          "ApplyForLead", "ApplyLabourCess", "LabourCess")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "WorkStandardAdditionId", "MasterWorkId", "SSRRegionId",
                   "Description", "Percentage", "ApplyForLead",
                   "ApplyLabourCess", "LabourCess"`,
        [
          Number(workId),
          Number(regionId),
          String(description).trim(),
          Number(percentage),
          applyForLead,
          applyLabourCess,
          labourCess,
        ],
      );
      inserted.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return res.status(201).json({ data: inserted, count: inserted.length });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(error);
    return res
      .status(error.status || 500)
      .json({ message: error.message });
  } finally {
    client.release();
  }
});

/**
 * Populate / update WorkMaterial and WorkAbstract rates for a Work.
 * WorkStandardAddition is optional per region (blank regions use % = 0).
 */
app.post("/api/populate-work-materials", async (req, res) => {
  const { workId } = req.body || {};
  const resolvedWorkId = Number(workId);
  if (!resolvedWorkId) {
    return res.status(400).json({ message: "workId is required." });
  }

  const client = await pool.connect();
  try {
    await ensureWorkEstimateSequences();
    await client.query("BEGIN");

    const workRow = await client.query(
      `SELECT "MasterWorkId", "WorkName" FROM "MasterWork" WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    if (!workRow.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Selected Work was not found." });
    }

    const additionsResult = await client.query(
      `SELECT "WorkStandardAdditionId", "SSRRegionId", "Percentage", "ApplyForLead"
       FROM "WorkStandardAddition"
       WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    const additionByRegion = new Map(
      additionsResult.rows.map((row) => [
        Number(row.SSRRegionId),
        {
          WorkStandardAdditionId: Number(row.WorkStandardAdditionId),
          Percentage: Number(row.Percentage) || 0,
          ApplyForLead: row.ApplyForLead !== false,
        },
      ]),
    );

    const leadsResult = await client.query(
      `SELECT "MaterialId", "LeadDistanceKm", "Lead"
       FROM "WorkLead"
       WHERE "MasterWorkId" = $1`,
      [resolvedWorkId],
    );
    const leadByMaterial = new Map(
      leadsResult.rows.map((row) => [
        Number(row.MaterialId),
        {
          LeadDistanceKm:
            row.LeadDistanceKm === null || row.LeadDistanceKm === undefined
              ? null
              : Number(row.LeadDistanceKm),
          Lead:
            row.Lead === null || row.Lead === undefined
              ? 0
              : Number(row.Lead) || 0,
        },
      ]),
    );

    await client.query(`DELETE FROM "WorkMaterial" WHERE "WorkId" = $1`, [
      resolvedWorkId,
    ]);

    const abstracts = await client.query(
      `SELECT wa."WorkAbstractId", wa."WorkId", wa."SubWorkId", wa."ItemId",
              wa."Sequence", i."RegionId", i."CompletedRate"
       FROM "WorkAbstract" wa
       INNER JOIN "MasterItem" i ON i."ItemId" = wa."ItemId"
       WHERE wa."WorkId" = $1
       ORDER BY wa."WorkId" ASC, wa."SubWorkId" ASC, wa."Sequence" ASC,
                wa."WorkAbstractId" ASC`,
      [resolvedWorkId],
    );

    let rateAnalysisNo = 0;
    let materialsInserted = 0;
    let abstractsUpdated = 0;

    const formatNum = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0";
      return String(Number(n.toFixed(4)));
    };

    for (const abstract of abstracts.rows) {
      const itemId = Number(abstract.ItemId);
      const regionId = Number(abstract.RegionId);
      const completedRate = Number(abstract.CompletedRate) || 0;
      // Optional: if no WorkStandardAddition for this region, use 0% / no lead add-on
      const addition = additionByRegion.get(regionId) || {
        Percentage: 0,
        ApplyForLead: false,
      };

      const percentage = Number(addition.Percentage) || 0;
      const applyForLead = addition.ApplyForLead === true;

      const components = await client.query(
        `SELECT mc."MaterialId",
                mc."MaterialComponent",
                m."ConversionFactor",
                m."MaterialUnitId"
         FROM "MasterMaterialComponent" mc
         INNER JOIN "MasterMaterial" m ON m."MaterialId" = mc."MaterialId"
         WHERE mc."ItemId" = $1
         ORDER BY mc."MaterialComponentId" ASC`,
        [itemId],
      );

      let isRA = false;
      let rateString = "";
      let finalRate = completedRate;

      if (!components.rows.length) {
        isRA = false;
        if (applyForLead) {
          finalRate =
            completedRate + completedRate * (percentage / 100);
          rateString = `Final Rate = (${formatNum(completedRate)} + (${formatNum(completedRate)} * ${formatNum(percentage)}/100))`;
        } else {
          finalRate = completedRate;
          rateString = `Final Rate = (${formatNum(completedRate)})`;
        }
      } else {
        isRA = true;
        rateAnalysisNo += 1;
        rateString = `Rate Analysis No ${rateAnalysisNo}`;

        let sumAmount = 0;
        let materialSequence = 0;
        for (const comp of components.rows) {
          materialSequence += 1;
          const materialId = Number(comp.MaterialId);
          const rawComponent = Number(comp.MaterialComponent) || 0;
          const conversionFactor = Number(comp.ConversionFactor) || 0;
          const componentValue = Number(
            (rawComponent * conversionFactor).toFixed(4),
          );
          const unitId = Number(comp.MaterialUnitId) || null;
          const leadRow = leadByMaterial.get(materialId);
          const leadDistanceKmRaw = leadRow ? leadRow.LeadDistanceKm : null;
          const leadRaw = leadRow ? Number(leadRow.Lead) || 0 : 0;
          const leadDistanceKm =
            leadDistanceKmRaw === null ||
            leadDistanceKmRaw === undefined ||
            !Number.isFinite(Number(leadDistanceKmRaw))
              ? null
              : Number(Number(leadDistanceKmRaw).toFixed(2));
          const lead = Number(Number(leadRaw).toFixed(2));
          const amount = Number((componentValue * lead).toFixed(2));
          sumAmount += amount;

          await client.query(
            `INSERT INTO "WorkMaterial"
             ("WorkId", "ItemId", "Sequence", "MaterialId",
              "Component", "UnitId", "LeadDistanceKm", "Lead", "Amount", "Remarks")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              resolvedWorkId,
              itemId,
              materialSequence,
              materialId,
              componentValue,
              unitId,
              leadDistanceKm,
              lead,
              amount,
              null,
            ],
          );
          materialsInserted += 1;
        }

        if (applyForLead) {
          finalRate =
            completedRate +
            (sumAmount + sumAmount * (percentage / 100));
        } else {
          finalRate = completedRate + sumAmount;
        }
      }

      await client.query(
        `UPDATE "WorkAbstract"
         SET "IsRA" = $1,
             "RateString" = $2,
             "FinalRate" = $3
         WHERE "WorkAbstractId" = $4`,
        [isRA, rateString, finalRate, Number(abstract.WorkAbstractId)],
      );
      abstractsUpdated += 1;
    }

    await client.query("COMMIT");
    return res.status(200).json({
      message: `Updated ${abstractsUpdated} WorkAbstract row(s); inserted ${materialsInserted} WorkMaterial row(s).`,
      abstractsUpdated,
      materialsInserted,
      rateAnalysisCount: rateAnalysisNo,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(error);
    return res
      .status(error.status || 500)
      .json({ message: error.message });
  } finally {
    client.release();
  }
});

/** Resolve acting user and confirm SuperAdmin or OrgAdmin. */
async function requireSuperOrOrgAdmin(userId) {
  if (!userId) {
    return { error: { status: 400, message: "userId is required." } };
  }
  const result = await pool.query(
    `SELECT u."UserId", u."OrganizationId", uc."UserCategoryName"
     FROM "MasterUser" u
     INNER JOIN "MasterUserCategory" uc
       ON uc."UserCategoryId" = u."UserCategoryId"
     WHERE u."UserId" = $1
       AND COALESCE(u."MarkForDeletion", false) = false`,
    [Number(userId)],
  );
  const actor = result.rows[0];
  if (!actor) {
    return { error: { status: 403, message: "User not found or inactive." } };
  }
  const category = String(actor.UserCategoryName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const isSuperAdmin = category === "superadmin";
  const isOrgAdmin = category === "orgadmin";
  if (!isSuperAdmin) {
    return {
      error: {
        status: 403,
        message: "Only SuperAdmin can manage material components.",
      },
    };
  }
  return { actor, isSuperAdmin, isOrgAdmin };
}

app.get("/api/master-materials", async (req, res) => {
  const { regionId } = req.query;
  try {
    const params = [];
    let query = `
      SELECT m."MaterialId", m."SSRRegionId", m."MaterialDescription",
             m."MaterialShortDescription" AS "MaterialShortName",
             m."MaterialUnitId", m."MaterialLocalUnitId",
             u."UnitShortName" AS "MaterialUnitShortName",
             lu."UnitShortName" AS "MaterialLocalUnitShortName"
      FROM "MasterMaterial" m
      LEFT JOIN "MasterUnit" u ON u."UnitId" = m."MaterialUnitId"
      LEFT JOIN "MasterUnit" lu ON lu."UnitId" = m."MaterialLocalUnitId"`;
    if (regionId !== undefined && regionId !== null && String(regionId).trim() !== "") {
      params.push(Number(regionId));
      query += ` WHERE m."SSRRegionId" = $1`;
    }
    query += ` ORDER BY m."MaterialShortDescription" ASC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/material-components", async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) {
    return res.status(400).json({ message: "itemId is required." });
  }
  try {
    const result = await pool.query(
      `SELECT mc."MaterialComponentId", mc."ItemId", mc."MaterialId",
              m."MaterialShortDescription" AS "MaterialShortName",
              m."MaterialDescription",
              mc."MaterialComponent", mc."MaterialUnitId",
              u."UnitShortName" AS "MaterialUnitShortName",
              mc."PageNumber", mc."Number", mc."SubNumber"
       FROM "MasterMaterialComponent" mc
       INNER JOIN "MasterMaterial" m ON m."MaterialId" = mc."MaterialId"
       LEFT JOIN "MasterUnit" u ON u."UnitId" = mc."MaterialUnitId"
       WHERE mc."ItemId" = $1
       ORDER BY mc."MaterialComponentId" ASC`,
      [Number(itemId)],
    );
    return res.json({ data: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/material-components", async (req, res) => {
  const {
    userId,
    ItemId,
    MaterialId,
    MaterialComponent,
    PageNumber,
    Number: CompNumber,
    SubNumber,
  } = req.body || {};

  const auth = await requireSuperOrOrgAdmin(userId);
  if (auth.error) {
    return res.status(auth.error.status).json({ message: auth.error.message });
  }

  if (!ItemId) {
    return res.status(400).json({ message: "ItemId is required." });
  }
  if (!MaterialId) {
    return res.status(400).json({ message: "MaterialId is required." });
  }
  if (
    MaterialComponent === "" ||
    MaterialComponent === null ||
    MaterialComponent === undefined ||
    Number.isNaN(Number(MaterialComponent))
  ) {
    return res.status(400).json({ message: "MaterialComponent is required." });
  }

  try {
    const materialResult = await pool.query(
      `SELECT "MaterialLocalUnitId"
       FROM "MasterMaterial"
       WHERE "MaterialId" = $1`,
      [Number(MaterialId)],
    );
    const materialLocalUnitId = materialResult.rows[0]?.MaterialLocalUnitId;
    if (!materialLocalUnitId) {
      return res.status(400).json({
        message:
          "Selected material has no MaterialLocalUnitId. Cannot save component.",
      });
    }

    await ensureMaterialComponentIdSequence();

    const result = await pool.query(
      `INSERT INTO "MasterMaterialComponent"
       ("ItemId", "MaterialId", "MaterialComponent", "MaterialUnitId",
        "PageNumber", "Number", "SubNumber")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "MaterialComponentId", "ItemId", "MaterialId",
                 "MaterialComponent", "MaterialUnitId",
                 "PageNumber", "Number", "SubNumber"`,
      [
        Number(ItemId),
        Number(MaterialId),
        Number(MaterialComponent),
        Number(materialLocalUnitId),
        PageNumber === "" || PageNumber === null || PageNumber === undefined
          ? null
          : Number(PageNumber),
        CompNumber === "" || CompNumber === null || CompNumber === undefined
          ? null
          : Number(CompNumber),
        SubNumber ? String(SubNumber).trim() : null,
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/material-components/batch", async (req, res) => {
  const { userId, ItemId, rows } = req.body || {};

  const auth = await requireSuperOrOrgAdmin(userId);
  if (auth.error) {
    return res.status(auth.error.status).json({ message: auth.error.message });
  }

  if (!ItemId) {
    return res.status(400).json({ message: "ItemId is required." });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "rows array is required." });
  }

  const client = await pool.connect();
  try {
    await ensureMaterialComponentIdSequence();
    await client.query("BEGIN");

    const inserted = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const { MaterialId, MaterialComponent, PageNumber, SubNumber } = row;
      const CompNumber = row.Number;

      if (!MaterialId) {
        throw Object.assign(new Error(`Row ${i + 1}: MaterialId is required.`), {
          status: 400,
        });
      }
      if (
        MaterialComponent === "" ||
        MaterialComponent === null ||
        MaterialComponent === undefined ||
        Number.isNaN(Number(MaterialComponent))
      ) {
        throw Object.assign(
          new Error(`Row ${i + 1}: MaterialComponent is required.`),
          { status: 400 },
        );
      }

      const materialResult = await client.query(
        `SELECT "MaterialLocalUnitId"
         FROM "MasterMaterial"
         WHERE "MaterialId" = $1`,
        [Number(MaterialId)],
      );
      const materialLocalUnitId = materialResult.rows[0]?.MaterialLocalUnitId;
      if (!materialLocalUnitId) {
        throw Object.assign(
          new Error(
            `Row ${i + 1}: material has no MaterialLocalUnitId.`,
          ),
          { status: 400 },
        );
      }

      const result = await client.query(
        `INSERT INTO "MasterMaterialComponent"
         ("ItemId", "MaterialId", "MaterialComponent", "MaterialUnitId",
          "PageNumber", "Number", "SubNumber")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "MaterialComponentId", "ItemId", "MaterialId",
                   "MaterialComponent", "MaterialUnitId",
                   "PageNumber", "Number", "SubNumber"`,
        [
          Number(ItemId),
          Number(MaterialId),
          Number(MaterialComponent),
          Number(materialLocalUnitId),
          PageNumber === "" || PageNumber === null || PageNumber === undefined
            ? null
            : Number(PageNumber),
          CompNumber === "" || CompNumber === null || CompNumber === undefined
            ? null
            : Number(CompNumber),
          SubNumber ? String(SubNumber).trim() : null,
        ],
      );
      inserted.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return res.status(201).json({ data: inserted, count: inserted.length });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error(error);
    return res
      .status(error.status || 500)
      .json({ message: error.message });
  } finally {
    client.release();
  }
});

app.put("/api/material-components/:id", async (req, res) => {
  const { id } = req.params;
  const {
    userId,
    ItemId,
    MaterialId,
    MaterialComponent,
    PageNumber,
    Number: CompNumber,
    SubNumber,
  } = req.body || {};

  const auth = await requireSuperOrOrgAdmin(userId);
  if (auth.error) {
    return res.status(auth.error.status).json({ message: auth.error.message });
  }

  if (!ItemId) {
    return res.status(400).json({ message: "ItemId is required." });
  }
  if (!MaterialId) {
    return res.status(400).json({ message: "MaterialId is required." });
  }
  if (
    MaterialComponent === "" ||
    MaterialComponent === null ||
    MaterialComponent === undefined ||
    Number.isNaN(Number(MaterialComponent))
  ) {
    return res.status(400).json({ message: "MaterialComponent is required." });
  }

  try {
    const materialResult = await pool.query(
      `SELECT "MaterialLocalUnitId"
       FROM "MasterMaterial"
       WHERE "MaterialId" = $1`,
      [Number(MaterialId)],
    );
    const materialLocalUnitId = materialResult.rows[0]?.MaterialLocalUnitId;
    if (!materialLocalUnitId) {
      return res.status(400).json({
        message:
          "Selected material has no MaterialLocalUnitId. Cannot update component.",
      });
    }

    const result = await pool.query(
      `UPDATE "MasterMaterialComponent"
       SET "ItemId" = $1,
           "MaterialId" = $2,
           "MaterialComponent" = $3,
           "MaterialUnitId" = $4,
           "PageNumber" = $5,
           "Number" = $6,
           "SubNumber" = $7
       WHERE "MaterialComponentId" = $8
       RETURNING "MaterialComponentId", "ItemId", "MaterialId",
                 "MaterialComponent", "MaterialUnitId",
                 "PageNumber", "Number", "SubNumber"`,
      [
        Number(ItemId),
        Number(MaterialId),
        Number(MaterialComponent),
        Number(materialLocalUnitId),
        PageNumber === "" || PageNumber === null || PageNumber === undefined
          ? null
          : Number(PageNumber),
        CompNumber === "" || CompNumber === null || CompNumber === undefined
          ? null
          : Number(CompNumber),
        SubNumber ? String(SubNumber).trim() : null,
        Number(id),
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Material component not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/test", async (req, res) => {
  console.log("Origin:", req.headers.origin);
  res.json({ success: true });
});

app.listen(port, async () => {
  try {
    await ensureWorkAbstractSchema();
    await ensureMasterWorkCreationDate();
    await ensureWorkAbstractSequence();
    await ensureWorkMeasurementSequence();
    await ensureMaterialComponentIdSequence();
    await ensureWorkStandardAdditionSchema();
    await ensureWorkEstimateSequences();
  } catch (err) {
    console.error("Failed to ensure schema:", err);
  }
  console.log(`Backend running on http://localhost:${port}`);
});
