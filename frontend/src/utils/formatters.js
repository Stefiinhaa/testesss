export const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

export const parsePhoneParts = (value, ddi = '55') => {
  const digits = digitsOnly(value);
  if (!digits) {
    return { ddi: ddi || '55', ddd: '', number: '' };
  }
  if (digits.length >= 10) {
    return {
      ddi: ddi || '55',
      ddd: digits.slice(0, 2),
      number: digits.slice(2),
    };
  }
  return {
    ddi: ddi || '55',
    ddd: '',
    number: digits,
  };
};

export const buildLocalPhone = ({ ddd, number }) => {
  const normalizedDdd = digitsOnly(ddd).slice(0, 4);
  const normalizedNumber = digitsOnly(number).slice(0, 12);
  return `${normalizedDdd}${normalizedNumber}` || '';
};

export const buildInternationalPhone = ({ ddi, ddd, number }) => {
  const normalizedDdi = digitsOnly(ddi).slice(0, 4) || '55';
  const local = buildLocalPhone({ ddd, number });
  return local ? `${normalizedDdi}${local}` : '';
};

export const maskInternalId = (value, prefix = 'Ref') => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 4) return `${prefix} ${raw}`;
  return `${prefix} ${raw.slice(-4)}`;
};

export const formatCpf = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

export const formatCep = (value) => {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export const formatDateBR = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const datePart = raw.split('T')[0];
  const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return raw;
  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
};

export const maskDateBRInput = (value) => {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const normalizeDateToIso = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brMatch) return null;
  return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
};

export const toSortableDateValue = (value) => {
  const normalized = normalizeDateToIso(value);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

export const formatPhoneBR = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const buildWhatsAppHref = (value) => {
  const digits = typeof value === 'object' && value !== null
    ? buildInternationalPhone(value)
    : digitsOnly(value);
  if (!digits) return '';
  const normalized = digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
};
