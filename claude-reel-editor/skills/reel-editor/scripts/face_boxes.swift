// Apple Vision face boxes for the Embrulhos fit check (server/embrulhar.ts). macOS only.
// Usage: face_boxes <frame.jpg> ...   Prints one JSON line per frame: {"path", "face": [x, y, w, h] | null}: the largest face,
// as fractions of the frame with the origin at the top left.
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNDetectFaceRectanglesRequest()
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    let big = (req.results ?? []).max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }
    var face: Any = NSNull()
    if let b = big?.boundingBox { face = [b.minX, 1 - b.maxY, b.width, b.height] }   // Vision's origin is bottom-left
    let data = try! JSONSerialization.data(withJSONObject: ["path": path, "face": face])
    print(String(data: data, encoding: .utf8)!)
}
