import { forwardRef } from 'react';

const VARIANT_CLASS = {
  primary: 'btn-ui--primary',
  success: 'btn-ui--success',
  warning: 'btn-ui--warning',
  danger: 'btn-ui--danger',
  info: 'btn-ui--info',
  secondary: 'btn-ui--secondary',
  ghost: 'btn-ui--ghost',
  violet: 'btn-ui--violet',
  cyan: 'btn-ui--cyan',
};

const SIZE_CLASS = {
  sm: 'btn-ui--sm',
  md: 'btn-ui--md',
  lg: 'btn-ui--lg',
};

/**
 * Botón unificado SmartContable (raised / pressed + gradientes).
 */
const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    type = 'button',
    variant = 'primary',
    size = 'md',
    block = false,
    className = '',
    disabled = false,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    'btn-ui',
    'font-display',
    VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
    SIZE_CLASS[size] || SIZE_CLASS.md,
    block ? 'btn-ui--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const sharedProps = {
    ref,
    className: classes,
    disabled: Component === 'button' ? disabled : undefined,
    'aria-disabled': disabled || undefined,
    ...rest,
  };

  if (Component === 'button') {
    return (
      <button type={type} {...sharedProps}>
        {children}
      </button>
    );
  }

  return <Component {...sharedProps}>{children}</Component>;
});

export default Button;
