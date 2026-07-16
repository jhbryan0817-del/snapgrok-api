import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported screenshot data URL.");
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  return { extension, bytes: Buffer.from(match[2], "base64") };
}

export class DataStore {
  constructor(baseDirectory) {
    this.baseDirectory = path.resolve(baseDirectory);
    this.casesDirectory = path.join(this.baseDirectory, "cases");
  }

  async initialize() {
    await fs.mkdir(this.casesDirectory, { recursive: true });
  }

  async saveCase({ imageDataUrl, request, result }) {
    await this.initialize();
    const id = `${safeTimestamp()}_${crypto.randomUUID()}`;
    const { extension, bytes } = parseImageDataUrl(imageDataUrl);
    const imageFile = `${id}.${extension}`;
    const metadataFile = `${id}.json`;

    await fs.writeFile(path.join(this.casesDirectory, imageFile), bytes);
    await fs.writeFile(
      path.join(this.casesDirectory, metadataFile),
      JSON.stringify(
        {
          id,
          createdAt: new Date().toISOString(),
          screenshotFile: imageFile,
          shortcutName: request.shortcutName,
          instruction: request.instruction,
          maxWords: request.maxWords,
          sourceUrl: request.sourceUrl || null,
          sourceTitle: request.sourceTitle || null,
          response: result.text,
          model: result.model,
          usage: result.usage || null,
        },
        null,
        2,
      ),
      "utf8",
    );

    return id;
  }

  async clearAll() {
    await this.initialize();
    const entries = await fs.readdir(this.casesDirectory, { withFileTypes: true });
    let deletedFiles = 0;

    for (const entry of entries) {
      if (!entry.isFile() || entry.name === ".gitkeep") continue;
      await fs.unlink(path.join(this.casesDirectory, entry.name));
      deletedFiles += 1;
    }

    return { deletedFiles };
  }

  async getSummary() {
    await this.initialize();
    const entries = await fs.readdir(this.casesDirectory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name !== ".gitkeep");
    return {
      storedCases: files.filter((entry) => entry.name.endsWith(".json")).length,
      storedFiles: files.length,
    };
  }
}
