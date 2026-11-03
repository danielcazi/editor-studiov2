// Recorte de pessoa com Apple Vision (VNGeneratePersonSegmentationRequest, qualidade accurate).
// Uso: vision_cutout <pasta-jpg> <pasta-saida> <primeiro> <último>   (índices dos arquivos 00001.jpg…)
// Saída: <pasta-saida>/NNNNN.png em RGBA (pessoa com alfa), mesmo tamanho do quadro.
// A máscara é suavizada de leve (blur 1.2 px) para a borda não ficar serrilhada.
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count == 5, let first = Int(a[3]), let last = Int(a[4]) else {
  FileHandle.standardError.write("uso: vision_cutout <pasta-jpg> <pasta-saida> <primeiro> <último>\n".data(using: .utf8)!); exit(1)
}
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2])
try? FileManager.default.createDirectory(at: dst, withIntermediateDirectories: true)
let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8

for i in first...last {
  let name = String(format: "%05d", i)
  let url = src.appendingPathComponent(name + ".jpg")
  guard let img = CIImage(contentsOf: url) else { print("falta", name); continue }
  let handler = VNImageRequestHandler(ciImage: img, options: [:])
  try handler.perform([request])
  guard let buf = request.results?.first?.pixelBuffer else { print("sem máscara", name); continue }
  var mask = CIImage(cvPixelBuffer: buf)
  mask = mask.transformed(by: CGAffineTransform(scaleX: img.extent.width / mask.extent.width, y: img.extent.height / mask.extent.height))
  let blur = CIFilter.gaussianBlur(); blur.inputImage = mask.clampedToExtent(); blur.radius = 1.2
  mask = blur.outputImage!.cropped(to: img.extent)
  let blend = CIFilter.blendWithMask()
  blend.inputImage = img; blend.backgroundImage = CIImage.empty().cropped(to: img.extent); blend.maskImage = mask
  let out = dst.appendingPathComponent(name + ".png")
  try ctx.writePNGRepresentation(of: blend.outputImage!.cropped(to: img.extent), to: out, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
  if i % 25 == 0 { print("ok", name) }
}
print("fim", first, last)
