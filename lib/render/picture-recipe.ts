import type { Prisma } from "@prisma/client";
import type { SocialSvgInput } from "./svg";

/** Retain layout/text/brand settings without duplicating fonts or the main photo. */
export function pictureRecipe(input: SocialSvgInput) {
  const { imageUrl: _photo, designFonts: _fonts, ...recipe } = input;
  return JSON.parse(JSON.stringify(recipe)) as Prisma.InputJsonObject;
}
