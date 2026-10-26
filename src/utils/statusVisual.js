// Deterministic display mapping of the four assessment categories — NOT a model-generated score.
export function statusVisual(status) {
  const normalized = String(status || '').trim().toLowerCase();
  const visuals = {
    demonstrated: { widthPercent: 100, tone: 'success' },
    'partially demonstrated': { widthPercent: 55, tone: 'warning' },
    partial: { widthPercent: 55, tone: 'warning' },
    'insufficient evidence': { widthPercent: 25, tone: 'warning' },
    insufficient: { widthPercent: 25, tone: 'warning' },
    'not assessed': { widthPercent: 0, tone: 'neutral' },
    not_assessed: { widthPercent: 0, tone: 'neutral' },
  };
  return visuals[normalized] || { widthPercent: 0, tone: 'neutral' };
}
