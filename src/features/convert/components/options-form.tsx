import type { ReactNode } from "react";

import type { AnyConversionRecipe, OptionField, SettingsMode } from "@/domain/conversion/types";
import { recipeHasSimpleSettings } from "@/domain/conversion/types";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";

interface OptionsFormProps {
  recipe: AnyConversionRecipe;
  options: Record<string, unknown>;
  settingsMode: SettingsMode;
  onSettingsModeChange: (mode: SettingsMode) => void;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}

function FieldGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function OptionControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: OptionField;
  value: unknown;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  const id = `option-${field.key}`;

  if (field.kind === "select") {
    return (
      <FieldGroup id={id} label={field.label}>
        <Select
          value={String(value ?? "")}
          onValueChange={(next) => onChange(field.key, next)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldGroup>
    );
  }

  if (field.kind === "slider") {
    const num = Number(value ?? field.min);
    return (
      <FieldGroup id={id} label={`${field.label}: ${num}`}>
        <Slider
          id={id}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={[num]}
          disabled={disabled}
          onValueChange={([next]) => onChange(field.key, next)}
        />
      </FieldGroup>
    );
  }

  if (field.kind === "number") {
    return (
      <FieldGroup id={id} label={field.label}>
        <Input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => {
            const parsed = e.target.value === "" ? 0 : Number(e.target.value);
            onChange(field.key, Number.isNaN(parsed) ? 0 : parsed);
          }}
        />
      </FieldGroup>
    );
  }

  if (field.kind === "switch") {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{field.label}</Label>
        <Switch
          id={id}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
      </div>
    );
  }

  return null;
}

function ExpertOptions({
  recipe,
  options,
  disabled,
  onChange,
}: {
  recipe: AnyConversionRecipe;
  options: Record<string, unknown>;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid gap-5">
      {recipe.optionFields.map((field) => (
        <OptionControl
          key={field.key}
          field={field}
          value={options[field.key]}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function SimpleOptions({
  recipe,
  options,
  disabled,
  onChange,
}: {
  recipe: AnyConversionRecipe;
  options: Record<string, unknown>;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  const simple = recipe.simpleSettings;
  if (!simple) {
    return null;
  }

  const simpleValues = simple.fromExpert(options);

  const handleSimpleChange = (key: string, value: unknown) => {
    const nextSimple = { ...simpleValues, [key]: value };
    const expert = simple.toExpert(nextSimple);
    for (const [k, v] of Object.entries(expert)) {
      onChange(k, v);
    }
  };

  return (
    <div className="grid gap-5">
      {simple.optionFields.map((field) => (
        <OptionControl
          key={field.key}
          field={field}
          value={simpleValues[field.key]}
          disabled={disabled}
          onChange={handleSimpleChange}
        />
      ))}
    </div>
  );
}

export function OptionsForm({
  recipe,
  options,
  settingsMode,
  onSettingsModeChange,
  disabled,
  onChange,
}: OptionsFormProps) {
  const hasSimple = recipeHasSimpleSettings(recipe);
  const showExpert = !hasSimple || settingsMode === "expert";

  return (
    <div className="grid gap-5">
      {hasSimple && (
        <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
          <div className="grid gap-0.5">
            <Label htmlFor="settings-mode-expert">Advanced</Label>
            <p className="text-xs text-muted-foreground">All FFmpeg knobs</p>
          </div>
          <Switch
            id="settings-mode-expert"
            checked={showExpert}
            disabled={disabled}
            onCheckedChange={(checked) => onSettingsModeChange(checked ? "expert" : "simple")}
          />
        </div>
      )}

      {showExpert ? (
        <ExpertOptions recipe={recipe} options={options} disabled={disabled} onChange={onChange} />
      ) : (
        <SimpleOptions recipe={recipe} options={options} disabled={disabled} onChange={onChange} />
      )}
    </div>
  );
}
