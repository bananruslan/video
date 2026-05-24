/** Левая колонка: файл в очереди на обработку */
export interface InputQueueItem {
  id: string;
  file: File;
  name: string;
  addedAt: number;
}

/** Правая колонка: готовый результат конвертации */
export interface OutputQueueItem {
  id: string;
  fileName: string;
  objectUrl: string;
  recipeLabel: string;
  createdAt: number;
}
