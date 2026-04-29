/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'rgb(var(--app) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--surface-muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        'success-soft': 'rgb(var(--success-soft) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--warning-soft) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        'danger-strong': 'rgb(var(--danger-strong) / <alpha-value>)',
        'danger-soft': 'rgb(var(--danger-soft) / <alpha-value>)',
        workspace: 'rgb(var(--workspace) / <alpha-value>)',
        'workspace-muted': 'rgb(var(--workspace-muted) / <alpha-value>)',
        'workspace-border': 'rgb(var(--workspace-border) / <alpha-value>)',
        'workspace-foreground': 'rgb(var(--workspace-foreground) / <alpha-value>)',
        'workspace-muted-foreground': 'rgb(var(--workspace-muted-foreground) / <alpha-value>)'
      },
      borderRadius: {
        sm: '7px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px'
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      },
      transitionTimingFunction: {
        ui: 'var(--motion-ease-standard)',
        'ui-out': 'var(--motion-ease-out)',
        'ui-in': 'var(--motion-ease-in)',
        'ui-emphasized': 'var(--motion-ease-emphasized)',
        'ui-interactive': 'var(--motion-ease-interactive)'
      },
      animation: {
        in: 'fadeIn var(--motion-duration-medium) var(--motion-ease-out)',
        'zoom-in-95': 'zoomIn var(--motion-duration-medium) var(--motion-ease-out)'
      }
    }
  },
  plugins: []
}
