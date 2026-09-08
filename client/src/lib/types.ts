export type Role = "ADMIN" | "STAFF";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export type FieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "CHECKBOX" | "DROPDOWN" | "DATE" | "SECTION";

export interface FormField {
  id: number;
  type: FieldType;
  label: string;
  required: boolean;
  options: string | null; // JSON-encoded string[]
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface FormSummary {
  id: number;
  title: string;
  description: string | null;
  published: boolean;
  createdBy: { id: number; name: string };
  updatedAt: string;
  _count: { fields: number; responses: number };
}

export interface FormDetail {
  id: number;
  title: string;
  description: string | null;
  published: boolean;
  pageTitles: string; // JSON-encoded string[]
  createdBy: { id: number; name: string };
  fields: FormField[];
}

export interface FormResponseValue {
  id: number;
  fieldId: number;
  value: string;
}

export interface FormResponseRecord {
  id: number;
  submittedAt: string;
  submittedBy: { id: number; name: string } | null;
  values: FormResponseValue[];
}

export interface SheetStatus {
  googleConfigured: boolean;
  connected: boolean;
  spreadsheetId: string | null;
  sheetName: string;
  syncOnSubmit: boolean;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}
