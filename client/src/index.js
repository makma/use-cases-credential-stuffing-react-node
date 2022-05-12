import React from 'react';
import ReactDOM from 'react-dom/client';
// import './index.css';
import App from './App';
import { ThemeProvider } from '@material-ui/core';
import { createTheme } from '@material-ui/core/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#FF5D22',
    },
    secondary: {
      main: 'rgba(0, 0, 0, 0.87)',
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider theme={theme}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ThemeProvider>
);
