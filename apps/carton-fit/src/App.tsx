import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { AirBillPage } from './pages/AirBillPage';
import { CartonRackPage } from './pages/CartonRackPage';
import { HomePage } from './pages/HomePage';
import { ReorderSlipPage } from './pages/ReorderSlipPage';
import { WeighInPage } from './pages/WeighInPage';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell immersive>
            <HomePage />
          </AppShell>
        }
      />
      <Route
        path="/rack"
        element={
          <AppShell>
            <CartonRackPage />
          </AppShell>
        }
      />
      <Route
        path="/weigh-in"
        element={
          <AppShell>
            <WeighInPage />
          </AppShell>
        }
      />
      <Route
        path="/air-bill"
        element={
          <AppShell>
            <AirBillPage />
          </AppShell>
        }
      />
      <Route
        path="/reorder"
        element={
          <AppShell>
            <ReorderSlipPage />
          </AppShell>
        }
      />
      <Route
        path="/about"
        element={
          <AppShell>
            <AboutPage />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
