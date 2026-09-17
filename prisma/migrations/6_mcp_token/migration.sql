-- The MCP endpoint's credential: a SHA-256 digest, never the token itself.
-- Null (the default for existing rows) leaves the endpoint switched off.
ALTER TABLE "Settings" ADD COLUMN "mcpTokenHash" TEXT;
ALTER TABLE "Settings" ADD COLUMN "mcpTokenCreatedAt" DATETIME;
