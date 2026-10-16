type Product = { id: string; name: string; imageUrl?: string | null; sourceUrl?: string | null };
export function photoProducts<T extends Product>(products: T[]): T[] {
  const seen = new Set<string>();
  return products.filter(product => {
    if (product.id.startsWith("post-") || !product.imageUrl || !product.name.trim()) return false;
    const key = product.sourceUrl || product.id;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
