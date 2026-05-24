import type { SettingsMode } from "@/domain/conversion/types";

const STORAGE_KEY = "converter-settings-mode";

export function readSettingsModePreference(): SettingsMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "expert") {
      return "expert";
    }
  } catch {
    // localStorage unavailable
  }
  return "simple";
}

export function writeSettingsModePreference(mode: SettingsMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
