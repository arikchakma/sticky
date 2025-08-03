import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getShowWordCount, setShowWordCount } from '~/lib/settings';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const [showCount, setShowCount] = useState<boolean>(true);

  useEffect(() => {
    getShowWordCount().then(setShowCount);
  }, []);

  return (
    <div>
      <h1 className="py-1 text-center text-xs font-medium text-gray-600">
        Settings
      </h1>
      <div className="px-4 py-4 text-sm text-gray-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCount}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowCount(checked);
              setShowWordCount(checked);
            }}
          />
          Show word/character count
        </label>
      </div>
    </div>
  );
}
