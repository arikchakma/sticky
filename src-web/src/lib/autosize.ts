import { getCurrentWindow } from '@tauri-apps/api/window';

const IS_MANUALLY_RESIZED_KEY = '__is_manually_resized__';

const currentWindow = getCurrentWindow();
const currentWindowLabel = currentWindow.label;

export function setIsManuallyResized(isManuallyResized: boolean) {
  localStorage.setItem(
    `${IS_MANUALLY_RESIZED_KEY}_${currentWindowLabel}`,
    String(isManuallyResized)
  );
}

export function getIsManuallyResized() {
  return (
    localStorage.getItem(`${IS_MANUALLY_RESIZED_KEY}_${currentWindowLabel}`) ===
    'true'
  );
}
