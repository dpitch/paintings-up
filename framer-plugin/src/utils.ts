// utils.ts — Canvas to bytes helper

export async function bytesFromCanvas(
  canvas: HTMLCanvasElement,
  mimeType = "image/png",
  quality = 0.92,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mimeType,
      quality,
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}
