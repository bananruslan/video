import type { AnyConversionRecipe } from "@/domain/conversion/types";

/**
 * Реестр Recipe — точка расширения для новых форматов.
 *
 * Новый маршрут:
 * 1. `src/domain/conversion/recipes/<name>.ts` — buildArgs + optionFields
 * 2. Регистрация в `recipes/index.ts`
 * 3. При новом типе контрола — OptionField в types.ts и OptionsForm
 */

const recipes = new Map<string, AnyConversionRecipe>();

export function registerRecipe(recipe: AnyConversionRecipe): void {
  recipes.set(recipe.id, recipe);
}

export function getRecipe(id: string): AnyConversionRecipe | undefined {
  return recipes.get(id);
}

export function listRecipes(): AnyConversionRecipe[] {
  return Array.from(recipes.values());
}
