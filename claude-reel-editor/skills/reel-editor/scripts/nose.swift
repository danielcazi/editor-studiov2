// Nose track of the largest face, for the crop of each format (build_reel.py keeps the nose on the frame centre).
// macOS only (Vision); no face in a sample = no entry. Prints {"w","h","track":[[t, x, y]]}, x/y in 0-1 from top-left.
// Usage: swift nose.swift <video> [step-seconds]
import AVFoundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let step = CommandLine.arguments.count > 2 ? Double(CommandLine.arguments[2])! : 0.5
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 640, height: 640)
gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 30)
gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
let size = asset.tracks(withMediaType: .video).first!.naturalSize
let dur = CMTimeGetSeconds(asset.duration)

var track: [[Double]] = []
var t = 0.0
while t < dur {
    if let img = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
        let req = VNDetectFaceLandmarksRequest()
        try? VNImageRequestHandler(cgImage: img).perform([req])
        let faces = (req.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
        if let f = faces.first, let nose = f.landmarks?.nose, nose.pointCount > 0 {
            let pts = nose.normalizedPoints   // 0-1 inside the face box, origin bottom-left
            let nx = pts.map { Double($0.x) }.reduce(0, +) / Double(pts.count)
            let ny = pts.map { Double($0.y) }.reduce(0, +) / Double(pts.count)
            let b = f.boundingBox
            track.append([(t * 1000).rounded() / 1000, Double(b.minX) + nx * Double(b.width), 1 - (Double(b.minY) + ny * Double(b.height))])
        }
    }
    t += step
}
let out: [String: Any] = ["w": Double(abs(size.width)), "h": Double(abs(size.height)), "track": track]
print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
