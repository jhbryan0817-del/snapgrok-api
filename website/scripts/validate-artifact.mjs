import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = process.cwd();
const workerPath = path.join(projectDirectory, "dist", "server", "index.js");
const hostingPath = path.join(
  projectDirectory,
  "dist",
  ".openai",
  "hosting.json",
);

JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set(
  "sites-validation",
  `${process.pid}-${Date.now()}`,
);
const worker = await import(workerUrl.href);

if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error(
    "dist/server/index.js must export a default object with fetch(request, env, ctx).",
  );
}

console.log(
  "Validated Sites artifact: Worker default.fetch and hosting manifest are present.",
);
