import { spawn } from "node:child_process";

for (const script of [
  "migrate-deletion-ledger.js",
  "migrate.js",
  "privacy-preflight.js",
  "deletion-ledger-preflight.js",
]) {
  await run(script);
}
console.log(JSON.stringify({ operation: "release_databases", ready: true }));

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `${script} failed with ${signal ? `signal ${signal}` : `exit ${code}`}.`,
      ));
    });
  });
}
