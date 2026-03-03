const RNNOISE_WORKLET_NAME = 'sharkord-rnnoise';
const FRAME_SIZE = 480; // RNNoise processes 480 samples (10ms at 48kHz)
const BYTES_PER_FLOAT = 4;

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.enabled = true;
    this.ready = false;

    // ring buffers for handling 128 <-> 480 sample mismatch
    this.inputBuffer = new Float32Array(FRAME_SIZE);
    this.outputBuffer = new Float32Array(FRAME_SIZE);
    this.inputBufferOffset = 0;
    this.outputBufferOffset = FRAME_SIZE; // start empty
    this.outputBufferRemaining = 0;

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
      // emscripten-compiled rnnoise needs env imports
      let memoryRef = null;

      const importObject = {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 256 }),
          emscripten_memcpy_js: (dest, src, num) => {
            const heap = new Uint8Array(memoryRef.buffer);
            heap.copyWithin(dest, src, src + num);
          },
          __assert_fail: () => {},
          abort: () => {},
          emscripten_resize_heap: () => 0
        },
        wasi_snapshot_preview1: {
          fd_close: () => 0,
          fd_seek: () => 0,
          fd_write: () => 0,
          proc_exit: () => {}
        }
      };

      const result = await WebAssembly.instantiate(binary, importObject);
      this.exports = result.instance.exports;

      // use wasm's own memory if it exports one, else use our provided one
      memoryRef = this.exports.memory || importObject.env.memory;

      const malloc = this.exports._malloc || this.exports.malloc;
      const rnnoiseCreate =
        this.exports._rnnoise_create || this.exports.rnnoise_create;

      if (!malloc || !rnnoiseCreate) {
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

      this.heapF32 = () =>
        new Float32Array(
          (this.exports.memory || importObject.env.memory).buffer
        );

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

    const processFrame =
      this.exports._rnnoise_process_frame ||
      this.exports.rnnoise_process_frame;

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

    // read back and scale to float range
    const heapAfter = this.heapF32();

    for (let i = 0; i < FRAME_SIZE; i++) {
      this.outputBuffer[i] = heapAfter[offset + i] / 32768.0;
    }
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

    // process samples through ring buffer
    for (let i = 0; i < frameCount; i++) {
      this.inputBuffer[this.inputBufferOffset] = monoInput[i];
      this.inputBufferOffset++;

      if (this.inputBufferOffset >= FRAME_SIZE) {
        this._processFrame();
        this.inputBufferOffset = 0;
        this.outputBufferOffset = 0;
        this.outputBufferRemaining = FRAME_SIZE;
      }
    }

    // output from the processed buffer
    for (let i = 0; i < frameCount; i++) {
      let sample = 0;

      if (this.outputBufferRemaining > 0) {
        sample = this.outputBuffer[this.outputBufferOffset];
        this.outputBufferOffset++;
        this.outputBufferRemaining--;
      }

      // write same denoised mono to all output channels
      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = sample;
      }
    }

    return true;
  }
}

registerProcessor(RNNOISE_WORKLET_NAME, RNNoiseProcessor);
