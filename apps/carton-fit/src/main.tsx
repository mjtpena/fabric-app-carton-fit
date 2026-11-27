import { Box, ClipboardList, Info, Layers, Scale, Wind } from 'lucide-react';
import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const icons = [
  <Box className="h-4 w-4" />,
  <Layers className="h-4 w-4" />,
  <Scale className="h-4 w-4" />,
  <Wind className="h-4 w-4" />,
  <ClipboardList className="h-4 w-4" />,
  <Info className="h-4 w-4" />,
];

const nav = config.nav.map((item, i) => ({ ...item, icon: icons[i] }));

mountApp({ ...config, nav }, <App />);
