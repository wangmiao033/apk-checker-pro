import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07111f',
        panel: '#0b1220',
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          500: '#2b7fff',
          600: '#155ee8',
          700: '#114bbc'
        }
      },
      boxShadow: {
        glass: '0 20px 60px rgba(2, 6, 23, 0.12)',
        glow: '0 24px 80px rgba(43, 127, 255, 0.24)',
      },
      backgroundImage: {
        'radial-blue': 'radial-gradient(circle at top left, rgba(43,127,255,.22), transparent 36%)',
        'radial-purple': 'radial-gradient(circle at top right, rgba(124,58,237,.18), transparent 28%)'
      }
    }
  },
  plugins: []
}
export default config
