import React from 'react';

export default function PageHeader({ title, subtitle, actions }) {
  return <header className="page-header">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {actions && <div className="page-header__actions">{actions}</div>}
  </header>;
}
