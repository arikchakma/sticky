import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Editor, useEditorState } from '@tiptap/react';
import {
  ChevronDownIcon,
  CodeIcon,
  FileCode2Icon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  TextQuoteIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui/button';

type FormatMenu = 'heading' | 'style' | 'list';

type MenuBarItemsProps = {
  editor: Editor;
};

export function MenuBarItems(props: MenuBarItemsProps) {
  const { editor } = props;

  const stats = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor.isActive('bold'),
      isItalic: ctx.editor.isActive('italic'),
      isStrike: ctx.editor.isActive('strike'),
      isUnderline: ctx.editor.isActive('underline'),
      isBulletList: ctx.editor.isActive('bulletList'),
      isOrderedList: ctx.editor.isActive('orderedList'),
      isTaskList: ctx.editor.isActive('taskList'),
      isCode: ctx.editor.isActive('code'),

      isLink: ctx.editor.isActive('link'),
      linkHref: ctx.editor.getAttributes('link').href,

      isCodeBlock: ctx.editor.isActive('codeBlock'),
      isQuote: ctx.editor.isActive('blockquote'),

      isHeading1: ctx.editor.isActive('heading', { level: 1 }),
      isHeading2: ctx.editor.isActive('heading', { level: 2 }),
      isHeading3: ctx.editor.isActive('heading', { level: 3 }),
    }),
  });

  // Selections made in the native formatting menus popped up below; the
  // ids match the ones in src-tauri's window_menu.rs.
  useEffect(() => {
    const actions: Record<string, () => boolean> = {
      'heading-1': () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
      'heading-2': () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      'heading-3': () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
      bold: () => editor.chain().focus().toggleBold().run(),
      italic: () => editor.chain().focus().toggleItalic().run(),
      underline: () => editor.chain().focus().toggleUnderline().run(),
      strike: () => editor.chain().focus().toggleStrike().run(),
      'ordered-list': () => editor.chain().focus().toggleOrderedList().run(),
      'bullet-list': () => editor.chain().focus().toggleBulletList().run(),
      'task-list': () => editor.chain().focus().toggleTaskList().run(),
    };

    const currentWindow = getCurrentWindow();
    const unlistenFormat = currentWindow.listen<string>(
      'format-menu:action',
      (event) => {
        actions[event.payload]?.();
      }
    );

    // Sent by the native link panel (see the /link route).
    const unlistenLinkSet = currentWindow.listen<string>(
      'link:set',
      (event) => {
        editor.chain().focus().toggleLink({ href: event.payload }).run();
      }
    );

    const unlistenLinkRemove = currentWindow.listen('link:remove', () => {
      editor.chain().focus().unsetLink().run();
    });

    return () => {
      unlistenFormat.then((fn) => fn());
      unlistenLinkSet.then((fn) => fn());
      unlistenLinkRemove.then((fn) => fn());
    };
  }, [editor]);

  const popupMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    menu: FormatMenu,
    active: string[]
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    invoke('cmd_popup_format_menu', {
      menu,
      active,
      position: [rect.left, rect.bottom + 6],
    });
  };

  const activeHeading = stats.isHeading1
    ? 'heading-1'
    : stats.isHeading2
      ? 'heading-2'
      : stats.isHeading3
        ? 'heading-3'
        : null;

  const activeStyles = [
    stats.isBold && 'bold',
    stats.isItalic && 'italic',
    stats.isUnderline && 'underline',
    stats.isStrike && 'strike',
  ].filter((style): style is string => Boolean(style));

  const activeList = stats.isOrderedList
    ? 'ordered-list'
    : stats.isBulletList
      ? 'bullet-list'
      : stats.isTaskList
        ? 'task-list'
        : null;

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        title="Heading"
        data-active={activeHeading !== null}
        className="h-7 w-auto gap-0 px-1 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={(e) =>
          popupMenu(e, 'heading', activeHeading ? [activeHeading] : [])
        }
      >
        <HeadingIcon className="h-4 w-4" />
        <ChevronDownIcon className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Text Style"
        data-active={activeStyles.length > 0}
        className="h-7 w-auto gap-0 px-1 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={(e) => popupMenu(e, 'style', activeStyles)}
      >
        <ItalicIcon className="h-4 w-4" />
        <ChevronDownIcon className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Link"
        data-active={stats.isLink}
        className="size-7 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          invoke('cmd_open_link_window', {
            currentUrl: stats.linkHref ?? null,
            anchor: [rect.left + rect.width / 2, rect.bottom + 6],
          });
        }}
      >
        <LinkIcon className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Code"
        data-active={stats.isCode}
        className="size-7 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon className="h-4 w-4" />
      </Button>

      <span className="bg-border mx-1 h-4 w-px shrink-0" />

      <Button
        variant="ghost"
        size="icon"
        title="Code Block"
        data-active={stats.isCodeBlock}
        className="size-7 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <FileCode2Icon className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Blockquote"
        data-active={stats.isQuote}
        className="size-7 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <TextQuoteIcon className="h-4 w-4" />
      </Button>

      <span className="bg-border mx-1 h-4 w-px shrink-0" />

      <Button
        variant="ghost"
        size="icon"
        title="List"
        data-active={activeList !== null}
        className="h-7 w-auto gap-0 px-1 text-muted-foreground hover:text-muted-foreground data-[active=true]:text-foreground"
        onClick={(e) => popupMenu(e, 'list', activeList ? [activeList] : [])}
      >
        <ListIcon className="h-4 w-4" />
        <ChevronDownIcon className="h-3 w-3" />
      </Button>
    </div>
  );
}
