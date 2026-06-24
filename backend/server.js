const express = require("express");
const cors = require("cors");
const { Pool, Client } = require("pg");
require("dotenv").config();

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
      `SELECT "SSRSubCategoryId", "SSRCategoryName" FROM "MasterSSRSubCategory" WHERE "SSRCategoryId" = $1 ORDER BY "DOrder";`,
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
  console.log("Get Checked Items Called");
  try {
    const result = await pool.query(
      `SELECT "ItemId" FROM "WorkAbstract" ORDER BY "ItemId";`,
    );
    const returnData = result.rows.map((row) => row.ItemId);
    return res.status(200).send({ data: returnData });
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

app.get("/api/load-projects/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT "ProjectId", "ProjectName" FROM "MasterProject" WHERE "UserId" = $1',
      [userId],
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

app.get("/api/load-sub-works/", async (req, res) => {
  const { projectId } = req.query;
  console.log("Project Id: ", projectId);
  try {
    const result = await pool.query(
      'SELECT "SubWorkId", "SubWorkName" FROM "MasterSubWork" WHERE "ProjectId" = $1',
      [projectId],
    );
    return res.status(200).send({ data: result.rows });
  } catch (err) {
    console.error(err);
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
      `SELECT w."WorkAbstractId", w."ItemId", i."ItemNumber", i."ItemDescription", i."CompletedRate" FROM "WorkAbstract" w JOIN "MasterItem" i ON i."ItemId" = w."ItemId" WHERE w."ProjectId" = $1 AND w."SubWorkId" = $2 ORDER BY i."ItemNumber" ASC; `,
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
  const { workAbstractId, description, measurements, quantity } = req.body;

  console.log("Work Abstract Id: ", workAbstractId);
  console.log("Description: ", description);
  console.log("Measurements: ", measurements);
  console.log("Quantity: ", quantity);

  try {
    const result = await pool.query(
      `INSERT INTO "WorkMeasurement" ("WorkAbstractId", "Description", "Measurements", "Quantity") 
       VALUES ($1,$2,$3,$4) 
       RETURNING "MeasurementId";`, // ← add RETURNING so frontend gets the new ID
      [workAbstractId, description, measurements, quantity],
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
      `SELECT "MeasurementId", "Description", "Measurements", "Quantity" FROM "WorkMeasurement" WHERE "WorkAbstractId" = $1`,
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
  const { description, measurements, quantity } = req.body;

  try {
    await pool.query(
      `UPDATE "WorkMeasurement" 
       SET "Description"=$1, "Measurements"=$2, "Quantity"=$3 
       WHERE "WorkMeasurementId"=$4;`,
      [description, measurements, quantity, id],
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

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
