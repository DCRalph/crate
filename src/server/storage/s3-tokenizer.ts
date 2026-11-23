import { AbstractTokenizer, EndOfStreamError, type IRandomAccessFileInfo, type IRandomAccessTokenizer, type IReadChunkOptions } from "strtok3";

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const MAX_CACHED_CHUNKS = 64;

export type RangeReader = (start: number, end: number) => Promise<Uint8Array>;

/**
 * Random-access tokenizer backed by byte-range fetches (used for S3 objects).
 * Reads fixed-size chunks on demand and caches them, so parsing tags or
 * embedded art from a 50 MB FLAC or M4A takes only 1-2 tiny HTTP range requests.
 */
export class RangeTokenizer extends AbstractTokenizer implements IRandomAccessTokenizer {
  readonly fileInfo: IRandomAccessFileInfo;
  private readonly chunks = new Map<number, Uint8Array>();
  private readonly chunkSize: number;

  constructor(
    private readonly readRange: RangeReader,
    fileInfo: IRandomAccessFileInfo,
    chunkSize = DEFAULT_CHUNK_SIZE,
  ) {
    super({ fileInfo });
    this.fileInfo = fileInfo;
    this.chunkSize = chunkSize;
  }

  supportsRandomAccess(): boolean {
    return true;
  }

  setPosition(position: number): void {
    this.validateLength(position, "position");
    this.position = position;
  }

  async readBuffer(uint8Array: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const norm = this.normalizeOptions(uint8Array, options);
    this.position = norm.position;
    return this.readAt(uint8Array, norm.position, norm.length, Boolean(norm.mayBeLess), true);
  }

  async peekBuffer(uint8Array: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const norm = this.normalizeOptions(uint8Array, options);
    return this.readAt(uint8Array, norm.position, norm.length, Boolean(norm.mayBeLess), false);
  }

  private async readAt(target: Uint8Array, position: number, length: number, mayBeLess: boolean, advance: boolean): Promise<number> {
    if (length === 0) return 0;
    const available = Math.max(0, this.fileInfo.size - position);
    if (available === 0) {
      if (mayBeLess) return 0;
      throw new EndOfStreamError();
    }
    const want = Math.min(length, available);
    let copied = 0;

    while (copied < want) {
      const offset = position + copied;
      const chunkIndex = Math.floor(offset / this.chunkSize);
      const chunk = await this.getChunk(chunkIndex);
      const inChunk = offset - chunkIndex * this.chunkSize;
      if (inChunk >= chunk.length) break;
      const take = Math.min(want - copied, chunk.length - inChunk);
      target.set(chunk.subarray(inChunk, inChunk + take), copied);
      copied += take;
      if (advance) this.position += take;
    }

    if (!mayBeLess && copied < length) {
      throw new EndOfStreamError();
    }
    return copied;
  }

  private async getChunk(index: number): Promise<Uint8Array> {
    const cached = this.chunks.get(index);
    if (cached) {
      // Refresh LRU order.
      this.chunks.delete(index);
      this.chunks.set(index, cached);
      return cached;
    }

    const start = index * this.chunkSize;
    const end = Math.min(this.fileInfo.size - 1, start + this.chunkSize - 1);
    const data = await this.readRange(start, end);

    if (this.chunks.size >= MAX_CACHED_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    this.chunks.set(index, data);
    return data;
  }
}
