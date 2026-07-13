import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';

export interface StoredObject {
  storageKey: string;
  size: number;
}

/**
 * StorageService — abstraction over object storage so S3 can drop in later.
 * The dev implementation writes to local disk under UPLOAD_DIR.
 */
export interface StorageService {
  put(buffer: Buffer, originalName: string): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

class LocalDiskStorage implements StorageService {
  private root: string;
  constructor(root: string) {
    this.root = root;
  }
  private resolve(key: string): string {
    // Prevent path traversal — keys are opaque uuids we generated.
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    return path.join(this.root, safe);
  }
  async put(buffer: Buffer, originalName: string): Promise<StoredObject> {
    await mkdir(this.root, { recursive: true });
    const ext = path.extname(originalName).slice(0, 10);
    const storageKey = `${randomUUID()}${ext}`;
    await writeFile(this.resolve(storageKey), buffer);
    return { storageKey, size: buffer.length };
  }
  get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }
  async remove(storageKey: string): Promise<void> {
    await unlink(this.resolve(storageKey)).catch(() => undefined);
  }
}

let instance: StorageService | null = null;
export function getStorage(): StorageService {
  if (!instance) {
    const cfg = getConfig();
    const root = path.isAbsolute(cfg.UPLOAD_DIR)
      ? cfg.UPLOAD_DIR
      : path.resolve(process.cwd(), cfg.UPLOAD_DIR);
    instance = new LocalDiskStorage(root);
  }
  return instance;
}

export const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
