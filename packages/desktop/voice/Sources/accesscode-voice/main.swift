import Foundation
@preconcurrency import MLX
import MLXAudioCore
import MLXAudioSTS
import MLXNN

// AccessCode voice helper.
//
// Talks newline-delimited JSON over stdin and stdout so no network port is opened.
// Requests:
//   {"id":"1","type":"load","model":"/path/to/model"}
//   {"id":"2","type":"transcribe","input":"/path/to/16k.wav"}
//   {"id":"3","type":"speak","text":"Hello","voice":"US female","output":"/path/to/out.wav"}
//   {"type":"cancel","id":"3"}
// Replies carry the request id with "ok": true or "ok": false and "error".
// The model runs one request at a time. Cancel skips a queued request and discards a running one's result.

struct Request: Decodable {
  let id: String
  let type: String
  let model: String?
  let input: String?
  let text: String?
  let voice: String?
  let output: String?
}

let output = FileHandle.standardOutput
let outputLock = NSLock()

func reply(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
  outputLock.lock()
  output.write(data)
  output.write(Data([0x0A]))
  outputLock.unlock()
}

final class Cancellation: @unchecked Sendable {
  private var ids = Set<String>()
  private let lock = NSLock()

  func cancel(_ id: String) {
    lock.lock()
    ids.insert(id)
    lock.unlock()
  }

  func isCancelled(_ id: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return ids.contains(id)
  }

  func clear(_ id: String) {
    lock.lock()
    ids.remove(id)
    lock.unlock()
  }
}

struct Cancelled: Error {}

enum VoiceError: Error, CustomStringConvertible {
  case notLoaded
  case missing(String)
  case unknown(String)

  var description: String {
    switch self {
    case .notLoaded: "The voice model is not loaded."
    case .missing(let field): "Missing \(field)."
    case .unknown(let type): "Unknown request type \(type)."
    }
  }
}

actor Engine {
  private var model: LFM2AudioModel?
  private var detokenizer: LFM2AudioDetokenizer?
  private let cancellation: Cancellation

  init(cancellation: Cancellation) {
    self.cancellation = cancellation
  }

  func handle(_ request: Request) async {
    defer { cancellation.clear(request.id) }
    do {
      if cancellation.isCancelled(request.id) { throw Cancelled() }
      switch request.type {
      case "load":
        try await load(request)
        reply(["id": request.id, "ok": true])
      case "transcribe":
        reply(["id": request.id, "ok": true, "text": try await transcribe(request)])
      case "speak":
        reply(["id": request.id, "ok": true, "seconds": try await speak(request)])
      default:
        throw VoiceError.unknown(request.type)
      }
    } catch is Cancelled {
      reply(["id": request.id, "ok": false, "cancelled": true])
    } catch {
      reply(["id": request.id, "ok": false, "error": "\(error)"])
    }
  }

  private func load(_ request: Request) async throws {
    if model != nil { return }
    guard let path = request.model else { throw VoiceError.missing("model") }
    let directory = URL(fileURLWithPath: path)
    let config = try JSONDecoder().decode(
      LFM2AudioConfig.self, from: Data(contentsOf: directory.appendingPathComponent("config.json")))
    let loaded = LFM2AudioModel(config)

    // Mirrors LFM2AudioModel.fromPretrained, which only accepts a Hugging Face repo id,
    // so AccessCode can keep the model in its own folder.
    let weights = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "safetensors" && !$0.lastPathComponent.contains("tokenizer") }
      .reduce(into: [String: MLXArray]()) { result, file in
        result.merge(try MLX.loadArrays(url: file)) { _, new in new }
      }
    let sanitized = LFM2AudioModel.sanitize(weights: weights)
    if let quantization = config.perLayerQuantization {
      quantize(model: loaded) { path, _ in
        if path.contains("norm") || path.contains("conv") { return nil }
        if sanitized["\(path).scales"] == nil { return nil }
        return quantization.quantization(layer: path)?.asTuple
      }
    }
    try loaded.update(parameters: ModuleParameters.unflattened(sanitized), verify: .noUnusedKeys)
    eval(loaded.parameters())
    loaded.modelDirectory = directory
    loaded.processor = try await LFM2AudioProcessor.fromPretrained(directory, config: config)
    detokenizer = try LFM2AudioDetokenizer.fromPretrained(modelPath: directory)
    model = loaded
  }

  private func transcribe(_ request: Request) async throws -> String {
    guard let model, let processor = model.processor else { throw VoiceError.notLoaded }
    guard let input = request.input else { throw VoiceError.missing("input") }
    let (sampleRate, audio) = try loadAudioArray(from: URL(fileURLWithPath: input))
    let chat = ChatState(processor: processor)
    chat.newTurn(role: "system")
    chat.addText("Perform ASR.")
    chat.endTurn()
    chat.newTurn(role: "user")
    chat.addAudio(audio, sampleRate: sampleRate)
    chat.endTurn()
    chat.newTurn(role: "assistant")

    var tokens: [Int] = []
    let stream = model.generateInterleaved(
      textTokens: chat.getTextTokens(),
      audioFeatures: chat.getAudioFeatures(),
      modalities: chat.getModalities(),
      config: LFMGenerationConfig(maxNewTokens: 512, temperature: 0, topK: 1)
    )
    try await drain(stream, id: request.id) { token, modality in
      if modality == .text { tokens.append(token.item(Int.self)) }
      return true
    }
    return processor.decodeText(tokens).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func speak(_ request: Request) async throws -> Double {
    guard let model, let processor = model.processor, let detokenizer else { throw VoiceError.notLoaded }
    guard let text = request.text, !text.isEmpty else { throw VoiceError.missing("text") }
    guard let output = request.output else { throw VoiceError.missing("output") }
    let chat = ChatState(processor: processor)
    chat.newTurn(role: "system")
    chat.addText("Perform TTS. Use the \(request.voice ?? "US female") voice.")
    chat.endTurn()
    chat.newTurn(role: "user")
    chat.addText(text)
    chat.endTurn()
    chat.newTurn(role: "assistant")
    chat.addAudioStartToken()

    var codes: [MLXArray] = []
    let stream = model.generateSequential(
      textTokens: chat.getTextTokens(),
      audioFeatures: chat.getAudioFeatures(),
      modalities: chat.getModalities(),
      config: LFMGenerationConfig(maxNewTokens: 1500, temperature: 0.8, topK: 50, audioTemperature: 0.8, audioTopK: 4)
    )
    try await drain(stream, id: request.id) { token, modality in
      guard modality == .audioOut else { return true }
      if token[0].item(Int.self) == lfmAudioEOSToken { return false }
      codes.append(token)
      return true
    }
    if cancellation.isCancelled(request.id) { throw Cancelled() }
    guard !codes.isEmpty else { throw VoiceError.missing("speech output") }
    let waveform = detokenizer(MLX.stacked(codes, axis: 0).transposed(1, 0).expandedDimensions(axis: 0))
    eval(waveform)
    let samples = waveform[0].asArray(Float.self)
    try AudioUtils.writeWavFile(samples: samples, sampleRate: 24000, fileURL: URL(fileURLWithPath: output))
    return Double(samples.count) / 24000
  }

  // The upstream model builds every frame before the stream yields, so cancellation is checked
  // before and after generation; AccessCode keeps requests to one sentence to bound that delay.
  private func drain(
    _ stream: AsyncThrowingStream<(MLXArray, LFMModality), Error>,
    id: String,
    _ body: (MLXArray, LFMModality) -> Bool
  ) async throws {
    for try await item in stream {
      if cancellation.isCancelled(id) { throw Cancelled() }
      if !body(item.0, item.1) { return }
    }
  }
}

let cancellation = Cancellation()
let engine = Engine(cancellation: cancellation)
let decoder = JSONDecoder()

let (requests, queue) = AsyncStream<Request>.makeStream()

reply(["type": "ready"])

// One consumer keeps requests strictly in order, even while a load awaits.
Task.detached {
  for await request in requests {
    await engine.handle(request)
  }
}

Task.detached {
  while let line = readLine(strippingNewline: true) {
    guard !line.isEmpty, let request = try? decoder.decode(Request.self, from: Data(line.utf8)) else { continue }
    if request.type == "cancel" {
      cancellation.cancel(request.id)
      continue
    }
    queue.yield(request)
  }
  // AccessCode closed the pipe, so the app has quit.
  exit(0)
}

dispatchMain()
