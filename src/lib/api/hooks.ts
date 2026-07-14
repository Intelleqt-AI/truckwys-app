import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from './client';

// React Query wrappers — RN port of the web useFetch/usePost hooks. Query key is
// [url] so any mutation can invalidate by URL string.

export function useFetch<T = unknown>(
  url: string,
  options: Partial<UseQueryOptions<T, Error>> & { enabled?: boolean } = {},
) {
  const { enabled, ...rest } = options;
  return useQuery<T, Error>({
    queryKey: [url],
    queryFn: () => fetchData<T>(url),
    enabled: enabled !== false && !!url,
    ...rest,
  });
}

type MutationVars = { url: string; data?: unknown; config?: object };

function invalidateKeys(qc: ReturnType<typeof useQueryClient>, invalidate?: unknown) {
  if (!invalidate) return;
  const keys = Array.isArray(invalidate) ? invalidate : [invalidate];
  keys.forEach((key) =>
    qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] }),
  );
}

export function usePost<T = unknown>(
  options: { invalidate?: unknown; onSuccess?: (data: T, vars: MutationVars) => void } = {},
) {
  const { invalidate, onSuccess } = options;
  const qc = useQueryClient();
  return useMutation<T, Error, MutationVars>({
    mutationFn: ({ url, data, config }) => postData<T>({ url, data, config }),
    onSuccess: (data, vars) => {
      invalidateKeys(qc, invalidate);
      onSuccess?.(data, vars);
    },
  });
}

export function usePatch<T = unknown>(
  options: { invalidate?: unknown; onSuccess?: (data: T, vars: MutationVars) => void } = {},
) {
  const { invalidate, onSuccess } = options;
  const qc = useQueryClient();
  return useMutation<T, Error, MutationVars>({
    mutationFn: ({ url, data }) => patchData<T>({ url, data }),
    onSuccess: (data, vars) => {
      invalidateKeys(qc, invalidate);
      onSuccess?.(data, vars);
    },
  });
}

export function useDelete<T = unknown>(options: { invalidate?: unknown } = {}) {
  const { invalidate } = options;
  const qc = useQueryClient();
  return useMutation<T, Error, MutationVars>({
    mutationFn: ({ url, data }) => deleteData<T>({ url, data }),
    onSuccess: () => invalidateKeys(qc, invalidate),
  });
}
