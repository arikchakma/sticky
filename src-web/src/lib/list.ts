import {
  BulletList,
  ListItem,
  OrderedList,
  TaskItem,
  TaskList,
} from '@tiptap/extension-list';
import type { EditorState } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

const LIST_NAMES = [BulletList.name, OrderedList.name, TaskList.name];
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

// Blank lines between markdown list items parse into separate adjacent
// lists, so the first item of each fragment has no sibling above it and
// sinkListItem rejects it. Nest such an item under the last item of the
// previous list instead.
export const indentListItem = (
  editor: Editor,
  itemDepth: number
) => {
  const { state } = editor;
  const { $from, $to } = state.selection;

  if (!$from.sameParent($to)) {
    return false;
  }

  if ($from.index(itemDepth - 1) !== 0) {
    return false;
  }

  const item = $from.node(itemDepth);
  const list = $from.node(itemDepth - 1);
  const listPos = $from.before(itemDepth - 1);
  const itemPos = listPos + 1;

  const nodeBefore = state.doc.resolve(listPos).nodeBefore;

  if (!nodeBefore || !LIST_NAMES.includes(nodeBefore.type.name)) {
    return false;
  }

  const itemBefore = nodeBefore.lastChild;

  if (!itemBefore) {
    return false;
  }

  // end of the last item's content in the list before
  const itemBeforeEnd = listPos - 2;

  // append into an existing sub list so repeated indents become siblings
  if (itemBefore.lastChild?.type === list.type) {
    return editor
      .chain()
      .cut({ from: itemPos, to: itemPos + item.nodeSize }, itemBeforeEnd - 1)
      .setTextSelection(itemBeforeEnd - 1 + ($from.pos - itemPos))
      .run();
  }

  if (!itemBefore.contentMatchAt(itemBefore.childCount).matchType(list.type)) {
    return false;
  }

  if (list.childCount === 1) {
    return editor
      .chain()
      .cut({ from: listPos, to: listPos + list.nodeSize }, itemBeforeEnd)
      .setTextSelection(itemBeforeEnd + ($from.pos - listPos))
      .run();
  }

  return editor
    .chain()
    .deleteRange({ from: itemPos, to: itemPos + item.nodeSize })
    .insertContentAt(itemBeforeEnd, list.type.create(list.attrs, item).toJSON())
    .setTextSelection(itemBeforeEnd + 1 + ($from.pos - itemPos))
    .run();
};
