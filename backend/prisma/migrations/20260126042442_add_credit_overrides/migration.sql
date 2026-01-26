/*
  Warnings:

  - You are about to drop the column `planned` on the `Plan` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taken" TEXT NOT NULL,
    "inProgress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "creditOverrides" TEXT
);
INSERT INTO "new_Plan" ("createdAt", "id", "inProgress", "taken", "updatedAt") SELECT "createdAt", "id", "inProgress", "taken", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
