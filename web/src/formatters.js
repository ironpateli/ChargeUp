export function formatConnectorTypes(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'string') {
    return value.replace(/[{}"]/g, '').replaceAll(',', ', ');
  }

  return 'Not specified';
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
