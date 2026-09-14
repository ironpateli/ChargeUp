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
