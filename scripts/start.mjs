import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.env.NODE_ENV ??= "production";
for (const script of ["migrate.mjs", ...(process.env.SEED_PERSONAL_SCHEDULE === "false" ? [] : ["seed-schedule-508.mjs"])]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await import("../dist/boot.js");
