// Browser only: shrink a photo before upload (longest side 1568px, Claude's sweet spot for images) so it's quick.
// Used by the photo appraiser and by search by picture.
export async function shrinkImage(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], "cards.jpg", { type: "image/jpeg" }) : file;
}
