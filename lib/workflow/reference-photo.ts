// Resize upload bytes without generating or repainting the product/presenter.
export async function readReferencePhoto(file: File): Promise<string> {
  if (!file.size || file.size > 50_000_000 || !["image/png","image/jpeg","image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP photo up to 50 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the photo.");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", .88 - attempt * .05);
      if (data.length < 1_330_000) return data;
      scale *= .8;
    }
    throw new Error("This photo is still too large. Choose a smaller copy.");
  } finally { URL.revokeObjectURL(url); }
}
