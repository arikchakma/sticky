import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/react';
import { escapeRegExp } from '~/lib/string';

export type FindMatch = {
  from: number;
  to: number;
};

export type FindStorage = {
  query: string;
  matches: FindMatch[];
  activeIndex: number;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      // Recomputes the matches for `query` and highlights them.
      setFindQuery: (query: string) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      // Drops the query and every highlight.
      clearFind: () => ReturnType;
    };
  }

  interface Storage {
    find: FindStorage;
  }
}

const findPluginKey = new PluginKey('find');

// Case-insensitive plain-text matching, per text node. Matches
// spanning formatting boundaries ("hello **world**" for "hello wor")
// are not found, like in most editors' find.
function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
  const matches: FindMatch[] = [];
  if (!query) {
    return matches;
  }

  const pattern = new RegExp(escapeRegExp(query), 'gi');
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    for (const match of node.text.matchAll(pattern)) {
      matches.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      });
    }
  });

  return matches;
}

export const FindExtension = Extension.create<
  Record<string, never>,
  FindStorage
>({
  name: 'find',

  addStorage() {
    return {
      query: '',
      matches: [],
      activeIndex: 0,
    };
  },

  addCommands() {
    return {
      setFindQuery:
        (query) =>
        ({ editor, tr, dispatch }) => {
          const storage = this.storage;
          storage.query = query;
          storage.matches = findMatches(editor.state.doc, query);

          // Start from the match at or after the cursor, like a
          // browser find.
          const cursor = editor.state.selection.from;
          const next = storage.matches.findIndex((m) => m.to > cursor);
          storage.activeIndex = next === -1 ? 0 : next;

          if (dispatch) {
            tr.setMeta(findPluginKey, true);
          }
          return true;
        },

      findNext:
        () =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          if (storage.matches.length === 0) {
            return false;
          }

          storage.activeIndex =
            (storage.activeIndex + 1) % storage.matches.length;
          if (dispatch) {
            tr.setMeta(findPluginKey, true);
          }
          return true;
        },

      findPrevious:
        () =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          if (storage.matches.length === 0) {
            return false;
          }

          storage.activeIndex =
            (storage.activeIndex + storage.matches.length - 1) %
            storage.matches.length;
          if (dispatch) {
            tr.setMeta(findPluginKey, true);
          }
          return true;
        },

      clearFind:
        () =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          storage.query = '';
          storage.matches = [];
          storage.activeIndex = 0;

          if (dispatch) {
            tr.setMeta(findPluginKey, true);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: findPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, _oldState, newState) => {
            // Edits shift positions and can create or destroy
            // matches; recompute against the new document.
            if (tr.docChanged && storage.query) {
              storage.matches = findMatches(newState.doc, storage.query);
              storage.activeIndex = Math.min(
                storage.activeIndex,
                Math.max(storage.matches.length - 1, 0)
              );
            } else if (!tr.getMeta(findPluginKey)) {
              return old.map(tr.mapping, tr.doc);
            }

            return DecorationSet.create(
              newState.doc,
              storage.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    index === storage.activeIndex
                      ? 'find-match find-match-active'
                      : 'find-match',
                })
              )
            );
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
