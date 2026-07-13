const typeMatches = (value, type) => {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
};

export function validateJsonSchema(value, schema, pointer = '$') {
  const errors = [];
  if (schema.const !== undefined && value !== schema.const) errors.push(`${pointer} must equal schema const`);
  if (schema.type && !typeMatches(value, schema.type)) return [`${pointer} must be ${schema.type}`];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${pointer} is shorter than minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${pointer} does not match pattern`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${pointer} is below minimum`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${pointer} has fewer than minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${pointer} has more than maxItems`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items, `${pointer}[${index}]`)));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!Object.hasOwn(value, required)) errors.push(`${pointer}.${required} is required`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(value[key], child, `${pointer}.${key}`));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${pointer}.${key} is not allowed`);
    }
  }
  return errors;
}
