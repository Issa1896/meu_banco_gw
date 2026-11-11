/**
 * Helpers para query string. O Express (qs) transforma "?status[$ne]=x" em
 * objeto { $ne: 'x' }; usado direto num filtro do Mongo vira injeção de
 * operador. asString descarta tudo que não for string simples.
 */
const asString = (value, maxLength = 200) => (
  typeof value === 'string' && value.length <= maxLength ? value : undefined
);

/** Paginação com teto: ?limit=1000000 não derruba o banco. */
const pagination = (q, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(parseInt(asString(q.page), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(asString(q.limit), 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

/** Escapa texto para uso seguro em $regex (evita ReDoS / regex arbitrária). */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { asString, pagination, escapeRegex };
