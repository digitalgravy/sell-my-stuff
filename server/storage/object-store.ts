export interface StoredObject {
  key: string;
  byteSize: number;
}

export interface ObjectStore {
  put(key: string, body: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
