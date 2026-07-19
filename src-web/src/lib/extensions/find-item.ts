import { ListItem, TaskItem } from '@tiptap/extension-list';
import type { EditorState } from '@tiptap/pm/state';

const LIST_ITEM_NAMES = [ListItem.name, TaskItem.name];

export const findListItemAtSelection = (state: EditorState) => {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (LIST_ITEM_NAMES.includes(node.type.name)) {
      return { node, depth };
    }
  }

  return null;
};
