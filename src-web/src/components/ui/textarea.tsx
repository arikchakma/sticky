import type { ChangeEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { cn } from '~/utils/classname';

type AutogrowTextareaProps = {
  id?: string;
  placeholder?: string;
  rows?: number;
  maxRows?: number;
  className?: string;

  value: string;
  onValueChange: (value: string) => void;
};

export function AutogrowTextarea(props: AutogrowTextareaProps) {
  const { id, placeholder, value, onValueChange, className } = props;

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onValueChange(textarea.value);
  };

  return (
    <TextareaAutosize
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={handleInput}
      className={cn(
        'block min-h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none placeholder:text-gray-500 focus:border-gray-500',
        className
      )}
    />
  );
}
