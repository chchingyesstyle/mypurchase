export type Role = 'admin' | 'user';
export type Money = number;
export type MonthKey = `${number}-${string}`;

export type User = {
  id: string;
  username: string;
  role: Role;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  kind: 'built_in' | 'custom';
  color: string;
  icon: string;
  createdAt: string;
};

export type ReceiptItemInput = {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
  categoryId: string | null;
};

export type ReceiptInput = {
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal: Money | null;
  tax: Money | null;
  discount: Money | null;
  total: Money;
  categoryId: string | null;
  notes: string | null;
  sourceType: 'manual' | 'receipt_image';
  items: ReceiptItemInput[];
};
