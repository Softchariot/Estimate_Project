const INDIVIDUAL_ORGANIZATION_ID = Number(
  process.env.SIGNUP_INDIVIDUAL_ORG_ID || 3,
);
const REMARKS_MAX = 200;

function isHoldingOrganization(organizationId) {
  return Number(organizationId) === INDIVIDUAL_ORGANIZATION_ID;
}

/** Org 3 → session UserId. Other orgs → session OrganizationId. */
function sessionRecordScope(actor, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  if (isHoldingOrganization(actor.OrganizationId)) {
    return {
      clause: `${prefix}"UserId" = $1`,
      values: [Number(actor.UserId)],
    };
  }
  return {
    clause: `${prefix}"OrganizationId" = $1`,
    values: [Number(actor.OrganizationId)],
  };
}

function workGroupScope(actor, workId, subWorkId, alias = "") {
  const p = alias ? `${alias}.` : "";
  if (isHoldingOrganization(actor.OrganizationId)) {
    return {
      clause: `${p}"WorkId" = $1 AND ${p}"SubWorkId" = $2 AND ${p}"UserId" = $3`,
      values: [Number(workId), Number(subWorkId), Number(actor.UserId)],
    };
  }
  return {
    clause: `${p}"WorkId" = $1 AND ${p}"SubWorkId" = $2 AND ${p}"OrganizationId" = $3`,
    values: [
      Number(workId),
      Number(subWorkId),
      Number(actor.OrganizationId),
    ],
  };
}

async function resolveSessionUser(pool, userId) {
  if (!userId) {
    return { error: { status: 400, message: "userId is required." } };
  }
  const result = await pool.query(
    `SELECT u."UserId", u."OrganizationId", uc."UserCategoryName"
     FROM "MasterUser" u
     LEFT JOIN "MasterUserCategory" uc
       ON uc."UserCategoryId" = u."UserCategoryId"
     WHERE u."UserId" = $1
       AND COALESCE(u."MarkForDeletion", false) = false`,
    [Number(userId)],
  );
  const actor = result.rows[0];
  if (!actor) {
    return { error: { status: 403, message: "User not found or inactive." } };
  }
  if (!actor.OrganizationId) {
    return {
      error: {
        status: 403,
        message: "Organization is required.",
      },
    };
  }
  return { actor };
}

async function ensureWorkMeasurementGroupSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public."WorkMeasurementGroup" (
      "WorkGroupId" serial PRIMARY KEY,
      "GroupId" integer NOT NULL,
      "WorkId" integer NOT NULL,
      "SubWorkId" integer NOT NULL,
      "Percentage" double precision,
      "OrganizationId" integer NOT NULL,
      "UserId" integer NOT NULL,
      "Sequence" integer NOT NULL,
      "Remarks" varchar(200)
    )
  `);

  const addColumns = [
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "GroupId" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "WorkId" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "SubWorkId" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "Percentage" double precision`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "OrganizationId" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "UserId" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "Sequence" integer`,
    `ALTER TABLE public."WorkMeasurementGroup" ADD COLUMN IF NOT EXISTS "Remarks" varchar(200)`,
  ];
  for (const sql of addColumns) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.warn("WorkMeasurementGroup column ensure:", error.message);
    }
  }

  const fks = [
    [
      "FK_WorkMeasurementGroup_MasterGroup",
      `"GroupId"`,
      `public."MasterMeasurementGroup" ("GroupId")`,
    ],
    [
      "FK_WorkMeasurementGroup_Work",
      `"WorkId"`,
      `public."MasterWork" ("MasterWorkId")`,
    ],
    [
      "FK_WorkMeasurementGroup_SubWork",
      `"SubWorkId"`,
      `public."MasterSubWork" ("SubWorkId")`,
    ],
    [
      "FK_WorkMeasurementGroup_Organization",
      `"OrganizationId"`,
      `public."MasterOrganization" ("OrganizationId")`,
    ],
    [
      "FK_WorkMeasurementGroup_User",
      `"UserId"`,
      `public."MasterUser" ("UserId")`,
    ],
  ];
  for (const [name, column, ref] of fks) {
    try {
      await pool.query(`
        ALTER TABLE public."WorkMeasurementGroup"
          ADD CONSTRAINT "${name}"
          FOREIGN KEY (${column}) REFERENCES ${ref}
      `);
    } catch (error) {
      if (error.code !== "42710") {
        console.warn(`WorkMeasurementGroup ${name}:`, error.message);
      }
    }
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_WorkMeasurementGroup_WorkSub"
      ON public."WorkMeasurementGroup" ("WorkId", "SubWorkId", "Sequence")
  `);

  const seqRes = await pool.query(`
    SELECT pg_get_serial_sequence('"WorkMeasurementGroup"', 'WorkGroupId') AS seq
  `);
  const seq = seqRes.rows[0]?.seq;
  if (seq) {
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX("WorkGroupId"), 0)::bigint AS max
       FROM public."WorkMeasurementGroup"`,
    );
    await pool.query(
      `SELECT setval($1::regclass, GREATEST($2::bigint, 1), true)`,
      [seq, maxRes.rows[0].max],
    );
  }

  console.log("WorkMeasurementGroup schema ensured.");
}

function registerWorkMeasurementGroupRoutes(app, pool) {
  app.get("/api/work-measurement-groups/catalog", async (req, res) => {
    const userId = req.query.userId;
    try {
      const auth = await resolveSessionUser(pool, userId);
      if (auth.error) {
        return res
          .status(auth.error.status)
          .json({ message: auth.error.message });
      }
      const scope = sessionRecordScope(auth.actor);
      const result = await pool.query(
        `SELECT g."GroupId", g."GroupName", g."Percentage",
                g."Sequence", g."IsActive", g."Remarks",
                g."OrganizationId", g."UserId"
         FROM public."MasterMeasurementGroup" g
         WHERE ${scope.clause}
         ORDER BY COALESCE(g."Sequence", 999999), g."GroupId"`,
        scope.values,
      );
      return res.json({ data: result.rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/work-measurement-groups", async (req, res) => {
    const { userId, workId, subWorkId } = req.query;
    if (!workId || !subWorkId) {
      return res.status(400).json({
        message: "workId and subWorkId are required.",
      });
    }
    try {
      const auth = await resolveSessionUser(pool, userId);
      if (auth.error) {
        return res
          .status(auth.error.status)
          .json({ message: auth.error.message });
      }
      const scope = workGroupScope(auth.actor, workId, subWorkId, "w");
      const result = await pool.query(
        `SELECT w."WorkGroupId", w."GroupId", w."WorkId", w."SubWorkId",
                w."Percentage", w."OrganizationId", w."UserId",
                w."Sequence", w."Remarks",
                g."GroupName"
         FROM public."WorkMeasurementGroup" w
         LEFT JOIN public."MasterMeasurementGroup" g
           ON g."GroupId" = w."GroupId"
         WHERE ${scope.clause}
         ORDER BY COALESCE(w."Sequence", 999999), w."WorkGroupId"`,
        scope.values,
      );
      return res.json({ data: result.rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/work-measurement-groups", async (req, res) => {
    const { userId, workId, subWorkId, groups } = req.body || {};
    if (!workId || !subWorkId) {
      return res.status(400).json({
        message: "workId and subWorkId are required.",
      });
    }
    const rows = Array.isArray(groups) ? groups : [];
    try {
      const auth = await resolveSessionUser(pool, userId);
      if (auth.error) {
        return res
          .status(auth.error.status)
          .json({ message: auth.error.message });
      }
      const { actor } = auth;
      const masterScope = sessionRecordScope(actor);
      const allowed = await pool.query(
        `SELECT "GroupId" FROM public."MasterMeasurementGroup"
         WHERE ${masterScope.clause}`,
        masterScope.values,
      );
      const allowedIds = new Set(
        allowed.rows.map((r) => Number(r.GroupId)),
      );

      const prepared = [];
      const seen = new Set();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const groupId = Number(row.groupId ?? row.GroupId);
        if (!groupId) {
          return res.status(400).json({
            message: `Row ${i + 1}: Group Name is required.`,
          });
        }
        if (!allowedIds.has(groupId)) {
          return res.status(400).json({
            message: `Row ${i + 1}: selected group is not available for this organization.`,
          });
        }
        if (seen.has(groupId)) {
          return res.status(400).json({
            message: "Each Group Name can be selected only once.",
          });
        }
        seen.add(groupId);
        const percentageRaw = row.percentage ?? row.Percentage;
        const percentage =
          percentageRaw === "" ||
          percentageRaw === null ||
          percentageRaw === undefined
            ? 0
            : Number(percentageRaw);
        if (!Number.isFinite(percentage)) {
          return res.status(400).json({
            message: `Row ${i + 1}: Percentage must be a number.`,
          });
        }
        const remarks = String(row.remarks ?? row.Remarks ?? "").trim();
        if (remarks.length > REMARKS_MAX) {
          return res.status(400).json({
            message: `Row ${i + 1}: Remarks must be at most ${REMARKS_MAX} characters.`,
          });
        }
        prepared.push({
          groupId,
          percentage,
          remarks: remarks || null,
        });
      }

      const scope = workGroupScope(actor, workId, subWorkId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM public."WorkMeasurementGroup" WHERE ${scope.clause}`,
          scope.values,
        );
        const inserted = [];
        for (let i = 0; i < prepared.length; i += 1) {
          const row = prepared[i];
          const result = await client.query(
            `INSERT INTO public."WorkMeasurementGroup"
              ("GroupId", "WorkId", "SubWorkId", "Percentage",
               "OrganizationId", "UserId", "Sequence", "Remarks")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING "WorkGroupId", "GroupId", "WorkId", "SubWorkId",
                       "Percentage", "OrganizationId", "UserId",
                       "Sequence", "Remarks"`,
            [
              row.groupId,
              Number(workId),
              Number(subWorkId),
              row.percentage,
              Number(actor.OrganizationId),
              Number(actor.UserId),
              i + 1,
              row.remarks,
            ],
          );
          inserted.push(result.rows[0]);
        }
        await client.query("COMMIT");
        return res.json({
          message: "Measurement groups saved.",
          data: inserted,
        });
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {
          /* ignore */
        }
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  });
}

module.exports = {
  ensureWorkMeasurementGroupSchema,
  registerWorkMeasurementGroupRoutes,
};
