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
    className={`smartcontable-mark relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-500/30 text-white shadow-xl shadow-blue-900/30 ${sizeClass[size] || sizeClass.md} ${className}`}
    aria-hidden="true"
  >
    <svg
      className={iconSizeClass[size] || iconSizeClass.md}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="markTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="markBottom" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Ala Superior S */}
      <path
        d="M10 8h9a5 5 0 0 1 5 5c0 2.76-2.24 5-5 5h-5a3 3 0 0 0-3 3v2l-3-3V10a2 2 0 0 1 2-2z"
        fill="url(#markTop)"
      />

      {/* Ala Inferior S */}
      <path
        d="M22 24h-9a5 5 0 0 1-5-5c0-2.76 2.24-5 5-5h5a3 3 0 0 0 3-3v-2l3 3v10a2 2 0 0 1-2 2z"
        fill="url(#markBottom)"
      />

      {/* Líneas de registro contable */}
      <rect x="12" y="10.5" width="5" height="1.2" rx="0.6" fill="#ffffff" opacity="0.8" />
      <rect x="15" y="20.3" width="5" height="1.2" rx="0.6" fill="#ffffff" opacity="0.8" />

      {/* Destello AI */}
      <circle cx="24.5" cy="7.5" r="1.5" fill="#38bdf8" />
    </svg>
    <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-blue-400/10 pointer-events-none" />
  </div>
);

export default SmartContableMark;