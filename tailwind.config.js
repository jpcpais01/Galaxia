/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        mono: ['"Share Tech Mono"', 'monospace'],
      },
      colors: {
        space: {
          900: '#00000f',
          800: '#050510',
          700: '#0a0a1a',
          600: '#0f0f2a',
          500: '#1a1a3a',
          400: '#2a2a5a',
          300: '#3a3a7a',
        },
        star: {
          yellow: '#FFE066',
          red: '#FF5566',
          blue: '#88AAFF',
          orange: '#FF8844',
          white: '#FFFFFF',
        },
        accent: {
          cyan: '#00FFFF',
          green: '#00FF88',
          purple: '#AA44FF',
          gold: '#FFD700',
          pink: '#FF44AA',
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 10px #00FFFF, 0 0 20px #00FFFF44',
        'glow-gold': '0 0 10px #FFD700, 0 0 20px #FFD70044',
        'glow-red': '0 0 10px #FF5566, 0 0 20px #FF556644',
        'glow-green': '0 0 10px #00FF88, 0 0 20px #00FF8844',
        'pixel': '2px 2px 0 #000, -1px -1px 0 #000',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin 20s linear infinite',
        'twinkle': 'twinkle 2s ease-in-out infinite alternate',
        'scan': 'scan 4s linear infinite',
      },
      keyframes: {
        twinkle: {
          '0%': { opacity: '0.3' },
          '100%': { opacity: '1' },
        },
        scan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100%' },
        },
      },
    },
  },
  plugins: [],
};
