export interface CapturedPhoto {
  id: string;
  objectKey: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  position: number;
}

export interface ItemCapture {
  itemId: string;
  jobId: string;
  revision: number;
  photos: CapturedPhoto[];
}

export interface ItemRepository {
  createCapture(capture: ItemCapture): Promise<void>;
}
