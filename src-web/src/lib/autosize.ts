const IS_MANUALLY_RESIZED_KEY = '__is_manually_resized__';

export function setIsManuallyResized(isManuallyResized: boolean) {
  localStorage.setItem(IS_MANUALLY_RESIZED_KEY, String(isManuallyResized));
}

export function getIsManuallyResized() {
  return localStorage.getItem(IS_MANUALLY_RESIZED_KEY) === 'true';
}
