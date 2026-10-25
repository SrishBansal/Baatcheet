import React from 'react';

export default function DataTable({ children, label }) {
  return <div className="data-table" role="region" aria-label={label}>{children}</div>;
}
