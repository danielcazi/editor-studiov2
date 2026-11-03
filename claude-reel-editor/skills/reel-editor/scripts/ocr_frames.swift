// Apple Vision text reader for caption_overlap.py.
// Usage: ocr_frames <frame.jpg> ...   Prints one JSON line per frame: {"path", "items": [{"t", "c", "cy"}]}, cy = box centre from the top (0..1).
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate   // .fast misses short words
    req.usesLanguageCorrection = false
    req.recognitionLanguages = ["pt-BR", "en-US"]
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    var items: [[String: Any]] = []
    for r in req.results ?? [] {
        guard let c = r.topCandidates(1).first else { continue }
        items.append(["t": c.string, "c": c.confidence, "cy": 1 - r.boundingBox.midY])   // Vision's origin is bottom-left
    }
    let data = try! JSONSerialization.data(withJSONObject: ["path": path, "items": items])
    print(String(data: data, encoding: .utf8)!)
}
