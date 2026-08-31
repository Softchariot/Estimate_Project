const INDIVIDUAL_ORGANIZATION_ID = Number(
  process.env.SIGNUP_INDIVIDUAL_ORG_ID || 3,
);
const GROUP_NAME_MAX = 50;
const REMARKS_MAX = 200;

function normalizeUserCategoryName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isHoldingOrganization(organizationId) {
  return Number(organizationId) === INDIVIDUAL_ORGANIZATION_ID;
}

function actorCanAccessMeasurementGroups(actor) {
  if (!actor) return false;
  const category = normalizeUserCategoryName(actor.UserCategoryName);
  if (category === "superadmin") return true;
  if (isHoldingOrganization(actor.OrganizationId)) return true;
  return category === "orgadmin";
}

function groupScope(actor) {
  const orgId = Number(actor.OrganizationId);
  if (isHoldingOrganization(orgId)) {
    return {
      clause: `"OrganizationId" = $1 AND "UserId" = $2`,
      values: [orgId, Number(actor.UserId)],
    };
  }
  return {
    clause: `"OrganizationId" = $1`,
    values: [orgId],
  };
}

function parseIsActive(value) {
  if (value === true || value === "true" || value === "Yes" || value === "yes") {
    return true;
  }
  if (value === false || value === "false" || value === "No" || value === "no") {
    return false;
  }
  return true;
}

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ""))) return null;
  return `"${name}"`;
}

/** Drop leftover unique-on-GroupName-only keys so names can repeat across orgs. */
async function dropGlobalGroupNameUniques(pool) {
  await pool.query(`
    ALTER TABLE public."MasterMeasurementGroup"
      DROP CONSTRAINT IF EXISTS "MasterMeasurementGroup_GroupName_key"
  `);

  const constraints = await pool.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'MasterMeasurementGroup'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~* '\\("GroupName"\\)$'
  `);
  for (const row of constraints.rows) {
    const ident = quoteIdent(row.conname);
    if (!ident) continue;
    await pool.query(
      `ALTER TABLE public."MasterMeasurementGroup" DROP CONSTRAINT IF EXISTS ${ident}`,
    );
  }

  const indexes = await pool.query(`
    SELECT i.relname AS index_name
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'MasterMeasurementGroup'
      AND x.indisunique
      AND NOT x.indisprimary
      AND i.relname NOT IN (
        'UX_MasterMeasurementGroup_Org_Name',
        'UX_MasterMeasurementGroup_User_Name'
      )
    GROUP BY i.relname
    HAVING COUNT(DISTINCT a.attname) = 1
       AND MIN(a.attname) = 'GroupName'
  `);
  for (const row of indexes.rows) {
    const ident = quoteIdent(row.index_name);
    if (!ident) continue;
    await pool.query(`DROP INDEX IF EXISTS public.${ident}`);
  }
}

async function ensureMasterMeasurementGroupSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public."MasterMeasurementGroup" (
      "GroupId" serial PRIMARY KEY,
      "GroupName" varchar(50) NOT NULL,
      "Percentage" double precision,
      "OrganizationId" integer NOT NULL,
      "UserId" integer NOT NULL,
      "Sequence" integer NOT NULL,
      "IsActive" boolean NOT NULL DEFAULT true,
      "Remarks" varchar(200)
    )
  `);

  const addColumns = [
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "GroupName" varchar(50)`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "Percentage" double precision`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "OrganizationId" integer`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "UserId" integer`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "Sequence" integer`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "IsActive" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE public."MasterMeasurementGroup" ADD COLUMN IF NOT EXISTS "Remarks" varchar(200)`,
  ];
  for (const sql of addColumns) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.warn("MasterMeasurementGroup column ensure:", error.message);
    }
  }

  try {
    await pool.query(`
      ALTER TABLE public."MasterMeasurementGroup"
        ADD CONSTRAINT "FK_MasterMeasurementGroup_Organization"
        FOREIGN KEY ("OrganizationId")
        REFERENCES public."MasterOrganization" ("OrganizationId")
    `);
  } catch (error) {
    if (error.code !== "42710") {
      console.warn("MasterMeasurementGroup Organization FK:", error.message);
    }
  }
  try {
    await pool.query(`
      ALTER TABLE public."MasterMeasurementGroup"
        ADD CONSTRAINT "FK_MasterMeasurementGroup_User"
        FOREIGN KEY ("UserId")
        REFERENCES public."MasterUser" ("UserId")
    `);
  } catch (error) {
    if (error.code !== "42710") {
      console.warn("MasterMeasurementGroup User FK:", error.message);
    }
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_MasterMeasurementGroup_Org"
      ON public."MasterMeasurementGroup" ("OrganizationId", "Sequence")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_MasterMeasurementGroup_User"
      ON public."MasterMeasurementGroup" ("UserId", "Sequence")
  `);

  try {
    await dropGlobalGroupNameUniques(pool);
  } catch (error) {
    console.warn("MasterMeasurementGroup drop GroupName unique:", error.message);
  }

  // Orgs other than 3: same GroupName is allowed only when OrganizationId differs.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UX_MasterMeasurementGroup_Org_Name"
      ON public."MasterMeasurementGroup" ("OrganizationId", lower("GroupName"))
      WHERE "OrganizationId" <> ${Number(INDIVIDUAL_ORGANIZATION_ID)}
  `);
  // Org 3: same GroupName is not allowed for the same UserId.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UX_MasterMeasurementGroup_User_Name"
      ON public."MasterMeasurementGroup" ("UserId", lower("GroupName"))
      WHERE "OrganizationId" = ${Number(INDIVIDUAL_ORGANIZATION_ID)}
  `);

  // Org 3: Sequence is independent per UserId. Other orgs: Sequence is per OrganizationId.
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_MasterMeasurementGroup_User_Seq"
        ON public."MasterMeasurementGroup" ("UserId", "Sequence")
        WHERE "OrganizationId" = ${Number(INDIVIDUAL_ORGANIZATION_ID)}
    `);
  } catch (error) {
    console.warn("MasterMeasurementGroup user sequence unique:", error.message);
  }
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_MasterMeasurementGroup_Org_Seq"
        ON public."MasterMeasurementGroup" ("OrganizationId", "Sequence")
        WHERE "OrganizationId" <> ${Number(INDIVIDUAL_ORGANIZATION_ID)}
    `);
  } catch (error) {
    console.warn("MasterMeasurementGroup org sequence unique:", error.message);
  }

  const seqRes = await pool.query(`
    SELECT pg_get_serial_sequence('"MasterMeasurementGroup"', 'GroupId') AS seq
  `);
  const seq = seqRes.rows[0]?.seq;
  if (seq) {
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX("GroupId"), 0)::bigint AS max
       FROM public."MasterMeasurementGroup"`,
    );
    await pool.query(
      `SELECT setval($1::regclass, GREATEST($2::bigint, 1), true)`,
      [seq, maxRes.rows[0].max],
    );
  }

  console.log("MasterMeasurementGroup schema ensured.");
}

async function resolveMeasurementGroupActor(pool, userId) {
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
  if (!actorCanAccessMeasurementGroups(actor)) {
    return {
      error: {
        status: 403,
        message:
          "Only SuperAdmin, OrgAdmin of other organizations, or users of organization 3, can manage measurement groups.",
      },
    };
  }
  if (!actor.OrganizationId) {
    return {
      error: {
        status: 403,
        message: "Organization is required to manage measurement groups.",
      },
    };
  }
  return { actor };
}

function validateGroupPayload(body, { requirePercentage = true } = {}) {
  const groupName = String(body?.groupName ?? body?.GroupName ?? "").trim();
  if (!groupName) {
    return { error: { status: 400, message: "Group Name is required." } };
  }
  if (groupName.length > GROUP_NAME_MAX) {
    return {
      error: {
        status: 400,
        message: `Group Name must be at most ${GROUP_NAME_MAX} characters.`,
      },
    };
  }

  const rawPercentage = body?.percentage ?? body?.Percentage;
  let percentage = null;
  if (
    rawPercentage === "" ||
    rawPercentage === null ||
    rawPercentage === undefined
  ) {
    if (requirePercentage) {
      return { error: { status: 400, message: "Percentage is required." } };
    }
  } else {
    percentage = Number(rawPercentage);
    if (!Number.isFinite(percentage)) {
      return {
        error: { status: 400, message: "Percentage must be a number." },
      };
    }
  }

  const remarksRaw = body?.remarks ?? body?.Remarks ?? "";
  const remarks = remarksRaw === null || remarksRaw === undefined
    ? ""
    : String(remarksRaw).trim();
  if (remarks.length > REMARKS_MAX) {
    return {
      error: {
        status: 400,
        message: `Remarks must be at most ${REMARKS_MAX} characters.`,
      },
    };
  }

  const isActive = parseIsActive(body?.isActive ?? body?.IsActive);

  return { groupName, percentage, remarks: remarks || null, isActive };
}

function rowBelongsToActor(row, actor) {
  if (isHoldingOrganization(actor.OrganizationId)) {
    return Number(row.UserId) === Number(actor.UserId);
  }
  return Number(row.OrganizationId) === Number(actor.OrganizationId);
}

function duplicateGroupNameMessage(groupName, organizationId) {
  if (isHoldingOrganization(organizationId)) {
    return `Group Name “${groupName}” already exists for this user.`;
  }
  return `Group Name “${groupName}” already exists for this organization.`;
}

function duplicateGroupNameFromDb(error, groupName) {
  if (error?.code !== "23505") return null;
  const detail = `${error.constraint || ""} ${error.message || ""}`;
  const orgId = /User_Name/i.test(detail) ? INDIVIDUAL_ORGANIZATION_ID : 0;
  return duplicateGroupNameMessage(groupName, orgId);
}

async function findDuplicateGroupName(pool, actor, groupName, excludeGroupId) {
  const orgId = Number(actor.OrganizationId);
  const excludeId =
    excludeGroupId === null || excludeGroupId === undefined
      ? null
      : Number(excludeGroupId);
  if (isHoldingOrganization(orgId)) {
    const result = await pool.query(
      `SELECT "GroupId" FROM public."MasterMeasurementGroup"
       WHERE "OrganizationId" = $1
         AND "UserId" = $2
         AND UPPER("GroupName") = UPPER($3)
         AND ($4::int IS NULL OR "GroupId" <> $4)
       LIMIT 1`,
      [orgId, Number(actor.UserId), groupName, excludeId],
    );
    return result.rows[0] || null;
  }
  const result = await pool.query(
    `SELECT "GroupId" FROM public."MasterMeasurementGroup"
     WHERE "OrganizationId" = $1
       AND UPPER("GroupName") = UPPER($2)
       AND ($3::int IS NULL OR "GroupId" <> $3)
     LIMIT 1`,
    [orgId, groupName, excludeId],
  );
  return result.rows[0] || null;
}

function registerMeasurementGroupRoutes(app, pool) {
  app.get("/api/measurement-groups", async (req, res) => {
    const userId = req.query.userId;
    try {
      const auth = await resolveMeasurementGroupActor(pool, userId);
      if (auth.error) {
        return res.status(auth.error.status).json({ message: auth.error.message });
      }
      const scope = groupScope(auth.actor);
      const result = await pool.query(
        `SELECT g."GroupId", g."GroupName", g."Percentage",
                g."OrganizationId", g."UserId", g."Sequence",
                g."IsActive", g."Remarks"
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

  app.post("/api/measurement-groups", async (req, res) => {
    const userId = req.body?.userId;
    try {
      const auth = await resolveMeasurementGroupActor(pool, userId);
      if (auth.error) {
        return res.status(auth.error.status).json({ message: auth.error.message });
      }
      const parsed = validateGroupPayload(req.body);
      if (parsed.error) {
        return res
          .status(parsed.error.status)
          .json({ message: parsed.error.message });
      }

      const { actor } = auth;
      const duplicate = await findDuplicateGroupName(
        pool,
        actor,
        parsed.groupName,
      );
      if (duplicate) {
        return res.status(409).json({
          message: duplicateGroupNameMessage(
            parsed.groupName,
            actor.OrganizationId,
          ),
        });
      }
      const scope = groupScope(actor);
      const maxSeq = await pool.query(
        `SELECT COALESCE(MAX("Sequence"), 0) AS "MaxSequence"
         FROM public."MasterMeasurementGroup"
         WHERE ${scope.clause}`,
        scope.values,
      );
      const nextSequence = Number(maxSeq.rows[0]?.MaxSequence || 0) + 1;

      const result = await pool.query(
        `INSERT INTO public."MasterMeasurementGroup"
          ("GroupName", "Percentage", "OrganizationId", "UserId",
           "Sequence", "IsActive", "Remarks")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "GroupId", "GroupName", "Percentage", "OrganizationId",
                   "UserId", "Sequence", "IsActive", "Remarks"`,
        [
          parsed.groupName,
          parsed.percentage,
          Number(actor.OrganizationId),
          Number(actor.UserId),
          nextSequence,
          parsed.isActive,
          parsed.remarks,
        ],
      );
      return res.status(201).json({
        message: "Measurement group saved.",
        data: result.rows[0],
      });
    } catch (error) {
      const duplicateMessage = duplicateGroupNameFromDb(
        error,
        req.body?.groupName || req.body?.GroupName || "",
      );
      if (duplicateMessage) {
        return res.status(409).json({ message: duplicateMessage });
      }
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/measurement-groups/reorder", async (req, res) => {
    const userId = req.body?.userId;
    const ids = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((id) => Number(id)).filter((id) => id > 0)
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: "orderedIds are required." });
    }

    const client = await pool.connect();
    try {
      const auth = await resolveMeasurementGroupActor(pool, userId);
      if (auth.error) {
        return res
          .status(auth.error.status)
          .json({ message: auth.error.message });
      }
      const scope = groupScope(auth.actor);
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT "GroupId" FROM public."MasterMeasurementGroup"
         WHERE ${scope.clause}`,
        scope.values,
      );
      const existingIds = new Set(
        existing.rows.map((r) => Number(r.GroupId)),
      );
      if (
        ids.length !== existingIds.size ||
        ids.some((id) => !existingIds.has(id))
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "orderedIds must include every measurement group in this list exactly once.",
        });
      }

      await client.query(
        `UPDATE public."MasterMeasurementGroup"
         SET "Sequence" = "Sequence" + 100000
         WHERE ${scope.clause}`,
        scope.values,
      );
      for (let i = 0; i < ids.length; i += 1) {
        await client.query(
          `UPDATE public."MasterMeasurementGroup"
           SET "Sequence" = $1
           WHERE "GroupId" = $2`,
          [i + 1, ids[i]],
        );
      }
      await client.query("COMMIT");
      return res.json({ message: "Measurement group sequence updated." });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      console.error(error);
      return res.status(500).json({ message: error.message });
    } finally {
      client.release();
    }
  });

  app.put("/api/measurement-groups/:id", async (req, res) => {
    const groupId = Number(req.params.id);
    if (!groupId) {
      return res.status(400).json({ message: "Valid GroupId is required." });
    }
    const userId = req.body?.userId;
    try {
      const auth = await resolveMeasurementGroupActor(pool, userId);
      if (auth.error) {
        return res
          .status(auth.error.status)
          .json({ message: auth.error.message });
      }
      const parsed = validateGroupPayload(req.body);
      if (parsed.error) {
        return res
          .status(parsed.error.status)
          .json({ message: parsed.error.message });
      }

      const existing = await pool.query(
        `SELECT "GroupId", "OrganizationId", "UserId"
         FROM public."MasterMeasurementGroup"
         WHERE "GroupId" = $1`,
        [groupId],
      );
      const row = existing.rows[0];
      if (!row) {
        return res.status(404).json({ message: "Measurement group not found." });
      }
      if (!rowBelongsToActor(row, auth.actor)) {
        return res.status(403).json({
          message: "You cannot modify this measurement group.",
        });
      }

      const duplicate = await findDuplicateGroupName(
        pool,
        auth.actor,
        parsed.groupName,
        groupId,
      );
      if (duplicate) {
        return res.status(409).json({
          message: duplicateGroupNameMessage(
            parsed.groupName,
            auth.actor.OrganizationId,
          ),
        });
      }

      const result = await pool.query(
        `UPDATE public."MasterMeasurementGroup"
         SET "GroupName" = $1,
             "Percentage" = $2,
             "IsActive" = $3,
             "Remarks" = $4
         WHERE "GroupId" = $5
         RETURNING "GroupId", "GroupName", "Percentage", "OrganizationId",
                   "UserId", "Sequence", "IsActive", "Remarks"`,
        [
          parsed.groupName,
          parsed.percentage,
          parsed.isActive,
          parsed.remarks,
          groupId,
        ],
      );
      return res.json({
        message: "Measurement group updated.",
        data: result.rows[0],
      });
    } catch (error) {
      const duplicateMessage = duplicateGroupNameFromDb(
        error,
        req.body?.groupName || req.body?.GroupName || "",
      );
      if (duplicateMessage) {
        return res.status(409).json({ message: duplicateMessage });
      }
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  });
}

module.exports = {
  INDIVIDUAL_ORGANIZATION_ID,
  ensureMasterMeasurementGroupSchema,
  registerMeasurementGroupRoutes,
};
