import { apiRequest, ApiClientError } from '../api-client';
import type { ConfigurationRules } from '@/lib/modules/grades/domain/configuration-contracts';
export interface ConfigurationSummary {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}
export interface ConfigurationVersion {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  rules: unknown;
  editable: boolean;
  hasHistory: boolean;
}
export interface ConfigurationDetail extends ConfigurationSummary {
  versions: ConfigurationVersion[];
}
export const configurationKey = (schoolId: string) => ['grading-administration', schoolId] as const;
const base = '/api/v1/grading-configurations' as const;
const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const configurationApi = {
  list: (page: number) =>
    apiRequest<{ data: ConfigurationSummary[]; meta: { total: number } }>(`${base}?page=${page}`),
  detail: (id: string) =>
    apiRequest<{ data: ConfigurationDetail }>(`${base}/${id}`).then((r) => r.data),
  create: (input: { name: string; rules: ConfigurationRules }) =>
    apiRequest(`${base}`, send('POST', input)),
  status: (id: string, status: ConfigurationSummary['status']) =>
    apiRequest(`${base}/${id}`, send('PATCH', { status })),
  version: (id: string, rules: ConfigurationRules) =>
    apiRequest(`${base}/${id}/versions`, send('POST', { rules })),
  rules: (id: string, versionId: string, rules: ConfigurationRules) =>
    apiRequest(`${base}/${id}/versions/${versionId}`, send('PATCH', { rules })),
  transition: (id: string, versionId: string, status: 'ACTIVE' | 'ARCHIVED') =>
    apiRequest(`${base}/${id}/versions/${versionId}`, send('PATCH', { status })),
};
export function configurationFailure(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.featureCode === 'GRADING_CONFIGURATION_LOCKED')
      return 'These rules are locked to preserve academic history. Create a new draft version.';
    if (error.featureCode === 'GRADING_CONFIGURATION_DUPLICATE')
      return 'A configuration with this name already exists.';
    if (error.code === 'VALIDATION_ERROR')
      return 'Check the grading settings. Activation needs complete calculation settings and compatible weighting.';
    if (error.featureCode === 'GRADING_CONFIGURATION_STATE')
      return 'This configuration is inactive or archived. Refresh its state before continuing.';
  }
  return 'The action could not be completed. Refresh the configuration before trying again.';
}
