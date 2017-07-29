const CHUNK_SLOTS = 64 * 64;
const SLOT_FIELDS = 1 + 3;
const CHUNK_SLOT_SIZE = SLOT_FIELDS * 4;
const CHUNK_HEADER_SIZE = 2 * 4;
const CHUNK_BUFFER_SIZE = CHUNK_SLOTS * CHUNK_SLOT_SIZE;
const CHUNK_SIZE = CHUNK_HEADER_SIZE + CHUNK_BUFFER_SIZE;

class Chunk {
  constructor(x = 0, z = 0, buffer = new Uint32Array(CHUNK_BUFFER_SIZE / 4)) {
    this.x = x;
    this.z = z;
    this.uint32Buffer = buffer;
    this.float32Buffer = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length);

    this.dirty = false;
  }

  getBuffer() {
    return this.uint32Buffer;
  }

  forEachObject(fn) {
    const localPosition = Array(3);

    for (let i = 0; i < CHUNK_SLOTS; i++) {
      const baseIndex = i * SLOT_FIELDS;
      const n = this.uint32Buffer[baseIndex];

      if (n !== 0) {
        localPosition[0] = this.float32Buffer[baseIndex + 1];
        localPosition[1] = this.float32Buffer[baseIndex + 2];
        localPosition[2] = this.float32Buffer[baseIndex + 3];
        fn(n, localPosition, i);
      }
    }
  }

  addObject(n, position) {
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
      this.float32Buffer[baseIndex + 1] = position[0];
      this.float32Buffer[baseIndex + 2] = position[1];
      this.float32Buffer[baseIndex + 3] = position[2];

      this.dirty = true;
    }

    return freeIndex;
  }

  removeObject(index) {
    const baseIndex = index * SLOT_FIELDS;
    this.uint32Buffer[baseIndex + 0] = 0;
    this.float32Buffer[baseIndex + 1] = 0;
    this.float32Buffer[baseIndex + 2] = 0;
    this.float32Buffer[baseIndex + 3] = 0;

    this.dirty = true;
  }
}

class Zeode {
  constructor() {
    this.chunks = [];
  }

  load(buffer) {
    const numChunks = buffer.length / CHUNK_SIZE;
    for (let i = 0; i < numChunks; i ++) {
      const chunkHeader = new Uint32Array(buffer.buffer, buffer.byteOffset + i*CHUNK_SIZE, 2);
      const x = chunkHeader[0];
      const z = chunkHeader[1];
      const chunkBuffer = new Uint32Array(buffer.buffer, buffer.byteOffset + i*CHUNK_SIZE + 2*4, CHUNK_BUFFER_SIZE/4);
      const chunk = new Chunk(x, z, chunkBuffer, i);
      this.chunks.push(chunk);
    }
  }

  save(fn) {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];

      if (chunk.dirty) {
        fn(i*CHUNK_SIZE, Int32Array.from([chunk.x, chunk.z]));
        fn(i*CHUNK_SIZE + 2*4, chunk.uint32Buffer);

        chunk.dirty = false;
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
