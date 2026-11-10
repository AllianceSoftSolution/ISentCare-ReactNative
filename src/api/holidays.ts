import apiClient from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type HolidaySource = 'us_federal' | 'custom' | string;

export type Holiday = {
  id: number;
  date: string;
  name: string;
  source: HolidaySource;
};

export function isCompanyHoliday(holiday: Holiday) {
  return holiday.source === 'custom';
}

export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const response = await apiClient.get<Holiday[]>(`/holidays/?year=${year}`);
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load holidays.'));
  }
  if (!Array.isArray(response.data)) {
    throw new Error('The server returned an invalid holidays response.');
  }
  return response.data.filter((item) => (
    item
    && typeof item.id === 'number'
    && typeof item.date === 'string'
    && typeof item.name === 'string'
  ));
}
