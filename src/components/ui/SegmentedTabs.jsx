import React from 'react';

export default function SegmentedTabs({ items, value, onChange, label }) {
  return <div className="segmented-tabs" role="tablist" aria-label={label}>
    {items.map((item) => <button
      key={item.value}
      type="button"
      role="tab"
      aria-selected={value === item.value}
      className={value === item.value ? 'segmented-tabs__tab segmented-tabs__tab--active' : 'segmented-tabs__tab'}
      onClick={() => onChange(item.value)}
    >{item.label}</button>)}
  </div>;
}
