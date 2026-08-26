const { randomUUID } = require("crypto");

const IDLE_SECONDS = Math.max(
  15,
  Number(process.env.USER_SESSION_IDLE_SECONDS || 120)
);
const WARNING_SECONDS = Math.max(
  5,
  Number(process.env.USER_SESSION_WARNING_SECONDS || 105)
);

function pushIpCandidates(list, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => pushIpCandidates(list, item));
    return;
  }
  String(value)
    .split(",")
    .forEach((part) => {
      const ip = sanitizeIp(part);
      if (ip) list.push(ip);
    });
}

function getClientIp(req) {
  const candidates = [];
  pushIpCandidates(candidates, req.headers["cf-connecting-ip"]);
  pushIpCandidates(candidates, req.headers["true-client-ip"]);
  pushIpCandidates(candidates, req.headers["x-real-ip"]);
  pushIpCandidates(candidates, req.headers["x-forwarded-for"]);
  pushIpCandidates(candidates, req.headers["x-client-ip"]);
  pushIpCandidates(candidates, req.ip);
  pushIpCandidates(candidates, req.ips);
  pushIpCandidates(candidates, req.socket?.remoteAddress);
  pushIpCandidates(candidates, req.connection?.remoteAddress);
  const publicIp = candidates.find((ip) => !isPrivateIp(ip));
  return publicIp || candidates[0] || null;
}

function sanitizeIp(raw) {
  let value = String(raw || "").trim().replace(/^\[|\]$/g, "");
  if (!value) return null;
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) value = mapped[1];
  if (/^(?:\d{1,3}\.){3}\d{1,3}:\d+$/.test(value)) {
    value = value.replace(/:\d+$/, "");
  }
  value = value.replace(/%[0-9a-z]+$/i, "");
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":")) {
    return value.slice(0, 45);
  }
  return null;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const value = String(ip).toLowerCase();
  if (
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "0:0:0:0:0:0:0:1" ||
    value === "::" ||
    value === "0.0.0.0"
  ) {
    return true;
  }
  if (
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    value.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  ) {
    return true;
  }
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
    return true;
  }
  return false;
}

function readClientGps(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

async function fetchJson(url, ms = 2500) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) return null;
  return res.json();
}

async function lookupPublicIp() {
  try {
    const data = await fetchJson("https://api.ipify.org?format=json");
    return sanitizeIp(data?.ip);
  } catch {
    return null;
  }
}

async function lookupIpLocation(ip) {
  if (!ip || isPrivateIp(ip)) return null;
  const encoded = encodeURIComponent(ip);
  try {
    const data = await fetchJson(`https://ipapi.co/${encoded}/json/`);
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const location = [data.city, data.region, data.country_name]
        .filter(Boolean)
        .join(", ")
        .slice(0, 255);
      return {
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
        location: location || null,
        locationSource: "IP",
      };
    }
  } catch {
    // try ip-api.com next
  }
  try {
    const data = await fetchJson(
      `http://ip-api.com/json/${encoded}?fields=status,lat,lon,city,regionName,country`
    );
    if (data?.status !== "success") return null;
    const latitude = Number(data.lat);
    const longitude = Number(data.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const location = [data.city, data.regionName, data.country]
      .filter(Boolean)
      .join(", ")
      .slice(0, 255);
    return {
      latitude: Number(latitude.toFixed(7)),
      longitude: Number(longitude.toFixed(7)),
      location: location || null,
      locationSource: "IP",
    };
  } catch {
    return null;
  }
}

function parseUserAgent(uaRaw) {
  const ua = String(uaRaw || "");
  let browser = "Unknown";
  let operatingSystem = "Unknown";
  let deviceType = "Desktop";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  if (/Windows NT/i.test(ua)) operatingSystem = "Windows";
  else if (/Mac OS X/i.test(ua)) operatingSystem = "macOS";
  else if (/Android/i.test(ua)) operatingSystem = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) operatingSystem = "iOS";
  else if (/Linux/i.test(ua)) operatingSystem = "Linux";

  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = "Tablet";
  } else if (/Mobile|iPhone|Android.+Mobile/i.test(ua)) {
    deviceType = "Mobile";
  }

  return {
    UserAgent: ua.slice(0, 1000) || null,
    Browser: browser.slice(0, 100),
    OperatingSystem: operatingSystem.slice(0, 100),
    DeviceType: deviceType.slice(0, 30),
  };
}

async function columnSqlType(pool, tableName, columnName) {
  const result = await pool.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [tableName, columnName]
  );
  const type = result.rows[0]?.data_type;
  if (type === "bigint") return "bigint";
  if (type === "smallint") return "smallint";
  return "integer";
}

async function ensureUserLogTrackSchema(pool) {
  const userIdType = await columnSqlType(pool, "MasterUser", "UserId");
  const orgIdType = await columnSqlType(
    pool,
    "MasterOrganization",
    "OrganizationId"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public."UserLogTrack" (
      "UserLogTrackId" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "UserId" ${userIdType} NOT NULL,
      "OrganizationId" ${orgIdType} NOT NULL,
      "SessionId" varchar(255) NOT NULL,
      "LoginDateTime" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "LogoutDateTime" timestamptz NULL,
      "LastActivityDateTime" timestamptz DEFAULT CURRENT_TIMESTAMP,
      "SessionStatus" varchar(20) NOT NULL DEFAULT 'Active',
      "LogoutReason" varchar(30),
      "IPAddress" inet,
      "Latitude" numeric(10,7),
      "Longitude" numeric(10,7),
      "Location" varchar(255),
      "LocationSource" varchar(20),
      "DeviceType" varchar(30),
      "DeviceName" varchar(100),
      "OperatingSystem" varchar(100),
      "Browser" varchar(100),
      "UserAgent" text,
      "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "UpdatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CK_UserLogTrack_SessionStatus"
        CHECK ("SessionStatus" IN ('Active', 'LoggedOut', 'Expired', 'ForcedLogout')),
      CONSTRAINT "CK_UserLogTrack_LogoutReason"
        CHECK (
          "LogoutReason" IS NULL
          OR "LogoutReason" IN (
            'UserLogout',
            'SessionExpired',
            'BrowserClosed',
            'ForcedLogout',
            'AdminLogout',
            'SystemLogout',
            'Unknown'
          )
        ),
      CONSTRAINT "CK_UserLogTrack_LocationSource"
        CHECK (
          "LocationSource" IS NULL
          OR "LocationSource" IN ('GPS', 'IP', 'Manual', 'Unknown')
        ),
      CONSTRAINT "CK_UserLogTrack_Latitude"
        CHECK ("Latitude" IS NULL OR ("Latitude" >= -90 AND "Latitude" <= 90)),
      CONSTRAINT "CK_UserLogTrack_Longitude"
        CHECK ("Longitude" IS NULL OR ("Longitude" >= -180 AND "Longitude" <= 180)),
      CONSTRAINT "CK_UserLogTrack_Logout"
        CHECK (
          ("SessionStatus" = 'Active'
            AND "LogoutDateTime" IS NULL
            AND "LogoutReason" IS NULL)
          OR
          ("SessionStatus" <> 'Active'
            AND "LogoutDateTime" IS NOT NULL
            AND "LogoutReason" IS NOT NULL)
        ),
      CONSTRAINT "CK_UserLogTrack_DateSequence"
        CHECK (
          "LogoutDateTime" IS NULL
          OR "LogoutDateTime" >= "LoginDateTime"
        )
    )
  `);

  const addColumns = [
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "UserAgent" text`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "Browser" varchar(100)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "OperatingSystem" varchar(100)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "DeviceType" varchar(30)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "DeviceName" varchar(100)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "IPAddress" inet`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "Latitude" numeric(10,7)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "Longitude" numeric(10,7)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "Location" varchar(255)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "LocationSource" varchar(20)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "LastActivityDateTime" timestamptz DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "LogoutDateTime" timestamptz`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "LogoutReason" varchar(30)`,
    `ALTER TABLE public."UserLogTrack" ADD COLUMN IF NOT EXISTS "SessionStatus" varchar(20) NOT NULL DEFAULT 'Active'`,
  ];
  for (const sql of addColumns) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.warn("UserLogTrack column ensure:", error.message);
    }
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IX_UserLogTrack_SessionId"
      ON public."UserLogTrack" ("SessionId")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_UserLogTrack_UserId"
      ON public."UserLogTrack" ("UserId")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_UserLogTrack_OrgId"
      ON public."UserLogTrack" ("OrganizationId")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_UserLogTrack_LoginDateTime"
      ON public."UserLogTrack" ("LoginDateTime")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IX_UserLogTrack_Status_LastActivity"
      ON public."UserLogTrack" ("SessionStatus", "LastActivityDateTime")
  `);

  try {
    await pool.query(`
      ALTER TABLE public."UserLogTrack"
        ADD CONSTRAINT "FK_UserLogTrack_User"
        FOREIGN KEY ("UserId") REFERENCES public."MasterUser" ("UserId")
    `);
  } catch (error) {
    if (error.code !== "42710") {
      console.warn("UserLogTrack User FK:", error.message);
    }
  }
  try {
    await pool.query(`
      ALTER TABLE public."UserLogTrack"
        ADD CONSTRAINT "FK_UserLogTrack_Organization"
        FOREIGN KEY ("OrganizationId") REFERENCES public."MasterOrganization" ("OrganizationId")
    `);
  } catch (error) {
    if (error.code !== "42710") {
      console.warn("UserLogTrack Org FK:", error.message);
    }
  }
}

async function openUserLogSession(pool, req, user) {
  const userId = Number(user.UserId);
  const organizationId = Number(user.OrganizationId);
  if (!userId || !organizationId) {
    throw new Error("Authenticated user is missing UserId or OrganizationId.");
  }

  const sessionId = randomUUID();
  const parsed = parseUserAgent(req.headers["user-agent"]);

  let ipAddress = getClientIp(req);
  if (!ipAddress || isPrivateIp(ipAddress)) {
    const publicIp = await lookupPublicIp();
    if (publicIp) ipAddress = publicIp;
  }

  const gps = readClientGps(req.body);
  let latitude = gps?.latitude ?? null;
  let longitude = gps?.longitude ?? null;
  let location = null;
  let locationSource = gps ? "GPS" : null;

  if (!gps) {
    const ipLocation = await lookupIpLocation(ipAddress);
    if (ipLocation) {
      latitude = ipLocation.latitude;
      longitude = ipLocation.longitude;
      location = ipLocation.location;
      locationSource = ipLocation.locationSource;
    }
  }

  await pool.query(
    `INSERT INTO public."UserLogTrack" (
       "UserId", "OrganizationId", "SessionId",
       "LoginDateTime", "LastActivityDateTime",
       "IPAddress", "Latitude", "Longitude", "Location", "LocationSource",
       "UserAgent", "Browser", "OperatingSystem",
       "DeviceType", "SessionStatus", "UpdatedAt"
     ) VALUES (
       $1, $2, $3, NOW(), NOW(),
       NULLIF($4::text, '')::inet, $5, $6, $7, $8,
       $9, $10, $11,
       $12, 'Active', NOW()
     )`,
    [
      userId,
      organizationId,
      sessionId,
      ipAddress,
      latitude,
      longitude,
      location,
      locationSource,
      parsed.UserAgent,
      parsed.Browser,
      parsed.OperatingSystem,
      parsed.DeviceType,
    ]
  );

  return { sessionId };
}

async function closeUserLogSession(pool, sessionId, status, reason) {
  if (!sessionId) return { closed: false };
  const result = await pool.query(
    `UPDATE public."UserLogTrack"
     SET "SessionStatus" = $2,
         "LogoutReason" = $3,
         "LogoutDateTime" = NOW(),
         "UpdatedAt" = NOW()
     WHERE "SessionId" = $1
       AND "SessionStatus" = 'Active'
     RETURNING "UserLogTrackId"`,
    [sessionId, status, reason]
  );
  return { closed: result.rowCount > 0 };
}

async function heartbeatUserLogSession(pool, sessionId) {
  if (!sessionId) {
    return { ok: false, expired: false };
  }

  const found = await pool.query(
    `SELECT "UserLogTrackId", "SessionStatus",
            EXTRACT(EPOCH FROM (NOW() - "LastActivityDateTime")) AS idle_seconds
     FROM public."UserLogTrack"
     WHERE "SessionId" = $1`,
    [sessionId]
  );
  if (!found.rows.length) {
    return { ok: false, expired: true };
  }

  const row = found.rows[0];
  if (row.SessionStatus !== "Active") {
    return { ok: false, expired: true };
  }

  if (Number(row.idle_seconds) > IDLE_SECONDS) {
    await closeUserLogSession(pool, sessionId, "Expired", "SessionExpired");
    return { ok: false, expired: true };
  }

  await pool.query(
    `UPDATE public."UserLogTrack"
     SET "LastActivityDateTime" = NOW(),
         "UpdatedAt" = NOW()
     WHERE "SessionId" = $1
       AND "SessionStatus" = 'Active'`,
    [sessionId]
  );
  return { ok: true, expired: false };
}

module.exports = {
  IDLE_SECONDS,
  WARNING_SECONDS,
  ensureUserLogTrackSchema,
  openUserLogSession,
  closeUserLogSession,
  heartbeatUserLogSession,
};
