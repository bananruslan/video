import { registerRecipe } from "@/domain/conversion/registry";
import type { AnyConversionRecipe } from "@/domain/conversion/types";
import { mp4ToWebmRecipe } from "@/domain/conversion/recipes/mp4-to-webm";

registerRecipe(mp4ToWebmRecipe as unknown as AnyConversionRecipe);

export { mp4ToWebmRecipe };
