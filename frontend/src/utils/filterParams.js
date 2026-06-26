export const serializeFilterValues = (values) => {
  if (!Array.isArray(values) || !values.length) return '';
  return JSON.stringify(values);
};

export const buildFilterParams = (filters = {}, filterDefMap = {}) => Object.entries(filters || {}).reduce((accumulator, [fieldKey, values]) => {
  if (!Array.isArray(values) || !values.length) return accumulator;
  const filterDef = filterDefMap?.[fieldKey] || {};
  const param = filterDef.param || `${fieldKey}_in`;
  accumulator[param] = serializeFilterValues(values);
  return accumulator;
}, {});
