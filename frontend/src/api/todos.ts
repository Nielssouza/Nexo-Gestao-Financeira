import api from './client';

export type Priority = 'low' | 'medium' | 'high';
export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TodoItem {
  id: number;
  title: string;
  description: string;
  is_done: boolean;
  status: TodoStatus;
  priority: Priority;
  due_date: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchTodos(params?: { is_done?: boolean; priority?: Priority; status?: TodoStatus }): Promise<TodoItem[]> {
  const { data } = await api.get<TodoItem[]>('/todos/', { params });
  return data;
}

export async function createTodo(payload: { title: string; description?: string; priority?: Priority; status?: TodoStatus; due_date?: string | null }): Promise<TodoItem> {
  const { data } = await api.post<TodoItem>('/todos/', payload);
  return data;
}

export async function updateTodo(id: number, payload: Partial<Pick<TodoItem, 'title' | 'description' | 'priority' | 'status' | 'due_date' | 'is_done'>>): Promise<TodoItem> {
  const { data } = await api.patch<TodoItem>(`/todos/${id}/`, payload);
  return data;
}

export async function toggleTodo(id: number): Promise<TodoItem> {
  const { data } = await api.post<TodoItem>(`/todos/${id}/toggle/`);
  return data;
}

export async function deleteTodo(id: number): Promise<void> {
  await api.delete(`/todos/${id}/`);
}
