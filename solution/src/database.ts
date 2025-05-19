import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { canonicalize } from "json-canonicalize";
import { logger } from "./logger";
import { isMainThread } from "worker_threads";

const DB_FILE = "data/objects.json";
let chainTipId: string | null = null;

export function computeObjectId(obj: any): string {
  const canonical = canonicalize(obj);
  if (canonical === undefined) {
    throw new Error("Unable to canonicalize object");
  }
  const hash = crypto.createHash("blake2s256");
  hash.update(canonical, "utf8");
  return hash.digest("hex");
}

interface ObjectDatabase {
  [objectId: string]: any;
}

export class Database {
  private db: ObjectDatabase = {};

  constructor() {
    if (isMainThread) {
      logger.info(`✅ [Database] Initializing database from file: ${DB_FILE}`);
      this.load();
    }
  }

  private load(): void {
    if (!isMainThread) return;
    if (fs.existsSync(DB_FILE)) {
      try {
        const data = fs.readFileSync(DB_FILE, "utf8").trim();
        this.db = data === "" ? {} : JSON.parse(data);
        logger.info(
          `✅ [Database] Database loaded successfully. Found ${
            Object.keys(this.db).length
          } object(s).`
        );
      } catch (error) {
        logger.error(
          `❌ [Database] Error loading database: ${
            error instanceof Error ? error.message : error
          }`
        );
        this.db = {};
      }
    } else {
      logger.warn(
        `⚠️ [Database] File ${DB_FILE} does not exist. Starting with an empty database.`
      );
      this.db = {};
    }
  }

  private save(): void {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`✅ [Database] Created directory for database at: ${dir}`);
    }
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), "utf8");
      logger.info(
        `✅ [Database] Database saved successfully. Total objects: ${
          Object.keys(this.db).length
        }`
      );
    } catch (error) {
      logger.error(
        `❌ [Database] Error saving database: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  public getObject(objectId: string): any | null {
    const obj = this.db[objectId] || null;
    if (obj) {
      logger.debug(`🐞 [Database] Retrieved object with ID ${objectId} (OK).`);
    } else {
      logger.warn(`⚠️ [Database] No object found with ID ${objectId}.`);
    }
    return obj;
  }

  public addObject(obj: any): string {
    const objectId = computeObjectId(obj);
    if (!this.db.hasOwnProperty(objectId)) {
      this.db[objectId] = obj;
      logger.info(`✅ [Database] Added new object with ID ${objectId}.`);
      this.save();
    } else {
      logger.debug(
        `🐞 [Database] Object with ID ${objectId} already exists (OK).`
      );
    }
    return objectId;
  }

  public deleteObject(obj: any): boolean {
    const objectId = computeObjectId(obj);
    if (this.db.hasOwnProperty(objectId)) {
      delete this.db[objectId];
      logger.info(`🗑️ [Database] Deleted object with ID ${objectId}.`);
      this.save();
      return true;
    } else {
      logger.warn(
        `⚠️ [Database] Cannot delete non-existent object ID ${objectId}.`
      );
      return false;
    }
  }

  public getAllObjects(): ObjectDatabase {
    logger.debug(
      `🐞 [Database] Retrieving all objects. Total count: ${
        Object.keys(this.db).length
      }`
    );
    return this.db;
  }

  public setChainTip(blockid: string) {
    chainTipId = blockid;
  }

  public getChainTip(): string | null {
    return chainTipId;
  }
}

export const globalDatabase = new Database();
