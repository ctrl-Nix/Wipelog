import { promises as fs } from "fs";
import path from "path";
import type { Db } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const EVIDENCE_DIR = path.join(DATA_DIR, "evidence");

// Serialise all read-modify-write cycles so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
}

async function load(): Promise<Db> {
    try {
        return JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Db;
    } catch {
        return { assets: [], runs: [], certificates: [] };
    }
}

async function save(db: Db) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DB_FILE);
}

export const readDb = () => locked(load);

export function mutateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    return locked(async () => {
        const db = await load();
        const result = await fn(db);
        await save(db);
        return result;
    });
}

export async function writeEvidenceFile(runId: string, bytes: Buffer): Promise<string> {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    const rel = path.join("evidence", `${runId}.json`);
    await fs.writeFile(path.join(DATA_DIR, rel), bytes, { flag: "wx" }); // wx = never overwrite
    return rel;
}

export async function readEvidenceFile(rel: string): Promise<Buffer | null> {
    try {
        return await fs.readFile(path.join(DATA_DIR, rel));
    } catch {
        return null;
    }
}