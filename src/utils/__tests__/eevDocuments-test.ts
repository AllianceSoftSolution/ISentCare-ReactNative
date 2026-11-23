import { eevPathMismatchMessage } from '@/utils/eevDocuments';

describe('eevPathMismatchMessage', () => {
  const ia = { id: 1, name: 'Passport', category: 'IA' as const };
  const id = { id: 2, name: 'Driver license', category: 'ID' as const };
  const au = { id: 3, name: 'Work auth', category: 'AU' as const };

  test('requires IA category on IA path', () => {
    expect(eevPathMismatchMessage('IA', null)).toMatch(/both identity and employment/i);
    expect(eevPathMismatchMessage('IA', id)).toMatch(/both identity and employment/i);
    expect(eevPathMismatchMessage('IA', ia)).toBeNull();
  });

  test('requires ID then AU on BC path', () => {
    expect(eevPathMismatchMessage('BC', null)).toMatch(/identity document/i);
    expect(eevPathMismatchMessage('BC', ia)).toMatch(/identity document/i);
    expect(eevPathMismatchMessage('BC', id)).toMatch(/employment authorization/i);
    expect(eevPathMismatchMessage('BC', id, ia)).toMatch(/employment authorization/i);
    expect(eevPathMismatchMessage('BC', id, au)).toBeNull();
  });
});
