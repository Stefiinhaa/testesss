import { resolveApiBaseUrl } from './baseUrlResolver';
import { isUnexpectedHtmlPayload } from './responseGuards';

describe('apiConfig', () => {
  it('usa /api quando não há configuração de ambiente', () => {
    expect(resolveApiBaseUrl()).toBe('/api');
  });

  it('mantém caminhos relativos de API', () => {
    expect(resolveApiBaseUrl({ envValue: '/api' })).toBe('/api');
    expect(resolveApiBaseUrl({ envValue: '/api/' })).toBe('/api');
  });

  it('evita mixed content quando VITE_API_URL vem com http em página https', () => {
    const baseUrl = resolveApiBaseUrl({
      envValue: 'https://fulleduca.fulltime.com.br',
      locationOrigin: 'https://fulleduca.fulltime.com.br',
      locationProtocol: 'https:',
    });
    expect(baseUrl).toBe('/api');
  });

  it('preserva base absoluta quando host é diferente', () => {
    const baseUrl = resolveApiBaseUrl({
      envValue: 'https://api.example.com/v1',
      locationOrigin: 'https://fulleduca.fulltime.com.br',
      locationProtocol: 'https:',
    });
    expect(baseUrl).toBe('https://api.example.com/v1');
  });

  it('marca como inválida resposta HTML em endpoint de API', () => {
    expect(isUnexpectedHtmlPayload({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: '<!DOCTYPE html><html><head></head><body>fallback</body></html>',
    })).toBe(true);
  });

  it('não marca JSON válido como resposta inesperada', () => {
    expect(isUnexpectedHtmlPayload({
      headers: { 'content-type': 'application/json; charset=utf-8' },
      data: { items: [{ id: 1 }] },
    })).toBe(false);
  });
});
