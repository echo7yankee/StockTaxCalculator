import { type CSSProperties, type ReactNode } from 'react';

type Rounded = 'none' | 'sm' | 'md' | 'lg' | 'full';
type Size = string | number;

interface SkeletonProps {
  w?: Size;
  h?: Size;
  rounded?: Rounded;
  className?: string;
  'data-testid'?: string;
}

const ROUNDED: Record<Rounded, string> = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

const toCss = (v: Size | undefined) =>
  v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

export function Skeleton({ w, h, rounded = 'md', className = '', 'data-testid': testId }: SkeletonProps) {
  const style: CSSProperties = { width: toCss(w), height: toCss(h) };
  return (
    <span
      aria-hidden="true"
      className={`block bg-gray-200 dark:bg-navy-700 animate-pulse ${ROUNDED[rounded]} ${className}`}
      style={style}
      data-testid={testId}
    />
  );
}

export interface SkeletonCell {
  className?: string;
  content?: ReactNode;
}

interface SkeletonRowProps {
  cells: SkeletonCell[];
  rowClassName?: string;
}

export function SkeletonRow({ cells, rowClassName = '' }: SkeletonRowProps) {
  return (
    <tr className={rowClassName} aria-hidden="true">
      {cells.map((cell, i) => (
        <td key={i} className={cell.className}>
          {cell.content ?? <Skeleton w="100%" h="1rem" />}
        </td>
      ))}
    </tr>
  );
}
