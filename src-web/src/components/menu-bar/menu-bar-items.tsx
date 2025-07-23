import { Editor, useEditorState } from '@tiptap/react';
import {
  BoldIcon,
  CodeIcon,
  FileCode2Icon,
  Heading1Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  StrikethroughIcon,
  TextQuoteIcon,
  UnderlineIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { HeadingSelector } from './heading-selector';
import { LinkSelectorPopover } from './link-selector-popover';

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

  const isHeadingActive =
    stats.isHeading1 || stats.isHeading2 || stats.isHeading3;

  const items = [
    {
      type: 'heading',
      icon: Heading1Icon,
      title: 'Heading 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: isHeadingActive,
    },
    {
      type: 'bold',
      icon: BoldIcon,
      title: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: stats.isBold,
    },
    {
      type: 'italic',
      icon: ItalicIcon,
      title: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: stats.isItalic,
    },
    {
      type: 'strike',
      icon: StrikethroughIcon,
      title: 'Strike',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: stats.isStrike,
    },
    {
      type: 'underline',
      icon: UnderlineIcon,
      title: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: stats.isUnderline,
    },
    {
      type: 'code',
      icon: CodeIcon,
      title: 'Code',
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: stats.isCode,
    },
    {
      type: 'link',
      icon: LinkIcon,
      title: 'Link',
      action: () => editor.chain().focus().toggleLink().run(),
      isActive: stats.isLink,
    },
    {
      type: 'codeBlock',
      icon: FileCode2Icon,
      title: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: stats.isCodeBlock,
    },
    {
      type: 'blockquote',
      icon: TextQuoteIcon,
      title: 'Blockquote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: stats.isQuote,
    },
    {
      type: 'bulletList',
      icon: ListIcon,
      title: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: stats.isBulletList,
    },
    {
      type: 'orderedList',
      icon: ListOrderedIcon,
      title: 'Ordered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: stats.isOrderedList,
    },
    {
      type: 'taskList',
      icon: ListTodoIcon,
      title: 'Task List',
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: stats.isTaskList,
    },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {items.map((item) => {
        if (item.type === 'link') {
          return (
            <LinkSelectorPopover
              key={item.title}
              defaultValue={stats?.linkHref ?? ''}
              isActive={item.isActive}
              onSelect={(url) => {
                editor.chain().focus().toggleLink({ href: url }).run();
              }}
              onRemove={() => editor.chain().focus().unsetLink().run()}
            />
          );
        }

        if (item.type === 'heading') {
          const currentLevel = stats.isHeading1
            ? 1
            : stats.isHeading2
              ? 2
              : stats.isHeading3
                ? 3
                : null;

          return (
            <HeadingSelector
              key={item.title}
              isActive={item.isActive}
              currentLevel={currentLevel}
              onSelect={(level) =>
                editor.chain().focus().toggleHeading({ level }).run()
              }
            />
          );
        }

        return (
          <Button
            variant="ghost"
            size="icon"
            key={item.title}
            onClick={item.action}
            data-active={item.isActive}
            className="size-7 text-zinc-500 hover:text-zinc-500 data-[active=true]:text-black"
          >
            <item.icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}
