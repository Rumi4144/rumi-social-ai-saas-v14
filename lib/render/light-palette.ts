const valid = (value: string | undefined, fallback: string) => /^#[a-f0-9]{6}$/i.test(value || '') ? value! : fallback;
export function mixColor(a: string, b: string, amount: number) {
  const rgb = (color: string) => color.slice(1).match(/../g)!.map(value => parseInt(value, 16));
  const first = rgb(a), second = rgb(b);
  return '#' + first.map((value, index) => Math.round(value * (1 - amount) + second[index] * amount).toString(16).padStart(2, '0')).join('');
}
export function lightBrandPalette(primary?: string, accent?: string, secondary?: string) {
  const brand = valid(primary, '#172846'), highlight = valid(accent, '#bd408d');
  return {
    brand,
    accent: highlight,
    ink: mixColor(brand, '#111827', .65),
    accentInk: mixColor(highlight, '#111827', .65),
    paper: mixColor(valid(secondary, '#ffffff'), '#ffffff', .96),
    tint: mixColor(brand, '#ffffff', .94),
  };
}
