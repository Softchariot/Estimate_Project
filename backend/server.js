const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = ("https://estimate-project-omega.vercel.app/" || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients and local tools that may not send Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS blocked for this origin."));
    }
  })
);
app.use(express.json());

const useSsl = String(process.env.DB_SSL || "false").toLowerCase() === "true";
const connectionString = process.env.DB_STRING;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "01_WERMS",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      ssl: useSsl ? { rejectUnauthorized: false } : false
    });

pool.connect()
.then(() => console.log("Connected to the database"))
.catch(err => console.error("Error connecting to the database", err));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "API and DB are reachable." });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/api/ssr-regions", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT "SSRRegionId", "SSRRegionName", "SSRRegionShortName", "DOrder", "DOrder1", "Remarks"
       FROM "MasterSSRRegion"
       ORDER BY "SSRRegionId" DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/ssr-regions", async (req, res) => {
  const { SSRRegionName, SSRRegionShortName, DOrder, DOrder1, Remarks } = req.body;

  if (!SSRRegionName || !SSRRegionShortName) {
    return res.status(400).json({
      message: "SSRRegionName and SSRRegionShortName are required."
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
        Remarks ? Remarks.trim() : null
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/ssr-regions/:id", async (req, res) => {
  const { id } = req.params;
  const { SSRRegionName, SSRRegionShortName, DOrder, DOrder1, Remarks } = req.body;

  if (!SSRRegionName || !SSRRegionShortName) {
    return res.status(400).json({
      message: "SSRRegionName and SSRRegionShortName are required."
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
        Number(id)
      ]
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
      `SELECT c."SSRCategoryId", c."SSRRegionId", r."SSRRegionName",
              c."SSRCategoryName", c."SSRCategoryShortName", c."DOrder", c."DOrder1", c."Remarks"
       FROM "MasterSSRCategory" c
       INNER JOIN "MasterSSRRegion" r ON r."SSRRegionId" = c."SSRRegionId"
       ORDER BY c."SSRCategoryId" DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/ssr-categories", async (req, res) => {
  const { SSRRegionId, SSRCategoryName, SSRCategoryShortName, DOrder, DOrder1, Remarks } = req.body;

  if (!SSRRegionId || !SSRCategoryName || !SSRCategoryShortName) {
    return res.status(400).json({
      message: "SSRRegionId, SSRCategoryName and SSRCategoryShortName are required."
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
        Remarks ? Remarks.trim() : null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/ssr-categories/:id", async (req, res) => {
  const { id } = req.params;
  const { SSRRegionId, SSRCategoryName, SSRCategoryShortName, DOrder, DOrder1, Remarks } = req.body;

  if (!SSRRegionId || !SSRCategoryName || !SSRCategoryShortName) {
    return res.status(400).json({
      message: "SSRRegionId, SSRCategoryName and SSRCategoryShortName are required."
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
        Number(id)
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Category not found." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
