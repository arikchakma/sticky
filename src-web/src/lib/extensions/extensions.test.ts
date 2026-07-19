// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { editorExtensions } from './extensions';

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

const listInsideTaskItem = {
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'done' }] },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'todo' }] },
            {
              type: 'orderedList',
              attrs: { start: 1, type: null },
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'first step' }],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'second step' }],
                    },
                  ],
                },
              ],
            },
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

function createMarkdownEditor(content: string) {
  editor = new Editor({
    extensions: editorExtensions,
    content,
    contentType: 'markdown',
  });
  return editor;
}

function pressTab(editor: Editor, shift = false) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    })
  );
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

  it('Tab indents a bullet list item', () => {
    const editor = createEditor(flatBulletList);
    selectText(editor, 'second');
    pressTab(editor);

    const doc: JSONContent = editor.getJSON();
    const [firstItem] = doc.content![0].content!;
    expect(firstItem.content!.at(-1)!.type).toBe('bulletList');
  });

  it('Tab inside a list nested in a task item indents the list item, not the task item', () => {
    const editor = createEditor(listInsideTaskItem);
    selectText(editor, 'second step');
    pressTab(editor);

    const doc: JSONContent = editor.getJSON();
    const taskItems = doc.content![0].content!;
    // the task items themselves did not move
    expect(taskItems).toHaveLength(2);
    const ordered = taskItems[1].content!.find(
      (node) => node.type === 'orderedList'
    )!;
    // "second step" sank under "first step"
    expect(ordered.content).toHaveLength(1);
    expect(ordered.content![0].content!.at(-1)!.type).toBe('orderedList');
  });

  it('Shift-Tab inside a list nested in a task item lifts the list item, not the task item', () => {
    const editor = createEditor(listInsideTaskItem);
    selectText(editor, 'second step');
    pressTab(editor);
    pressTab(editor, true);

    expect(editor.getJSON()).toEqual(listInsideTaskItem);
  });

  it('Tab on a non-indentable list item leaves the document unchanged', () => {
    const editor = createEditor(listInsideTaskItem);
    selectText(editor, 'first step');
    pressTab(editor);

    expect(editor.getJSON()).toEqual(listInsideTaskItem);
  });

  it('Tab nests a blank-line-separated task item under the item above', () => {
    const editor = createMarkdownEditor(
      '- [x] parent\n\n- [ ] child one\n\n- [ ] child two\n'
    );
    selectText(editor, 'child one');
    pressTab(editor);
    selectText(editor, 'child two');
    pressTab(editor);

    expect(editor.getMarkdown()).toBe(
      '- [x] parent\n  - [ ] child one\n  - [ ] child two'
    );
    expect(editor.state.selection.$from.parent.textContent).toBe('child two');
  });

  it('Tab nests an ordered list under the task item above', () => {
    const editor = createMarkdownEditor(
      '- [ ] It autogrows with content.\n\n1. Howdy\n'
    );
    selectText(editor, 'Howdy');
    pressTab(editor);

    expect(editor.getMarkdown()).toBe(
      '- [ ] It autogrows with content.\n  1. Howdy'
    );
    expect(editor.state.selection.$from.parent.textContent).toBe('Howdy');
  });

  it('Shift-Tab lifts a nested task item back out', () => {
    const editor = createMarkdownEditor('- [x] parent\n\n- [ ] child\n');
    selectText(editor, 'child');
    pressTab(editor);
    pressTab(editor, true);

    expect(editor.getMarkdown()).toBe('- [x] parent\n- [ ] child');
  });

  it('exposes character count storage', () => {
    const editor = createEditor(flatTaskList);
    expect(editor.storage.characterCount.characters()).toBe(
      'first'.length + 'second'.length
    );
    expect(editor.storage.characterCount.words()).toBe(2);
  });
});
