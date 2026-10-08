import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import { BuildPage } from './pages/BuildPage';
import { ShipPage } from './ship/ShipPage';
import { CrewPage } from './pages/CrewPage';
import { DmPage } from './pages/DmPage';
import { LibraryPage } from './pages/LibraryPage';
import { PrintPage } from './pages/PrintPage';
import { SheetPage } from './pages/SheetPage';

export function App() {
  return (
    <AuthProvider>
      {/* Hash routes ("#/sheet") work on GitHub Pages without server rewrites. */}
      <HashRouter>
        <Routes>
          {/* The printable sheet stands alone: no menu, nothing but the paper. */}
          <Route path="print/:id" element={<ErrorBoundary where="the printable sheet"><PrintPage /></ErrorBoundary>} />
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/sheet" replace />} />
            <Route path="sheet" element={<SheetPage />} />
            <Route path="sheet/:id" element={<SheetPage />} />
            <Route path="build" element={<ErrorBoundary where="the Build page"><BuildPage /></ErrorBoundary>} />
            <Route path="library" element={<ErrorBoundary where="the Library"><LibraryPage /></ErrorBoundary>} />
            <Route path="library/:id" element={<ErrorBoundary where="the Library"><LibraryPage /></ErrorBoundary>} />
            <Route path="ship" element={<ErrorBoundary where="the Ship page"><ShipPage /></ErrorBoundary>} />
            <Route path="ship/:id" element={<ErrorBoundary where="the ship sheet"><ShipPage /></ErrorBoundary>} />
            <Route path="crew" element={<ErrorBoundary where="the Crew page"><CrewPage /></ErrorBoundary>} />
            <Route path="dm" element={<ErrorBoundary where="the DM page"><DmPage /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/sheet" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
