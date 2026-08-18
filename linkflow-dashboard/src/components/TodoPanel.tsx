import React from 'react';
import { TodoItem, TodoPriority } from '../types';

interface TodoPanelProps {
  todos: TodoItem[];
  onToggleDone: (id: string) => void;
  onOpenAddTask: () => void;
  onEditTask: (todo: TodoItem) => void;
  onDeleteTask: (id: string) => void;
}

// Reuses the app's existing semantic color tokens (no hardcoded hex) so priority
// flags stay correct under any accent color or light/dark theme.
const PRIORITY_CLASS: Record<TodoPriority, string> = {
  high: 'text-danger',
  medium: 'text-star',
  low: 'text-text-subtle',
};

/** "Today" covers due-today and overdue; everything else (including undated tasks)
 * falls into "This Week" — a deliberately flat two-group scheme matching the
 * approved mockup, derived fresh on every render so it never goes stale. */
function isDueToday(todo: TodoItem, now: Date): boolean {
  if (!todo.dueDate) return false;
  const due = new Date(todo.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return startOfDue.getTime() <= startOfToday.getTime();
}

function formatDueChip(dueDate: string, now: Date): string {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays <= 0) return diffDays < 0 ? 'Overdue' : 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return due.toLocaleDateString(undefined, { weekday: 'short' });
}

const ChecklistIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M7.5 9l1.5 1.5L11.5 8" />
    <path d="M14 9h5" />
    <path d="M7.5 15l1.5 1.5 2.5-2.5" />
    <path d="M14 15h5" />
  </svg>
);

const FlagIcon: React.FC<{ className: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 ${className}`}>
    <path d="M6 3v18" />
    <path d="M6 4h10l-2.5 3.5L16 11H6" />
  </svg>
);

// currentColor + text-inverse (not a literal "white") so the checkmark stays
// readable against the brand color in any theme.
const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" className="text-text-inverse">
    <path d="M5 13l4 4 10-10" />
  </svg>
);

const TodoRow: React.FC<{
  todo: TodoItem;
  now: Date;
  onToggleDone: (id: string) => void;
  onEditTask: (todo: TodoItem) => void;
  onDeleteTask: (id: string) => void;
}> = ({ todo, now, onToggleDone, onEditTask, onDeleteTask }) => (
  <div className="group flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
    <button
      type="button"
      onClick={() => onToggleDone(todo.id)}
      aria-label={todo.done ? 'Mark task as not done' : 'Mark task as done'}
      className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        todo.done ? 'bg-brand' : 'border-2 border-border-main'
      }`}
    >
      {todo.done && <CheckIcon />}
    </button>

    {todo.priority && !todo.done && <FlagIcon className={PRIORITY_CLASS[todo.priority]} />}

    <button
      type="button"
      onClick={() => onEditTask(todo)}
      className={`flex-1 text-left text-[13px] truncate ${
        todo.done ? 'text-text-subtle line-through' : 'text-text-main'
      }`}
      title={todo.text}
    >
      {todo.text}
    </button>

    {todo.dueDate && !todo.done && (
      <span className="text-[10px] font-semibold text-text-muted bg-surface-subtle px-1.5 py-0.5 rounded-md whitespace-nowrap">
        {formatDueChip(todo.dueDate, now)}
      </span>
    )}

    <button
      type="button"
      onClick={() => onDeleteTask(todo.id)}
      aria-label="Delete task"
      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-subtle hover:text-danger transition-all flex-shrink-0"
    >
      <span className="material-symbols-outlined text-sm">delete</span>
    </button>
  </div>
);

export const TodoPanel: React.FC<TodoPanelProps> = ({ todos, onToggleDone, onOpenAddTask, onEditTask, onDeleteTask }) => {
  const now = new Date();
  const today = todos.filter((t) => isDueToday(t, now));
  const thisWeek = todos.filter((t) => !isDueToday(t, now));
  const doneCount = todos.filter((t) => t.done).length;
  const progress = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-center text-text-muted">
          <ChecklistIcon />
        </div>
        <h2 className="font-heading text-sm font-bold text-text-main flex-1">To-Do List</h2>
        {todos.length > 0 && (
          <span className="bg-surface-subtle border border-border-subtle text-text-muted font-mono text-[11px] px-2 py-0.5 rounded-md font-semibold">
            {doneCount}/{todos.length}
          </span>
        )}
      </div>

      {todos.length > 0 && (
        <div className="h-[5px] rounded-full bg-surface-subtle mb-4 overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {todos.length === 0 && (
        <p className="text-xs text-text-muted mb-3">No tasks yet — add your first one below.</p>
      )}

      {today.length > 0 && (
        <>
          <div className="text-[10px] font-extrabold tracking-wider uppercase text-text-subtle mb-1.5">Today</div>
          <div className="flex flex-col gap-0.5 mb-3">
            {today.map((todo) => (
              <TodoRow key={todo.id} todo={todo} now={now} onToggleDone={onToggleDone} onEditTask={onEditTask} onDeleteTask={onDeleteTask} />
            ))}
          </div>
        </>
      )}

      {thisWeek.length > 0 && (
        <>
          <div className="text-[10px] font-extrabold tracking-wider uppercase text-text-subtle mb-1.5">This Week</div>
          <div className="flex flex-col gap-0.5 mb-3">
            {thisWeek.map((todo) => (
              <TodoRow key={todo.id} todo={todo} now={now} onToggleDone={onToggleDone} onEditTask={onEditTask} onDeleteTask={onDeleteTask} />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onOpenAddTask}
        className="w-full py-2 rounded-lg border border-dashed border-border-main hover:border-border-focus text-text-muted hover:text-text-main transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold"
      >
        <span className="material-symbols-outlined text-sm">add</span>
        Add task
      </button>
    </div>
  );
};
