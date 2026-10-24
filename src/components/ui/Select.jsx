import React from 'react';
import './Select.css';

/**
 * Reusable select dropdown component.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.id]
 * @param {string} [props.name]
 * @param {string} [props.value]
 * @param {function} [props.onChange]
 * @param {{ value: string, label: string }[]} props.options
 * @param {boolean} [props.required=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.error]
 * @param {string} [props.placeholder]
 * @param {string} [props.className]
 */
export default function Select({
  label,
  id,
  name,
  value,
  onChange,
  options = [],
  required = false,
  disabled = false,
  error,
  placeholder,
  className = '',
  ...rest
}) {
  const selectId = id || name || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={selectId} className="input__label">
          {label}
          {required && <span className="input__required" aria-label="required"> *</span>}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        className={`select__field ${error ? 'select__field--error' : ''}`}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="input__error" role="alert">{error}</p>
      )}
    </div>
  );
}
