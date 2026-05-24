export type SettingsMode = "simple" | "expert";

export type OptionField =
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
    }
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
    }
  | {
      kind: "switch";
      key: string;
      label: string;
    };

export interface RecipeSimpleSettings<
  TSimple extends Record<string, unknown>,
  TExpert extends Record<string, unknown>,
> {
  defaultSimple: TSimple;
  optionFields: OptionField[];
  /** Значения Simple UI → полные Conversion parameters */
  toExpert: (simple: TSimple) => TExpert;
  /** Conversion parameters → ближайшие значения Simple для отображения */
  fromExpert: (expert: TExpert) => TSimple;
}

export interface ConversionRecipe<TOptions extends Record<string, unknown>> {
  id: string;
  label: string;
  description?: string;
  accept: string[];
  inputFileName: string;
  outputFileName: string;
  outputExtension: string;
  outputMime: string;
  defaultOptions: TOptions;
  optionFields: OptionField[];
  simpleSettings?: RecipeSimpleSettings<Record<string, unknown>, TOptions>;
  validate?(file: File, options: TOptions): string | null;
  buildArgs(inputName: string, outputName: string, options: TOptions): string[];
}

export function recipeHasSimpleSettings(
  recipe: ConversionRecipe<Record<string, unknown>>,
): boolean {
  return Boolean(recipe.simpleSettings);
}

export type AnyConversionRecipe = ConversionRecipe<Record<string, unknown>>;

export interface ConversionProgress {
  ratio: number;
  time: number;
  duration?: number;
}

export type LoadVariant = "mt" | "st";
