import React, { useState, useEffect } from 'react';
import { TodoItem, TodoPriority } from '../types';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTask: (task: Omit<TodoItem, 'id' | 'createdAt' | 'done'>, editingId?: string) => void;
  editingTask?: TodoItem | null;
}

const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose, onSaveTask, editingTask }) => {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TodoPriority | ''>('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (editingTask) {
      setText(editingTask.text);
      setPriority(editingTask.priority ?? '');
      setDueDate(editingTask.dueDate ?? '');
    } else {
      setText('');
      setPriority('');
      setDueDate('');
    }
  }, [editingTask, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    onSaveTask(
      {
        text: text.trim(),
        priority: priority || undefined,
        dueDate: dueDate || undefined,
      },
      editingTask?.id
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-[440px] rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-subtle">
          <h2 className="font-heading text-base font-bold text-text-main m-0">
            {editingTask ? 'Edit Task' : 'Add Task'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="text-text-subtle hover:text-text-main transition-colors p-1 rounded-lg hover:bg-surface-hover focus:outline-none"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-text" className="text-xs font-semibold text-text-main">
              Task <span className="text-danger">*</span>
            </label>
            <input
              id="task-text"
              type="text"
              required
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., Confirm venue for Q3 retreat"
              className="w-full bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-subtle focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-due" className="text-xs font-semibold text-text-main">
              Due Date
            </label>
            <input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-main">Priority</label>
            <div className="flex bg-surface-subtle p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                onClick={() => setPriority('')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-colors ${
                  priority === '' ? 'bg-surface text-text-main shadow-2xs' : 'text-text-muted hover:text-text-main'
                }`}
              >
                None
              </button>
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-colors ${
                    priority === p.value ? 'bg-surface text-text-main shadow-2xs' : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle flex justify-end gap-3 items-center mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-xs transition-colors active:scale-95"
            >
              {editingTask ? 'Save Task' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
