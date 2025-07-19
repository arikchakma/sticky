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
      isCodeBlock: ctx.editor.isActive('codeBlock'),
      isQuote: ctx.editor.isActive('blockquote'),
      isHeading1: ctx.editor.isActive('heading', { level: 1 }),
    }),
  });

  const items = [
    {
      icon: Heading1Icon,
      title: 'Heading 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: stats.isHeading1,
    },
    {
      icon: BoldIcon,
      title: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: stats.isBold,
    },
    {
      icon: ItalicIcon,
      title: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: stats.isItalic,
    },
    {
      icon: StrikethroughIcon,
      title: 'Strike',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: stats.isStrike,
    },
    {
      icon: UnderlineIcon,
      title: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: stats.isUnderline,
    },
    {
      icon: CodeIcon,
      title: 'Code',
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: stats.isCode,
    },
    {
      icon: LinkIcon,
      title: 'Link',
      action: () => editor.chain().focus().toggleLink().run(),
      isActive: stats.isLink,
    },
    {
      icon: FileCode2Icon,
      title: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: stats.isCodeBlock,
    },
    {
      icon: TextQuoteIcon,
      title: 'Blockquote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: stats.isQuote,
    },
    {
      icon: ListIcon,
      title: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: stats.isBulletList,
    },
    {
      icon: ListOrderedIcon,
      title: 'Ordered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: stats.isOrderedList,
    },
    {
      icon: ListTodoIcon,
      title: 'Task List',
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: stats.isTaskList,
    },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {items.map((item) => {
        return (
          <Button
            variant="ghost"
            size="icon"
            key={item.title}
            onClick={item.action}
            data-active={item.isActive}
            className="size-7 data-[active=true]:text-black text-zinc-500 hover:text-zinc-500"
          >
            <item.icon className="w-4 h-4" />
          </Button>
        );
      })}
    </div>
  );
}
