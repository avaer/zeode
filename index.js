const CHUNK_SLOTS = 64 * 64;
const SLOT_FIELDS = 1 + 10;
const CHUNK_SLOT_SIZE = SLOT_FIELDS * 4;
const CHUNK_HEADER_SIZE = 2 * 4;
const CHUNK_BUFFER_SIZE = CHUNK_SLOTS * CHUNK_SLOT_SIZE;
const TRAILER_SLOTS = 32;
const CHUNK_TRAILER_SIZE = TRAILER_SLOTS * 4;
const CHUNK_SIZE = CHUNK_HEADER_SIZE + CHUNK_BUFFER_SIZE + CHUNK_TRAILER_SIZE;

class Chunk {
  constructor(x = 0, z = 0, buffer = new Uint32Array(CHUNK_BUFFER_SIZE / 4), trailer = new Uint32Array(CHUNK_TRAILER_SIZE / 4)) {
    this.x = x;
    this.z = z;
    this.uint32Buffer = buffer;
    this.float32Buffer = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length);
    this.trailerBuffer = trailer;

    this.dirty = false;
  }

  getBuffer() {
    return this.uint32Buffer;
  }

  forEachObject(fn) {
    const localMatrix = Array(10);

    for (let i = 0; i < CHUNK_SLOTS; i++) {
      const baseIndex = i * SLOT_FIELDS;
      const n = this.uint32Buffer[baseIndex];

      if (n !== 0) {
        for (let i = 0; i < 10; i++) {
          localMatrix[i] = this.float32Buffer[baseIndex + 1 + i];
        }
        fn(n, localMatrix, i);
      }
    }
  }

  addObject(n, matrix) {
    let freeIndex = -1;
    for (let i = 0; i < CHUNK_SLOTS; i++) {
      if (this.uint32Buffer[i * SLOT_FIELDS] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      const baseIndex = freeIndex * SLOT_FIELDS;
      this.uint32Buffer[baseIndex + 0] = n;
      for (let i = 0; i < 10; i++) {
        this.float32Buffer[baseIndex + 1 + i] = matrix[i];
      }

      this.dirty = true;
    }

    return freeIndex;
  }

  removeObject(index) {
    const baseIndex = index * SLOT_FIELDS;
    this.uint32Buffer[baseIndex + 0] = 0;
    for (let i = 0; i < 10; i++) {
      this.float32Buffer[baseIndex + 1 + i] = 0;
    }

    this.dirty = true;
  }

  addTrailer(n) {
    let freeIndex = -1;
    for (let i = 0; i < TRAILER_SLOTS; i++) {
      if (this.trailerBuffer[i] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      this.trailerBuffer[freeIndex] = n;

      this.dirty = true;
    }

    return freeIndex;
  }

  removeTrailer(index) {
    this.trailerBuffer[index] = 0;
  }

  hasTrailer(n) {
    return this.trailerBuffer.includes(n);
  }
}

class Zeode {
  constructor() {
    this.chunks = [];
  }

  load(buffer) {
    const numChunks = buffer.length / CHUNK_SIZE;
    let {byteOffset} = buffer;
    for (let i = 0; i < numChunks; i ++) {
      const chunkHeader = new Int32Array(buffer.buffer, byteOffset, 2);
      const x = chunkHeader[0];
      const z = chunkHeader[1];
      byteOffset += 2 * 4;
      const chunkBuffer = new Uint32Array(buffer.buffer, byteOffset, CHUNK_BUFFER_SIZE/4);
      byteOffset += CHUNK_BUFFER_SIZE;
      const chunkTrailer = new Uint32Array(buffer.buffer, byteOffset, CHUNK_TRAILER_SIZE/4);
      byteOffset += CHUNK_TRAILER_SIZE;

      const chunk = new Chunk(x, z, chunkBuffer, chunkTrailer);
      this.chunks.push(chunk);
    }
  }

  save(fn) {
    let byteOffset = 0;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];

      if (chunk.dirty) {
        fn(byteOffset, Int32Array.from([chunk.x, chunk.z]));
        byteOffset += CHUNK_HEADER_SIZE;
        fn(byteOffset, chunk.uint32Buffer);
        byteOffset += CHUNK_BUFFER_SIZE;
        fn(byteOffset, chunk.trailerBuffer);
        byteOffset += CHUNK_TRAILER_SIZE;

        chunk.dirty = false;
      } else {
        byteOffset += CHUNK_SIZE;
      }
    }
  }

  getChunk(x, z) {
    return this.chunks.find(chunk => chunk.x === x && chunk.z === z) || null;
  }

  addChunk(x, z, buffer) {
    const chunk = new Chunk(x, z, buffer);
    this.chunks.push(chunk);
    return chunk;
  }

  makeChunk(x, z) {
    const chunk = new Chunk(x, z);
    this.chunks.push(chunk);
    return chunk;
  }

  forEachObject(fn) {
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i].forEachObject(fn);
    }
  }
}

const zeode = () => new Zeode();
module.exports = zeode;
