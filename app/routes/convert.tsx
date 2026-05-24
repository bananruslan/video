import { redirect } from "react-router"

import type { Route } from "./+types/convert"
import { ConverterPage } from "@/features/convert/components/converter-page"
import { getRecipe } from "@/domain/conversion/registry"
import { DEFAULT_CONVERT_RECIPE_PATH } from "@/features/product/processing-navigation"

import "@/domain/conversion/recipes"

export function meta({ params }: Route.MetaArgs) {
  const recipe = getRecipe(params.recipeId)
  return [
    { title: recipe ? `${recipe.label} — Video Converter` : "Video Converter" },
  ]
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const recipe = getRecipe(params.recipeId)
  if (!recipe) {
    throw redirect(DEFAULT_CONVERT_RECIPE_PATH)
  }
  return { recipeId: params.recipeId }
}

export default function ConvertRoute() {
  return <ConverterPage />
}
