export interface StoredObject {
  key: string;
  byteSize: number;
}

export interface ObjectStore {
  put(key: string, body: Uint8Array): Promise<StoredObject>;
  remove(key: string): Promise<void>;
}
