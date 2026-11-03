'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SortableItemState {
  /** Ready-made grip button that starts a drag (pointer, or keyboard: Space to lift, arrows to move, Space to drop). */
  handle: ReactNode;
  isDragging: boolean;
}

const HANDLE_CLASSES =
  'flex size-8 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

function SortableRow({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
  children: (state: SortableItemState) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={label}
      className={cn(HANDLE_CLASSES, disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing')}
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-lg')}
    >
      {children({ handle, isDragging })}
    </li>
  );
}

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Called with the new order after a drop. */
  onReorder: (items: T[]) => void;
  renderItem: (item: T, state: SortableItemState) => ReactNode;
  /** Accessible label for the drag handle of an item. */
  getHandleLabel?: (item: T) => string;
  disabled?: boolean;
  className?: string;
}

/** Vertical drag-and-drop list (dnd-kit) with keyboard support. */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  getHandleLabel,
  disabled = false,
  className,
}: SortableListProps<T>) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => items.map(getId), [items, getId]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={cn('space-y-2', className)}>
          {items.map((item) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
              disabled={disabled}
              label={getHandleLabel?.(item) ?? 'Drag to reorder'}
            >
              {(state) => renderItem(item, state)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Optimistic ordering for server lists: shows the dropped order immediately until the server data reflects it.
 * Returns the ordered items and a setter that takes the new order.
 */
export function useOptimisticOrder<T>(items: T[] | undefined, getId: (item: T) => string) {
  const [pending, setPending] = useState<{ ids: string[]; base: T[] | undefined } | null>(null);
  // Drop the optimistic order once fresh server data arrives.
  const active = pending && pending.base === items ? pending.ids : null;
  const ordered = useMemo(() => {
    const list = items ?? [];
    if (!active) return list;
    const byId = new Map(list.map((item) => [getId(item), item]));
    const result = active.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
    for (const item of list) if (!active.includes(getId(item))) result.push(item);
    return result;
  }, [items, active, getId]);
  const setOrder = (next: T[]) => setPending({ ids: next.map(getId), base: items });
  return [ordered, setOrder] as const;
}
