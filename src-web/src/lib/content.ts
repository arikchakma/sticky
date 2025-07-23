import type { JSONContent } from '@tiptap/react';

export function getTitleFromContent(content: JSONContent) {
  let title = '';
  const children = content.content ?? [];
  for (const node of children) {
    if (node.type === 'text') {
      title = node.text ?? '';
      break;
    }

    if (node.content) {
      title = getTitleFromContent(node);
      break;
    }
  }

  return title?.slice(0, 100) ?? '';
}
