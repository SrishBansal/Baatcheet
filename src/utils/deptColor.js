/** Return visual department color tokens for a department name. */
export function deptColor(department = '') {
  const value = String(department).toLowerCase();
  if (value.includes('eng')) return { tone: 'eng', color: 'var(--dept-eng)', soft: 'var(--dept-eng-soft)' };
  if (value.includes('design')) return { tone: 'design', color: 'var(--dept-design)', soft: 'var(--dept-design-soft)' };
  if (value.includes('product')) return { tone: 'product', color: 'var(--dept-product)', soft: 'var(--dept-product-soft)' };
  if (value.includes('sales')) return { tone: 'sales', color: 'var(--dept-sales)', soft: 'var(--dept-sales-soft)' };
  return { tone: 'general', color: 'var(--dept-general)', soft: 'var(--dept-general-soft)' };
}
