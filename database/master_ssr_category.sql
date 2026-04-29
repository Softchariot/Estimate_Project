CREATE TABLE IF NOT EXISTS "MasterSSRCategory" (
    "SSRCategoryId" BIGSERIAL PRIMARY KEY,
    "SSRRegionId" BIGINT NOT NULL,
    "SSRCategoryName" VARCHAR(100) NOT NULL,
    "SSRCategoryShortName" VARCHAR(50) NOT NULL,
    "DOrder" INTEGER NULL,
    "DOrder1" INTEGER NULL,
    "Remarks" VARCHAR(150) NULL,
    CONSTRAINT "FK_MasterSSRCategory_MasterSSRRegion"
      FOREIGN KEY ("SSRRegionId")
      REFERENCES "MasterSSRRegion" ("SSRRegionId")
      ON UPDATE CASCADE
      ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "idx_MasterSSRCategory_SSRRegionId"
ON "MasterSSRCategory" ("SSRRegionId");
