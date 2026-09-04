import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ObjectStore, StoredObject } from './object-store';

export class FileObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  async put(key: string, body: Uint8Array): Promise<StoredObject> {
    const destination = this.resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
    await writeFile(destination, body, { flag: 'wx', mode: 0o640 });
    return { key, byteSize: body.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolveKey(key)));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key)) {
      throw new Error('Invalid object key');
    }
    const destination = path.resolve(this.root, key);
    const rootPrefix = `${path.resolve(this.root)}${path.sep}`;
    if (!destination.startsWith(rootPrefix)) {
      throw new Error('Object key escapes storage root');
    }
    return destination;
  }
}

export function getFileObjectStore(): FileObjectStore {
  const root =
    process.env.SELL_STORAGE_PATH ??
    path.join(process.cwd(), 'data', 'uploads');
  return new FileObjectStore(root);
}
