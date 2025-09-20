const ASSET_PREFIX = process.env.NEXT_PUBLIC_ENV === 'production' ? '/pc' : '';

export function resolveAssetPath(path: string): string {
  if (!path) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!ASSET_PREFIX) {
    return normalizedPath;
  }

  return normalizedPath.startsWith(`${ASSET_PREFIX}/`)
    ? normalizedPath
    : `${ASSET_PREFIX}${normalizedPath}`;
} 