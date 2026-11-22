"use client";

/** Fotoauswahl (Kamera oder Galerie). Verkleinert Bilder vor dem Upload auf max. 1600 px – spart mobile Daten. */
export function ImagePicker() {
  return (
    <input
      type="file"
      name="images"
      accept="image/*"
      multiple
      onChange={async (e) => {
        const input = e.currentTarget;
        const dt = new DataTransfer();
        for (const f of Array.from(input.files ?? []).slice(0, 5)) dt.items.add(await shrink(f));
        input.files = dt.files;
      }}
    />
  );
}

async function shrink(file: File, max = 1600): Promise<File> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // unbekanntes Format: Server entscheidet
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
