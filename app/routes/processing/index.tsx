import { redirect } from "react-router"

import { DEFAULT_CONVERT_RECIPE_PATH } from "@/features/product/processing-navigation"

export function clientLoader() {
  return redirect(DEFAULT_CONVERT_RECIPE_PATH)
}
