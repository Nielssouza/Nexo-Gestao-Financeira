import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/Layout/AppShell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Categories from './pages/Categories';
import CompanySettings from './pages/CompanySettings';
import Transactions from './pages/Transactions';
import TransactionForm from './pages/TransactionForm';
import Shopping from './pages/Shopping';
import Investments from './pages/Investments';
import Invoices from './pages/Invoices';
import Administration from './pages/Administration';
import Todos from './pages/Todos';
import Notes from './pages/Notes';
import Drive from './pages/Drive';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="transactions/new" element={<TransactionForm />} />
              <Route path="transactions/:id/edit" element={<TransactionForm />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="categories" element={<Categories />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="shopping" element={<Shopping />} />
              <Route path="drive" element={<Drive />} />
              <Route path="investments" element={<Investments />} />
              <Route path="todos" element={<Todos />} />
              <Route path="notes" element={<Notes />} />
              <Route path="settings/company" element={<CompanySettings />} />
              <Route path="admin" element={<ProtectedRoute requireSuperuser><Administration /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
