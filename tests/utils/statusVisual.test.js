import { describe, expect, it } from 'vitest';
import { statusVisual } from '../../src/utils/statusVisual.js';

describe('statusVisual', () => {
  it('maps all four assessment categories and unknown values deterministically', () => {
    expect(statusVisual('Demonstrated')).toEqual({ widthPercent: 100, tone: 'success' });
    expect(statusVisual('Partially demonstrated')).toEqual({ widthPercent: 55, tone: 'warning' });
    expect(statusVisual('Insufficient evidence')).toEqual({ widthPercent: 25, tone: 'warning' });
    expect(statusVisual('Not assessed')).toEqual({ widthPercent: 0, tone: 'neutral' });
    expect(statusVisual('Unknown')).toEqual({ widthPercent: 0, tone: 'neutral' });
  });
});
