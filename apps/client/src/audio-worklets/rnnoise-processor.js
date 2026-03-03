const RNNOISE_WORKLET_NAME = 'sharkord-rnnoise';
const FRAME_SIZE = 480; // RNNoise processes 480 samples (10ms at 48kHz)
const BYTES_PER_FLOAT = 4;
// ring buffer size: must hold enough to cover latency (2 rnnoise frames)
const RING_SIZE = FRAME_SIZE * 4;

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.enabled = true;
    this.ready = false;

    // input accumulator for building rnnoise frames
    this.inputBuffer = new Float32Array(FRAME_SIZE);
    this.inputBufferOffset = 0;

    // circular output buffer to decouple input/output timing
    this.ringBuffer = new Float32Array(RING_SIZE);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;

    // wasm state
    this.exports = null;
    this.heapF32 = null;
    this.denoiseState = 0;
    this.pcmInputPtr = 0;

    this.port.onmessage = (event) => {
      const data = event.data;

      if (!data || typeof data !== 'object') return;

      if (data.type === 'config') {
        if (typeof data.enabled === 'boolean') {
          this.enabled = data.enabled;
        }
      }

      if (data.type === 'wasm-binary') {
        this._initWasm(data.binary);
      }
    };
  }

  async _initWasm(binary) {
    try {
      // @jitsi/rnnoise-wasm v0.2.1 uses minified emscripten output:
      //   imports: module "a" with functions "a" (resize_heap) and "b" (memcpy)
      //   exports: c=memory, d=__wasm_call_ctors, e=init, f=create, g=malloc,
      //            h=destroy, i=free, j=process_frame
      let instance = null;

      const importObject = {
        a: {
          a: (requestedSize) => {
            // emscripten_resize_heap
            try {
              const memory = instance.exports.c;
              const needed = (requestedSize - memory.buffer.byteLength + 65535) >>> 16;
              memory.grow(needed);
              return 1;
            } catch (e) {
              return 0;
            }
          },
          b: (dest, src, num) => {
            // emscripten_memcpy_big
            const heap = new Uint8Array(instance.exports.c.buffer);
            heap.copyWithin(dest, src, src + num);
          }
        }
      };

      const result = await WebAssembly.instantiate(binary, importObject);
      instance = result.instance;
      this.exports = instance.exports;

      // call __wasm_call_ctors to initialize the emscripten runtime
      this.exports.d();

      const memory = this.exports.c;  // exported memory
      const malloc = this.exports.g;  // _malloc
      const rnnoiseCreate = this.exports.f;  // _rnnoise_create

      if (!memory || !malloc || !rnnoiseCreate) {
        throw new Error('RNNoise WASM missing required exports');
      }

      // allocate buffer for one frame of float samples
      this.pcmInputPtr = malloc(FRAME_SIZE * BYTES_PER_FLOAT);

      if (!this.pcmInputPtr) {
        throw new Error('Failed to allocate WASM memory');
      }

      // create denoiser state (pass 0 = use default model)
      this.denoiseState = rnnoiseCreate(0);

      if (!this.denoiseState) {
        throw new Error('Failed to create RNNoise state');
      }

      this.heapF32 = () => new Float32Array(this.exports.c.buffer);

      this.ready = true;

      this.port.postMessage({
        type: 'ready',
        success: true
      });
    } catch (error) {
      this.ready = false;

      this.port.postMessage({
        type: 'ready',
        success: false,
        error: String(error)
      });
    }
  }

  _processFrame() {
    if (!this.ready || !this.exports || !this.heapF32) return;

    const processFrame = this.exports.j; // _rnnoise_process_frame

    if (!processFrame) return;

    const heap = this.heapF32();
    const offset = this.pcmInputPtr >> 2;

    // rnnoise expects values in short range (-32768..32767)
    for (let i = 0; i < FRAME_SIZE; i++) {
      heap[offset + i] = this.inputBuffer[i] * 32768.0;
    }

    // process in-place: rnnoise_process_frame(state, out, in)
    // when out==in it processes in place
    processFrame(this.denoiseState, this.pcmInputPtr, this.pcmInputPtr);

    // read back, scale to float, and write into the output ring buffer
    const heapAfter = this.heapF32();

    for (let i = 0; i < FRAME_SIZE; i++) {
      this.ringBuffer[this.ringWritePos] = heapAfter[offset + i] / 32768.0;
      this.ringWritePos = (this.ringWritePos + 1) % RING_SIZE;
    }

    this.ringAvailable += FRAME_SIZE;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const frameCount = output[0]?.length ?? 0;

    if (!input || input.length === 0 || frameCount === 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    if (!this.enabled || !this.ready) {
      // pass-through
      const channelCount = Math.min(input.length, output.length);

      for (let ch = 0; ch < channelCount; ch++) {
        output[ch].set(input[ch]);
      }

      for (let ch = channelCount; ch < output.length; ch++) {
        output[ch].fill(0);
      }

      return true;
    }

    // rnnoise is mono — downmix input channels to mono
    const monoInput = new Float32Array(frameCount);

    if (input.length === 1) {
      monoInput.set(input[0]);
    } else {
      for (let i = 0; i < frameCount; i++) {
        let sum = 0;

        for (let ch = 0; ch < input.length; ch++) {
          sum += input[ch][i];
        }

        monoInput[i] = sum / input.length;
      }
    }

    // feed samples into the input accumulator, process when full
    for (let i = 0; i < frameCount; i++) {
      this.inputBuffer[this.inputBufferOffset++] = monoInput[i];

      if (this.inputBufferOffset >= FRAME_SIZE) {
        this._processFrame();
        this.inputBufferOffset = 0;
      }
    }

    // read processed samples from the output ring buffer
    for (let i = 0; i < frameCount; i++) {
      let sample = 0;

      if (this.ringAvailable > 0) {
        sample = this.ringBuffer[this.ringReadPos];
        this.ringReadPos = (this.ringReadPos + 1) % RING_SIZE;
        this.ringAvailable--;
      }

      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = sample;
      }
    }

    return true;
  }
}

registerProcessor(RNNOISE_WORKLET_NAME, RNNoiseProcessor);
