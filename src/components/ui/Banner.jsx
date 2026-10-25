import React from 'react';

export default function Banner({ tone = 'info', children, actions }) {
  return <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <span>{children}</span>{actions && <span className="banner__actions">{actions}</span>}
  </div>;
}
