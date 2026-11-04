// Cross-platform Maven wrapper for npm scripts. Keeps one command on Windows and POSIX.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cwd = join(here, "..", "server");
const windows = process.platform === "win32";
const command = windows ? "mvnw.cmd" : "./mvnw";
const result = spawnSync(command, process.argv.slice(2), {
  cwd,
  stdio: "inherit",
  shell: windows,
});

process.exit(result.status ?? 1);
