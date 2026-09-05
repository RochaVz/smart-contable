const sizeClass = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

const iconSizeClass = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-9 w-9',
};

const SmartContableMark = ({ size = 'md', className = '' }) => (
  <div
    className={`smartcontable-mark relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-400 text-white shadow-lg shadow-blue-900/20 ${sizeClass[size] || sizeClass.md} ${className}`}
    aria-hidden="true"
  >
    <svg
      className={iconSizeClass[size] || iconSizeClass.md}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.25 26.5V9.2c0-.94.76-1.7 1.7-1.7h10.1c.94 0 1.7.76 1.7 1.7v17.3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 26.5h19"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M13 12h6M13 16h6M13 20h2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19.25 21.2h4.05v4.05h-4.05z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M20.45 23.25h1.65M21.28 22.43v1.65"
        stroke="#0f766e"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
    <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-white/25" />
  </div>
);

export default SmartContableMark;