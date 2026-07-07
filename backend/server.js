const express = require("express");
const cors = require("cors");
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
      `SELECT "SSRCategoryId", "SSRCategoryName" FROM "MasterSSRCategory" WHERE "RegionID" = $1 ORDER BY "DOrder";`,
      [regionId],
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
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

app.get("/api/ssr-items-load", async (req, res) => {
  const { regionId, categoryId, subCategoryId } = req.query;
  console.log("Region Id: ", regionId);
  console.log("Category Id: ", categoryId);
  console.log("Sub Category Id: ", subCategoryId);

  try {
    const result = await pool.query(
      'SELECT "ItemId", "ItemNumber", "ItemDescription", "CompletedRate" FROM "MasterItem" WHERE "RegionId" = $1 AND "CategoryId" = $2 AND "SubCategoryId" = $3 ORDER BY "ItemNumber" ASC;',
      [regionId, categoryId, subCategoryId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

app.get("/api/work-abstract-get", async (req, res) => {
  const { workId, subWorkId } = req.query;
  console.log("Work Id: ", workId);
  console.log("Sub Work Id: ", subWorkId);
  console.log("Get Checked Items Called");
  try {
    const result = await pool.query(
      `SELECT "ItemId" FROM "WorkAbstract" WHERE "ProjectId" = $1 AND "SubWorkId" = $2 ORDER BY "ItemId";`,
      [workId, subWorkId],
    );
    console.log(result);
    console.log("Checked Items: ", result.rows);
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
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
    const result = await pool.query(
      'SELECT "ProjectId", "ProjectName", "ProjectCode" FROM "MasterProject" WHERE "OrganizationID" = $1 ORDER BY "ProjectCode"',
      [org_id],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

app.post("/api/insert-work-abstract", async (req, res) => {
  const { projectId, subWorkId, items } = req.body;

  console.log("Project Id (Work Abstract): ", projectId);
  console.log("SubWork Id (Work Abstract): ", subWorkId);
  console.log("Items List (Work Abstract): ", items);

  try {
    let i = 1;
    for (const item of items) {
      await pool.query(
        `INSERT INTO "WorkAbstract"
        ("ProjectId", "SubWorkId", "ItemId","Sequence")
        VALUES ($1,$2,$3,$4);`,
        [Number(projectId), Number(subWorkId), Number(item), i],
      );
      i += 1;
    }
    return res
      .status(200)
      .send({ message: "Work Abstract Insertion Successful" });
  } catch (err) {
    console.error(err);
  }
});

app.post("/api/insert-work", async (req, res) => {
  const { workName, projectId, userId, remarks } = req.body;

  const projectIdValue =
    projectId === null || projectId === undefined || projectId === 0
      ? null
      : projectId;

  try {
    const result = await pool.query(
      `INSERT INTO "MasterWork" ("WorkName", "ProjectId", "UserId", "Remarks") VALUES ($1, $2, $3, $4)`,
      [workName, projectIdValue, userId, remarks],
    );
    return res.status(201).send({ message: "Work Created Successfully." });
  } catch (err) {
    console.error(err);
  }
});

app.get("/api/load-sub-works", async (req, res) => {
  const { projectId } = req.query;
  console.log("Project Id: ", projectId);
  try {
    const result = await pool.query(
      'SELECT "SubWorkId", "SubWorkName", "ProjectId" FROM "MasterSubWork" WHERE "ProjectId" = $1',
      [projectId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

app.get("/api/load-all-sub-works", async (req, res) => {
  console.log("Load All Sub Works Called.");
  try {
    const result = await pool.query(
      `SELECT "SubWorkId", "SubWorkName", "ProjectId" FROM "MasterSubWork" ORDER BY "SubWorkId"`,
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
  const { projectId, subWorkId } = req.query;
  console.log("Project: ", projectId);
  console.log("Sub Work Id: ", subWorkId);
  if (!projectId && !subWorkId) {
    return res
      .status(500)
      .send({ message: "ProjectId and SubWorkId not found" });
  }
  try {
    const result = await pool.query(
      `SELECT w."WorkAbstractId", w."ItemId", i."ItemNumber", i."ItemDescription", i."CompletedRate" 
      FROM "WorkAbstract" w 
      JOIN "MasterItem" i ON i."ItemId" = w."ItemId" 
      WHERE w."ProjectId" = $1 AND w."SubWorkId" = $2 ORDER BY i."ItemNumber" ASC; `,
      [projectId, subWorkId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

app.post("/api/insert-project", async (req, res) => {
  const { projectName, userId } = req.body;
  console.log("Project Name: ", projectName);
  console.log("User Id: ", userId);
  try {
    const result = await pool.query(
      `INSERT INTO "MasterProject" ("ProjectName", "UserId") VALUES ($1,$2)`,
      [projectName, userId],
    );
    return res.status(201).send({ message: "Project Created." });
  } catch (err) {
    console.error(err);
  }
});

app.post("/api/insert-subwork", async (req, res) => {
  const { projectId, subWorkName } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO "MasterSubWork" ("ProjectId", "SubWorkName") VALUES ($1,$2)`,
      [projectId, subWorkName],
    );
    return res.status(201).send({ message: "Sub Work Created." });
  } catch (err) {
    console.error(err);
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
    const result = await pool.query(
      `INSERT INTO "WorkMeasurement" ("WorkAbstractId", "Description", "Expression", "Quantity", "Number", "Length", "Breadth", "Height") 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) 
       RETURNING "MeasurementId";`, // ← add RETURNING so frontend gets the new ID
      [
        workAbstractId,
        description,
        expression,
        quantity,
        number,
        length,
        breadth,
        height,
      ],
    );
    return res.status(200).send({
      message: "Measurements Successfully Recorded.",
      data: { WorkMeasurementId: result.rows[0].WorkMeasurementId }, // ← send it back
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Failed to insert measurement." });
  }
});

app.get("/api/measurements", async (req, res) => {
  console.log("Measurments API called.");
  const { workAbstractId } = req.query;

  console.log("Work Abstract Id: ", workAbstractId);

  try {
    const result = await pool.query(
      `SELECT "MeasurementId", "Description", "Expression", "Number", "Length", "Breadth", "Height", "Quantity" FROM "WorkMeasurement" WHERE "WorkAbstractId" = $1`,
      [workAbstractId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
  }
});

// PUT route for editing existing rows
app.put("/api/update-work-measurements/:id", async (req, res) => {
  const { id } = req.params;
  const { description, expression, number, length, breadth, height, quantity } =
    req.body;

  try {
    await pool.query(
      `UPDATE "WorkMeasurement" 
       SET "Description"=$1, "Expression"=$2, "Number"=$3, "Length"=$4, "Breadth"=$5, "Height"=$6, "Quantity"=$7 
       WHERE "WorkMeasurementId"=$8;`,
      [description, expression, number, length, breadth, height, quantity, id],
    );
    return res.status(200).send({ message: "Measurement Updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Failed to update measurement." });
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
      `SELECT u."UserId", u."UserLoginName", u."UserName",
              d."DesignationName", uc."UserCategoryName",
              o."OrganizationId", o."OrgCode", o."OrgName"
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

app.delete("/api/delete-selected-items", async (req, res) => {
  let { deleteItems } = req.query;

  try {
    deleteItems = deleteItems.sort();
    // deleteItems.forEach((itemId) => {
    //   const query = await pool.query(`DELETE FROM "WorkAbstract" WHERE "ItemId" = $1`,[itemId,])
    // })
    let query;
    for (const itemId of deleteItems) {
      query = await pool.query(
        `DELETE FROM "WorkAbstract" WHERE "ItemId" = $1`,
        [itemId],
      );
      console.log("Deleted Item: ", itemId);
    }

    return res
      .status(200)
      .send({ message: "Deletion of: " + deleteItems + " successful." });
  } catch (err) {
    console.error(err);
  }
});

app.get("/api/get-work-abstract-report", async (req, res) => {
  const { workId, subWorkId } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM "WorkAbstract" WHERE "ProjectId" = $1 AND "SubWorkId" = $2`,
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

  try {
    // ── Look up the work/project name for the header ──
    const projectResult = await pool.query(
      `SELECT "ProjectName" FROM "MasterProject" WHERE "ProjectId" = $1`,
      [projectId],
    );
    const projectName = projectResult.rows[0]?.ProjectName || "Untitled Work";

    // ── Build the abstract query — same shape as the one you designed,
    //    parameterized for ProjectId and optionally filtered to one SubWork ──
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
          i."ItemNumber",
          i."ItemDescription",
          u."UnitShortName",
          i."CompletedRate",
          SUM(wm."Quantity") AS "Quantity"
        FROM "MasterItem" i
        JOIN "WorkAbstract" wa ON wa."ItemId" = i."ItemId"
        JOIN "MasterUnit" u ON u."UnitId" = i."UnitId"
        JOIN "WorkMeasurement" wm ON wa."WorkAbstractId" = wm."WorkAbstractId"
        JOIN "MasterSubWork" sw ON wa."SubWorkId" = sw."SubWorkId"
        WHERE wa."ProjectId" = $1
        ${subWorkFilter}
        GROUP BY
          sw."SubWorkId", sw."SubWorkName", i."ItemNumber",
          i."ItemDescription", u."UnitShortName", i."CompletedRate"
        ORDER BY sw."SubWorkName", i."ItemNumber"
      `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this selection." });
    }

    // ── Group rows by sub work, preserving first-seen order ──
    const subWorkGroups = [];
    const groupIndexBySubWorkId = new Map();
    for (const row of rows) {
      if (!groupIndexBySubWorkId.has(row.SubWorkId)) {
        groupIndexBySubWorkId.set(row.SubWorkId, subWorkGroups.length);
        subWorkGroups.push({ subWorkName: row.SubWorkName, items: [] });
      }
      subWorkGroups[groupIndexBySubWorkId.get(row.SubWorkId)].items.push(row);
    }

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName.replace(/[^\w\-]+/g, "_")}_Abstract.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const money = (n) =>
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const colX = { desc: 40, qty: 340, rate: 410, amount: 490 };
    const descWidth = colX.qty - colX.desc - 10; // keep description column from bleeding into Quantity
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    // Header only: title / SSR year / name of work / table column labels.
    // Sub-work name is drawn separately, right after this, once per group.
    const drawHeader = () => {
      doc.font("Helvetica-Bold").fontSize(14);
      doc.text("Abstract", 0, 40, { align: "center" });
      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(`Name of Work :   ${projectName}`, colX.desc, doc.y);
      doc.moveDown(0.5);
    };

    // Draws the "N. NAME OF SUB WORK -- ..." line, then the table column
    // headings + rule, so the sub-work name always sits above the table.
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
      doc.text("Description", colX.desc, tableTop);
      doc.text("Quantity", colX.qty, tableTop);
      doc.text("Rate/Unit", colX.rate, tableTop);
      doc.text("Amount", colX.amount, tableTop);
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);
    };

    subWorkGroups.forEach((group, groupIdx) => {
      // Each sub work starts on its own page
      if (groupIdx > 0) doc.addPage();
      drawHeader();
      drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);

      let subWorkTotal = 0;

      group.items.forEach((item, itemIdx) => {
        const quantity = Number(item.Quantity || 0);
        const rate = Number(item.CompletedRate || 0);
        const amount = quantity * rate;
        subWorkTotal += amount;

        // ── Measure how tall this row will actually be BEFORE drawing it ──
        const itemNoLabel = `ITEM NO. : ${itemIdx + 1}`;
        doc.font("Helvetica-Bold").fontSize(9);
        const itemNoHeight = doc.heightOfString(itemNoLabel, {
          width: descWidth,
        });
        doc.font("Helvetica").fontSize(9);
        const descHeight = doc.heightOfString(item.ItemDescription, {
          width: descWidth,
        });
        const rowHeight = itemNoHeight + descHeight + 6; // small padding between rows

        // Page-break BEFORE drawing if this row won't fit
        if (doc.y + rowHeight > pageBottom - 40) {
          doc.addPage();
          drawHeader();
          drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);
        }

        const rowTop = doc.y;

        // Quantity / Rate / Amount are single-line, aligned to the row's top
        doc.font("Helvetica").fontSize(9);
        doc.text(quantity.toFixed(3), colX.qty, rowTop, { width: 60 });
        doc.text(`${money(rate)}/${item.UnitShortName}`, colX.rate, rowTop, {
          width: 75,
        });
        doc.text(money(amount), colX.amount, rowTop, { width: 65 });

        // Description block: draw item no. then description directly beneath it
        doc.font("Helvetica-Bold").fontSize(9);
        doc.text(itemNoLabel, colX.desc, rowTop, { width: descWidth });
        doc.font("Helvetica").fontSize(9);
        doc.text(item.ItemDescription, colX.desc, doc.y, { width: descWidth });

        // Advance to the bottom of the taller of the two columns, plus padding
        doc.y = Math.max(doc.y, rowTop + rowHeight);
        doc.moveDown(0.4);
      });

      // ── Total for this sub work, at the end of its page(s) ──
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
      doc.text(money(subWorkTotal), colX.amount, totalY);
    });

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
  console.log("Project Id: ", projectId);

  // Royalty / Testing charges: no dedicated table/columns were provided,
  // so these are expressed as a % of the Work Portion total and can be
  // overridden per-request via query params, e.g.:
  //   /api/generate-recapitulation-report?projectId=5&royaltyPercent=3.34&testingPercent=0.177
  // Defaults below reproduce the sample sheet's numbers (13678.97 / 409645.41 = 3.34%,
  // 725.00 / 409645.41 = 0.177%). Swap this block out for a real query if you have
  // a table (e.g. MasterCharges) that stores these instead.
  const royaltyPercent = req.query.royaltyPercent
    ? Number(req.query.royaltyPercent)
    : 3.34;
  const testingPercent = req.query.testingPercent
    ? Number(req.query.testingPercent)
    : 0.177;

  if (!projectId) {
    return res.status(400).json({ message: "projectId is required." });
  }

  try {
    // ── Project name for the header ──
    const projectResult = await pool.query(
      `SELECT "ProjectName" FROM "MasterProject" WHERE "ProjectId" = $1`,
      [projectId],
    );
    const projectName = projectResult.rows[0]?.ProjectName || "Untitled Work";

    // ── Work Portion total: same join/shape as generate-report, but summed
    //    to a single grand total instead of grouped by sub-work/item ──
    const workPortionResult = await pool.query(
      `
        SELECT COALESCE(SUM(wm."Quantity" * i."CompletedRate"), 0) AS "WorkPortionTotal"
        FROM "MasterItem" i
        JOIN "WorkAbstract" wa ON wa."ItemId" = i."ItemId"
        JOIN "WorkMeasurement" wm ON wa."WorkAbstractId" = wm."WorkAbstractId"
        WHERE wa."ProjectId" = $1
      `,
      [projectId],
    );

    const workPortionTotal = Number(
      workPortionResult.rows[0]?.WorkPortionTotal || 0,
    );

    if (workPortionTotal === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this project." });
    }

    const royaltyCharges = workPortionTotal * (royaltyPercent / 100);
    const testingCharges = workPortionTotal * (testingPercent / 100);

    const subWorkRows = [
      { label: "WORK PORTION", amount: workPortionTotal },
      { label: "Royalty Charges Estimate", amount: royaltyCharges },
      { label: "Testing Charges Estimate", amount: testingCharges },
    ];

    const totalAmount = subWorkRows.reduce((sum, r) => sum + r.amount, 0);
    const roundOff = Math.round(totalAmount);

    // ── Stream the PDF back as a download ──
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName.replace(/[^\w\-]+/g, "_")}_Recapitulation.pdf"`,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const money = (n) =>
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const left = 40;
    const right = 555;
    const labelX = 40;
    const nameValueX = 150;
    const nameValueWidth = right - nameValueX;
    const numX = 55;
    const subWorkX = 90;
    const amountX = 460;
    const amountWidth = right - amountX;

    // ── Title ──
    doc.font("Helvetica-Bold").fontSize(14);
    doc.text("Recapitulation Sheet", 0, 40, { align: "center" });
    doc.moveDown(1.2);

    // ── Name of Work (wraps) + SSR Year, mirroring the sample layout ──
    doc.font("Helvetica-Bold").fontSize(10);
    const nameOfWorkTop = doc.y;
    doc.text("Name of Work", labelX, nameOfWorkTop);
    doc.text(projectName, nameValueX, nameOfWorkTop, { width: nameValueWidth });

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10);

    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.3);

    // ── Column headings ──
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

    // ── Sub work rows ──
    doc.font("Helvetica").fontSize(10);
    subWorkRows.forEach((row, idx) => {
      const rowY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text(String(idx + 1), numX, rowY);
      doc.font("Helvetica").fontSize(10);
      doc.text(row.label, subWorkX, rowY);
      doc.text(money(row.amount), amountX, rowY, {
        width: amountWidth,
        align: "right",
      });
      doc.moveDown(1);
    });

    // ── Dashed rule ──
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    doc.text("-".repeat(88), left, doc.y);
    doc.moveDown(0.8);

    // ── Total Amount / Round off ──
    doc.text("Total Amount", subWorkX, doc.y, { continued: false });
    doc.text(money(totalAmount), amountX, doc.y - doc.currentLineHeight(), {
      width: amountWidth,
      align: "right",
    });
    doc.moveDown(1);

    doc.text("Round off", subWorkX, doc.y, { continued: false });
    doc.text(money(roundOff), amountX, doc.y - doc.currentLineHeight(), {
      width: amountWidth,
      align: "right",
    });
    doc.moveDown(1);

    doc.text("-".repeat(88), left, doc.y);

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
    // ── Project name for the header ──
    const projectResult = await pool.query(
      `SELECT "ProjectName" FROM "MasterProject" WHERE "ProjectId" = $1`,
      [projectId],
    );
    const projectName = projectResult.rows[0]?.ProjectName || "Untitled Work";

    // ── Pull every WorkAbstract (item) for the project, LEFT JOINed to its
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
          i."ItemNumber",
          i."ItemDescription",
          u."UnitShortName",
          wm."MeasurementId",
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
        LEFT JOIN "WorkMeasurement" wm ON wm."WorkAbstractId" = wa."WorkAbstractId"
        WHERE wa."ProjectId" = $1
        ${subWorkFilter}
        ORDER BY sw."SubWorkName", i."ItemNumber", wm."MeasurementId"
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
    const subWorkGroups = [];
    const subWorkIndexById = new Map();
    const itemIndexByAbstractId = new Map();

    for (const row of rows) {
      if (!subWorkIndexById.has(row.SubWorkId)) {
        subWorkIndexById.set(row.SubWorkId, subWorkGroups.length);
        subWorkGroups.push({ subWorkName: row.SubWorkName, items: [] });
      }
      const group = subWorkGroups[subWorkIndexById.get(row.SubWorkId)];

      if (!itemIndexByAbstractId.has(row.WorkAbstractId)) {
        itemIndexByAbstractId.set(row.WorkAbstractId, group.items.length);
        group.items.push({
          itemNumber: row.ItemNumber,
          itemDescription: row.ItemDescription,
          unitShortName: row.UnitShortName,
          measurements: [],
        });
      }
      const item = group.items[itemIndexByAbstractId.get(row.WorkAbstractId)];

      // LEFT JOIN with no measurement rows yields a single row with
      // MeasurementId === null — skip adding a measurement line for that.
      if (row.MeasurementId !== null && row.MeasurementId !== undefined) {
        item.measurements.push({
          expressionText: formatExpression(row),
          quantity: Number(row.MeasurementQuantity || 0),
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

    const colX = { desc: 40, measurement: 340, qty: 490 };
    const descWidth = 555 - colX.desc; // full-width description line
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
        width: measurementQtyWidth - 65,
        align: "center",
      });
      doc.text("Quantity", colX.qty, tableTop, {
        width: measurementQtyWidth,
        align: "right",
      });
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(8);
      doc.text("No.   L.   B.   D.", colX.measurement, doc.y, {
        width: measurementQtyWidth - 65,
        align: "center",
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
        const itemLabel = `ITEM NO. : ${itemIdx + 1}  ${item.itemDescription}`;

        doc.font("Helvetica").fontSize(9);
        const itemLabelHeight = doc.heightOfString(itemLabel, {
          width: descWidth,
        });

        const lineHeight = 14; // per measurement / total-quantity line
        const measurementBlockHeight =
          item.measurements.length > 0
            ? item.measurements.length * lineHeight
            : 0;
        const totalLineHeight = lineHeight;
        const blockPadding = 14;

        const blockHeight =
          itemLabelHeight +
          measurementBlockHeight +
          totalLineHeight +
          blockPadding;

        // Page-break BEFORE drawing if this whole item block won't fit
        if (doc.y + blockHeight > pageBottom - 30) {
          doc.addPage();
          drawPageHeader();
          drawSubWorkTitleAndTableHeader(groupIdx, group.subWorkName);
        }

        // ── Item number + description ──
        doc.font("Helvetica-Bold").fontSize(9);
        doc.text(`ITEM NO. : ${itemIdx + 1}`, colX.desc, doc.y, {
          continued: true,
        });
        doc.font("Helvetica").fontSize(9);
        doc.text(`  ${item.itemDescription}`, { width: descWidth });
        doc.moveDown(0.4);

        // ── One line per measurement: expression left, quantity right ──
        let totalQuantity = 0;
        item.measurements.forEach((m) => {
          totalQuantity += m.quantity;
          const rowY = doc.y;
          doc.font("Helvetica").fontSize(9);
          doc.text(m.expressionText, colX.measurement, rowY, {
            width: measurementQtyWidth - 65,
          });
          doc.text(m.quantity.toFixed(3), colX.qty, rowY, {
            width: measurementQtyWidth,
            align: "right",
          });
          doc.moveDown(0.7);
        });

        // ── Total Quantity line (still shown even when 0 measurements) ──
        doc.font("Helvetica-Bold").fontSize(9);
        const totalY = doc.y;
        doc.text("Total Quantity", colX.measurement, totalY, {
          width: measurementQtyWidth - 65,
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
          categoryName: row.CategoryName || "Uncategorized",
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
    const colUnit = 460;
    const colRate = 505;
    const unitRateWidth = pageRight - colUnit;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const indentPerDepth = 14;

    const drawPageHeader = () => {
      doc.font("Helvetica-Bold").fontSize(10);
      const y = 40;
      doc.text("Code No", colCode, y);
      doc.text("Description", 130, y);
      doc.text("Unit", colUnit, y, { width: 40 });
      doc.text("Rate", colRate, y, {
        width: unitRateWidth - 40,
        align: "right",
      });
      doc.moveDown(0.5);
      doc.moveTo(pageLeft, doc.y).lineTo(pageRight, doc.y).stroke();
      doc.moveDown(0.5);
    };

    const drawCategoryHeading = (categoryName) => {
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(categoryName, colCode, doc.y, { width: pageRight - colCode });
      doc.moveDown(0.5);
    };

    // Measures + draws a single item row, returns nothing (advances doc.y)
    const drawItemRow = (item, depth) => {
      const descX = 130 + depth * indentPerDepth;
      const descWidth = colUnit - descX - 10;
      const codeX = colCode + depth * indentPerDepth;

      const bold = isBoldHeading(item);
      const isLeaf = item.IsFinal;
      const label = item.ItemDescription || item.ItemShortDescription || "";

      // Leaf rows are always plain text; only a non-final "heading" row can be bold
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);

      const codeHeight = item.ItemNumber
        ? doc.heightOfString(item.ItemNumber, { width: descX - codeX - 4 })
        : 0;
      const descHeight = doc.heightOfString(label, { width: descWidth });
      const rowHeight = Math.max(codeHeight, descHeight) + 6;

      if (doc.y + rowHeight > pageBottom - 30) {
        doc.addPage();
        drawPageHeader();
      }

      const rowTop = doc.y;
      if (item.ItemNumber) {
        doc.text(item.ItemNumber, codeX, rowTop, { width: descX - codeX - 4 });
      }
      doc.text(label, descX, rowTop, { width: descWidth });

      if (isLeaf) {
        doc.font("Helvetica").fontSize(9);
        doc.text(item.UnitShortName || "", colUnit, rowTop, { width: 40 });
        doc.text(money(item.CompletedRate), colRate, rowTop, {
          width: unitRateWidth - 40,
          align: "right",
        });
      }

      doc.y = Math.max(doc.y, rowTop + rowHeight);
      doc.moveDown(0.3);

      // Recurse into children (skip if this row was already the "bold heading
      // right before leaves" case — we still need to render those leaf children)
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

app.get("/test", async (req, res) => {
  console.log("Origin:", req.headers.origin);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
