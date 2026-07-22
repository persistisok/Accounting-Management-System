ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
UPDATE "users" SET "role" = 'SYSTEM_ADMIN' WHERE "username" = 'admin';
DROP TYPE "UserRole";
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'ADMIN', 'GUEST');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
