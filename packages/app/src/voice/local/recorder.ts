// Captures the microphone at 16 kHz mono and cuts it into utterances at pauses, the way Perspective Chat's
// voice mode does: speech starts above one energy level, continues above a lower one, and ends after a pause.

const rate = 16000

const frame = 1024

// Mean square energy thresholds from Perspective Chat's LiquidVoiceUtterance.
const startLevel = 0.000225

const continueLevel = 0.000064

const pauseMs = 800

const leadInFrames = 5

const maxMs = 30000

export type Recorder = {
  /** Called when speech starts, so voice mode can stop a reply the user talks over. */
  onSpeech(callback: () => void): void
  stop(): void
}

export async function startRecorder(onUtterance: (wav: ArrayBuffer) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Echo cancellation keeps the assistant's own speech from being heard as the user talking over it.
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  const context = new AudioContext({ sampleRate: rate })
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessorNode is deprecated but needs no separate worklet module, and 64 ms frames are plenty here.
  const processor = context.createScriptProcessor(frame, 1, 1)
  const listeners: Array<() => void> = []
  const state: { lead: Float32Array[]; speech: Float32Array[]; silentMs: number; speaking: boolean } = {
    lead: [],
    speech: [],
    silentMs: 0,
    speaking: false,
  }

  processor.onaudioprocess = (event) => {
    const samples = new Float32Array(event.inputBuffer.getChannelData(0))
    const level = samples.reduce((sum, value) => sum + value * value, 0) / samples.length
    const ms = (samples.length / rate) * 1000

    if (!state.speaking) {
      state.lead = [...state.lead.slice(-(leadInFrames - 1)), samples]

      if (level < startLevel) return
      state.speaking = true
      state.speech = [...state.lead]
      state.silentMs = 0
      listeners.forEach((listener) => listener())

      return
    }

    state.speech.push(samples)
    state.silentMs = level < continueLevel ? state.silentMs + ms : 0
    const spokenMs = (state.speech.length * frame * 1000) / rate

    if (state.silentMs < pauseMs && spokenMs < maxMs) return
    onUtterance(encodeWav(state.speech))
    state.speaking = false
    state.speech = []
    state.lead = []
  }

  source.connect(processor)
  // The processor only runs while connected to the output; it writes silence, so nothing is heard.
  processor.connect(context.destination)

  return {
    onSpeech: (callback) => listeners.push(callback),
    stop: () => {
      if (state.speaking && state.speech.length > 0) onUtterance(encodeWav(state.speech))
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}

function encodeWav(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)

  const text = (offset: number, value: string) =>
    value.split("").forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))

  text(0, "RIFF")
  view.setUint32(4, 36 + length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, length * 2, true)
  chunks
    .flatMap((chunk) => Array.from(chunk))
    .forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))

  return buffer
}
