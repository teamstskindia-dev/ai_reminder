import { useQuery } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import { fetchCmsPage, fetchLoginHero, fetchOnboardingSlides } from '../resources/public';

export function useOnboardingSlides() {
  return useQuery({ queryKey: qk.public.onboarding, queryFn: fetchOnboardingSlides, staleTime: 10 * 60_000, retry: 1 });
}

export function useCmsPage(slug: string) {
  return useQuery({ queryKey: qk.public.page(slug), queryFn: () => fetchCmsPage(slug), enabled: Boolean(slug) });
}

export function useLoginHero() {
  return useQuery({ queryKey: qk.public.loginHero, queryFn: fetchLoginHero, staleTime: 10 * 60_000, retry: 0 });
}
