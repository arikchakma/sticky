// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { editorExtensions } from './editor-extensions';

const flatTaskList = {
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
          ],
        },
      ],
    },
  ],
};

const flatBulletList = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
          ],
        },
      ],
    },
  ],
};

let editor: Editor;

function createEditor(content?: object) {
  editor = new Editor({ extensions: editorExtensions, content });
  return editor;
}

function selectText(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes(text)) {
      found = pos;
    }
  });
  expect(found).toBeGreaterThan(-1);
  editor.commands.setTextSelection(found + 1);
}

afterEach(() => {
  editor?.destroy();
});

describe('editor extensions', () => {
  it('parses previously stored flat task lists unchanged', () => {
    const editor = createEditor(flatTaskList);
    expect(editor.getJSON()).toEqual(flatTaskList);
  });

  it('sinks a task item under the previous one', () => {
    const editor = createEditor(flatTaskList);
    selectText(editor, 'second');

    expect(editor.commands.sinkListItem('taskItem')).toBe(true);

    const doc: JSONContent = editor.getJSON();
    const [firstItem] = doc.content![0].content!;
    const nestedList = firstItem.content!.at(-1)!;
    expect(nestedList.type).toBe('taskList');
    expect(nestedList.content![0].type).toBe('taskItem');
    expect(nestedList.content![0].attrs).toMatchObject({ checked: true });
  });

  it('lifts a nested task item back to the top level', () => {
    const editor = createEditor(flatTaskList);
    selectText(editor, 'second');
    editor.commands.sinkListItem('taskItem');

    expect(editor.commands.liftListItem('taskItem')).toBe(true);
    expect(editor.getJSON()).toEqual(flatTaskList);
  });

  it('still sinks regular list items', () => {
    const editor = createEditor(flatBulletList);
    selectText(editor, 'second');

    expect(editor.commands.sinkListItem('listItem')).toBe(true);

    const doc: JSONContent = editor.getJSON();
    const [firstItem] = doc.content![0].content!;
    expect(firstItem.content!.at(-1)!.type).toBe('bulletList');
  });

  it('exposes character count storage', () => {
    const editor = createEditor(flatTaskList);
    expect(editor.storage.characterCount.characters()).toBe(
      'first'.length + 'second'.length
    );
    expect(editor.storage.characterCount.words()).toBe(2);
  });
});
