# RVM matting: source.mp4 -> webm VP9 with alpha. Usage: rvm.py model.onnx in.mp4 out.webm [downsample] [max_frames]
import subprocess, sys, time
import numpy as np, onnxruntime as ort

model, src, out = sys.argv[1:4]
ds = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4  # 0.4: upper-body close-up at 1080p
maxf = int(sys.argv[5]) if len(sys.argv) > 5 else 0
W, H = 1920, 1080

sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
dsr = np.array([ds], np.float32)

# fit (never stretch) into the 1920x1080 stage: a vertical source becomes a centred strip, the sides stay transparent
sw, sh = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], text=True).split(',')[:2])
fw = min(W, round(sw * H / sh / 2) * 2); x0 = (W - fw) // 2
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'fps=30,scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '6M', '-auto-alt-ref', '0', '-g', '30', out], stdin=subprocess.PIPE)
n, t0 = 0, time.time()
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    x = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)[None]
    fgr, pha, *rec = sess.run(None, {'src': x, 'r1i': rec[0], 'r2i': rec[1], 'r3i': rec[2], 'r4i': rec[3], 'downsample_ratio': dsr})
    a = (pha[0, 0] * 255).clip(0, 255).astype(np.uint8)
    a[:, :x0] = 0; a[:, x0 + fw:] = 0
    enc.stdin.write(np.dstack([rgb, a]).tobytes())  # original color, RVM alpha
    n += 1
    if n % 150 == 0:
        print(f'{n} frames, {n / (time.time() - t0):.1f} fps', flush=True)
    if maxf and n >= maxf:
        break
dec.kill(); enc.stdin.close(); enc.wait()
assert n > 0, 'no frames decoded'
print('done', n, 'frames')
