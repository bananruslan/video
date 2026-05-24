import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  index("routes/root-index.tsx"),

  ...prefix("processing", [
    layout("routes/processing/layout.tsx", [
      index("routes/processing/index.tsx"),
      route("convert/:recipeId", "routes/convert.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
