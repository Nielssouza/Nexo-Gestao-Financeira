import api from './client';

export type Priority = 'low' | 'medium' | 'high';
export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TenantMember {
  id: number;
  name: string;
  email: string;
}

export async function fetchTenantMembers(): Promise<TenantMember[]> {
  const { data } = await api.get<TenantMember[]>('/tenant/members/');
  return data;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color: string;
  is_finished: boolean;
  finished_at: string | null;
  todo_count: number;
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: number;
  title: string;
  description: string;
  is_done: boolean;
  status: TodoStatus;
  priority: Priority;
  due_date: string | null;
  done_at: string | null;
  project: number | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[]>('/todo-projects/');
  return data;
}

export async function createProject(payload: { name: string; description?: string; color?: string }): Promise<Project> {
  const { data } = await api.post<Project>('/todo-projects/', payload);
  return data;
}

export async function updateProject(id: number, payload: Partial<Pick<Project, 'name' | 'description' | 'color' | 'is_finished'>>): Promise<Project> {
  const { data } = await api.patch<Project>(`/todo-projects/${id}/`, payload);
  return data;
}

export async function deleteProject(id: number): Promise<void> {
  await api.delete(`/todo-projects/${id}/`);
}

export async function fetchTodos(params?: { is_done?: boolean; priority?: Priority; status?: TodoStatus; project?: number | '' }): Promise<TodoItem[]> {
  const { data } = await api.get<TodoItem[]>('/todos/', { params });
  return data;
}

export async function createTodo(payload: { title: string; description?: string; priority?: Priority; status?: TodoStatus; due_date?: string | null; project?: number | null; assigned_to?: number | null }): Promise<TodoItem> {
  const { data } = await api.post<TodoItem>('/todos/', payload);
  return data;
}

export async function updateTodo(id: number, payload: Partial<Pick<TodoItem, 'title' | 'description' | 'priority' | 'status' | 'due_date' | 'is_done' | 'project' | 'assigned_to'>>): Promise<TodoItem> {
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
