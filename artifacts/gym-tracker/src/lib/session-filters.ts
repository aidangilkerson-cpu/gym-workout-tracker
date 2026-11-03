// Shared by URL links, submitted searches and sort changes; never drop a
// previously selected filter when another control changes.
export function readSessionFilters(search: string) {
  const params = new URLSearchParams(search);
  return {
    starredOnly: params.get('view') === 'starred',
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'oldest' ? 'oldest' as const : 'newest' as const,
  };
}

export function sessionListUrl(filters: ReturnType<typeof readSessionFilters>) {
  const params = new URLSearchParams();
  if (filters.starredOnly) params.set('view', 'starred');
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.sort === 'oldest') params.set('sort', 'oldest');
  const query = params.toString();
  return `/sessions${query ? `?${query}` : ''}`;
}
