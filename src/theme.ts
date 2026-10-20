import { createTheme } from '@mui/material/styles'

const line = '#e3dcd0'

export const theme = createTheme({
  palette: {
    primary: { main: '#1f6b4a' },
    error: { main: '#8d2f2f' },
    text: { primary: '#1d1a16', secondary: '#645d54' },
    background: { default: '#f3f0e8', paper: '#fffdf8' },
    divider: line,
  },
  spacing: 6,
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Segoe UI", sans-serif',
    fontSize: 14,
    h1: {
      fontFamily: 'Georgia, "Iowan Old Style", serif',
      fontWeight: 600,
      fontSize: '1.7rem',
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: 'Georgia, "Iowan Old Style", serif',
      fontWeight: 600,
      fontSize: '1.15rem',
      lineHeight: 1.2,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f3f0e8' },
      },
    },
    MuiButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { textTransform: 'none' },
        outlined: { borderColor: line },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', margin: 'dense' },
    },
    MuiFormControl: {
      defaultProps: { size: 'small', margin: 'dense' },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
    },
    MuiCheckbox: {
      defaultProps: { size: 'small' },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 32 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 32, padding: '6px 10px', fontSize: '0.8125rem' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { padding: '2px 10px', fontSize: '0.8125rem' },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: 8, '&:last-child': { paddingBottom: 8 } },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: 'Georgia, "Iowan Old Style", serif',
          fontWeight: 600,
          fontSize: '1.05rem',
          padding: '12px 16px 6px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { padding: '8px 16px' },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '8px 16px 12px' },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: { minHeight: 36, '&.Mui-expanded': { minHeight: 36 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: line },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
})
