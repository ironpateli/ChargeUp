export function formatConnectorTypes(value) {
  const formatOne = (item) => formatDisplayLabel(item);

  if (Array.isArray(value)) {
    return value.map(formatOne).join(', ');
  }

  if (typeof value === 'string') {
    return value
      .replace(/[{}"]/g, '')
      .split(',')
      .map((item) => formatOne(item.trim()))
      .join(', ');
  }

  return 'Not specified';
}

export function formatDisplayLabel(value) {
  if (!value) {
    return 'Not specified';
  }

  const normalized = String(value).trim().toUpperCase();
  const knownLabels = {
    CCS2: 'CCS2',
    TYPE_2: 'Type 2',
    CHADEMO: 'CHAdeMO',
    GB_T: 'GB/T',
    TESLA_NACS: 'Tesla NACS',
    MOCK: 'Mock',
    RAZORPAY: 'Razorpay',
    EV_USER: 'EV user'
  };

  if (knownLabels[normalized]) {
    return knownLabels[normalized];
  }

  return normalized
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatRoleLabel(role, fullName) {
  const name = fullName?.trim();
  const appendRole = (label) => {
    if (!name) {
      return label;
    }

    return name.toLowerCase().endsWith(label.toLowerCase()) ? name : `${name} ${label.toLowerCase()}`;
  };

  if (role === 'ADMIN') {
    return appendRole('Admin');
  }

  if (role === 'CHARGER_OWNER') {
    return appendRole('Owner');
  }

  if (role === 'EV_USER') {
    return appendRole('User');
  }

  return formatDisplayLabel(role);
}

export function formatDistanceKm(distanceMeters) {
  if (distanceMeters === null || distanceMeters === undefined) {
    return null;
  }

  return `${(Number(distanceMeters) / 1000).toFixed(1)} km`;
}

export function formatMoneyFromPaise(amountPaise, currency = 'INR') {
  if (amountPaise === null || amountPaise === undefined) {
    return 'Not charged';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(amountPaise) / 100);
}
