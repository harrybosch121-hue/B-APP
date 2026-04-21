const BASE_URL = import.meta.env.VITE_BILLING_API_URL || 'http://localhost:3002';

async function request<T = unknown>(path: string, options: RequestInit = {}, isFormData = false): Promise<T> {
  const token = localStorage.getItem('billing_auth_token');
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('billing_auth_token');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Party {
  id: string;
  name: string;
  print_name?: string | null;
  phone: string | null;
  address: string | null;
  state?: string | null;
  gstin: string | null;
  party_type: string;
  credit_limit: number;
  opening_balance: number;
  outstanding?: number;
  total_invoiced?: number;
  total_paid?: number;
  invoice_count?: number;
  last_invoice_date?: string | null;
}

export interface Item {
  id: string;
  name: string;
  print_name?: string | null;
  hsn: string | null;
  unit: string;
  default_price: number;
  purchase_price?: number;
  opening_stock?: number;
  current_stock?: number;
  gst_rate: number;
  category: string | null;
  low_stock_threshold: number;
  linked_tile_id: string | null;
  customerPrices?: Array<{ id: string; party_id: string; price: number; party_name: string }>;
}

export interface InvoiceLine {
  id?: string;
  item_id?: string | null;
  item_name_snapshot?: string;
  name?: string;
  hsn?: string | null;
  qty: number;
  unit?: string;
  price: number;
  gst_rate: number;
  line_total?: number;
}

export interface Invoice {
  id: string;
  invoice_no: number;
  voucher_type?: 'Sale' | 'SaleReturn';
  date: string;
  party_id: string | null;
  party_name?: string;
  payment_mode: 'Cash' | 'Credit' | 'Acc';
  subtotal: number;
  gst_amount: number;
  total: number;
  paid_amount: number;
  status: 'Active' | 'Cancelled';
  source: 'Manual' | 'Busy';
  notes: string | null;
  items?: InvoiceLine[];
  payments?: Payment[];
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
}

export interface Payment {
  id: string;
  party_id: string;
  invoice_id: string | null;
  amount: number;
  mode: string;
  date: string;
  notes: string | null;
  invoice_no?: number;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  // parties
  getParties: () => request<Party[]>('/api/parties'),
  getParty: (id: string) => request<Party & { invoices: Invoice[]; payments: Payment[] }>(`/api/parties/${id}`),
  getPartyStatement: (id: string, from?: string, to?: string) => {
    const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
    return request<{
      party: Party;
      from: string | null;
      to: string | null;
      opening: number;
      closing: number;
      generatedAt: string;
      ledger: Array<{ date: string; type: string; ref: string; debit: number; credit: number; balance: number }>;
    }>(`/api/parties/${id}/statement${qs ? `?${qs}` : ''}`);
  },
  createParty: (p: Partial<Party>) => request<Party>('/api/parties', { method: 'POST', body: JSON.stringify(p) }),
  updateParty: (id: string, p: Partial<Party>) => request<Party>(`/api/parties/${id}`, { method: 'PUT', body: JSON.stringify(p) }),

  // items
  getItems: () => request<Item[]>('/api/items'),
  getItem: (id: string) => request<Item>(`/api/items/${id}`),
  createItem: (i: Partial<Item>) => request<Item>('/api/items', { method: 'POST', body: JSON.stringify(i) }),
  updateItem: (id: string, i: Partial<Item>) => request<Item>(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(i) }),
  getEffectivePrice: (itemId: string, partyId: string) =>
    request<{ price: number; source: 'customer' | 'default' }>(`/api/items/${itemId}/price/${partyId}`),
  setCustomerPrice: (itemId: string, partyId: string, price: number) =>
    request(`/api/items/${itemId}/price/${partyId}`, { method: 'PUT', body: JSON.stringify({ price }) }),
  deleteCustomerPrice: (itemId: string, partyId: string) =>
    request(`/api/items/${itemId}/price/${partyId}`, { method: 'DELETE' }),

  // invoices
  getInvoices: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Invoice[]>(`/api/invoices${qs ? `?${qs}` : ''}`);
  },
  getInvoice: (id: string) => request<Invoice>(`/api/invoices/${id}`),
  createInvoice: (inv: Partial<Invoice> & { items: InvoiceLine[] }) =>
    request<Invoice>('/api/invoices', { method: 'POST', body: JSON.stringify(inv) }),
  updateInvoice: (id: string, inv: Partial<Invoice> & { items: InvoiceLine[] }) =>
    request<Invoice>(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(inv) }),
  cancelInvoice: (id: string) => request<Invoice>(`/api/invoices/${id}/cancel`, { method: 'POST' }),

  // payments
  createPayment: (p: Partial<Payment>) => request<Payment>('/api/payments', { method: 'POST', body: JSON.stringify(p) }),
  getPartyPayments: (partyId: string) => request<Payment[]>(`/api/payments/party/${partyId}`),
  deletePayment: (id: string) => request(`/api/payments/${id}`, { method: 'DELETE' }),

  // reports
  dashboard: () => request<any>('/api/reports/dashboard'),
  daybook: (from: string, to: string) => request<any>(`/api/reports/daybook?from=${from}&to=${to}`),
  salesRegister: (from: string, to: string) => request<any[]>(`/api/reports/sales-register?from=${from}&to=${to}`),
  itemSales: (from: string, to: string) => request<any[]>(`/api/reports/item-sales?from=${from}&to=${to}`),
  topCustomers: (from: string, to: string, mode?: string) =>
    request<any[]>(`/api/reports/top-customers?from=${from}&to=${to}${mode ? `&mode=${mode}` : ''}`),
  pl: (from: string, to: string) => request<any>(`/api/reports/pl?from=${from}&to=${to}`),
  gstr1: (from: string, to: string) => request<any>(`/api/reports/gstr1?from=${from}&to=${to}`),

  // import
  importBusy: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{
      totalInFile: number;
      imported: number;
      skippedExisting: number;
      partiesCreated: number;
      itemsCreated: number;
      returns: { totalInFile: number; imported: number; skippedExisting: number };
      masters: {
        accountsInFile: number;
        itemsInFile: number;
        partiesCreated: number;
        partiesSkippedExisting: number;
        partiesSkippedNonParty: number;
        itemsCreated: number;
        itemsSkippedExisting: number;
      };
      errors: string[];
      skipped?: string[];
    }>(
      '/api/import/busy',
      { method: 'POST', body: fd },
      true
    );
  },
  resetData: () => request<{ ok: boolean; message: string }>('/api/import/reset', { method: 'POST' }),

  // backup / restore
  downloadBackup: async () => {
    const token = localStorage.getItem('billing_auth_token');
    const res = await fetch(`${API_BASE_URL}/api/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Backup failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    a.download = m ? m[1] : `billing-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
