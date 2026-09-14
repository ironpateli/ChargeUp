const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'chargeup_access_token';

function formatFieldName(fieldName) {
  return fieldName
    .replace(/\.\d+/g, '')
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatApiErrorMessage(payload) {
  if (payload.error?.code !== 'VALIDATION_ERROR') {
    return payload.error?.message ?? 'Request failed';
  }

  const fieldErrors = payload.error?.details?.fieldErrors ?? {};
  const messages = Object.entries(fieldErrors).flatMap(([field, errors]) => (
    errors.map((message) => `${formatFieldName(field)}: ${message}`)
  ));

  return messages.length ? messages.join('\n') : payload.error.message;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(formatApiErrorMessage(payload));
    error.status = response.status;
    error.code = payload.error?.code;
    error.details = payload.error?.details;
    throw error;
  }

  return payload.data;
}

export const demoAccounts = [
  { label: 'User', email: 'user@chargeup.test', password: 'StrongPass123' },
  { label: 'Owner', email: 'owner@chargeup.test', password: 'StrongPass123' },
  { label: 'Admin', email: 'admin@chargeup.test', password: 'StrongPass123' }
];
