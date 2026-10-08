import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import { ComingSoon } from './pages/ComingSoon';
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
            <Route
              path="build"
              element={
                <ComingSoon title="Build" phase={4}>
                  The new character wizard, level up, and the build editor for swapping, adding and inventing features.
                </ComingSoon>
              }
            />
            <Route path="library" element={<ErrorBoundary where="the Library"><LibraryPage /></ErrorBoundary>} />
            <Route path="library/:id" element={<ErrorBoundary where="the Library"><LibraryPage /></ErrorBoundary>} />
            <Route
              path="ship"
              element={
                <ComingSoon title="Ship" phase={8}>
                  The ship sheet: components, crew, upgrades, the hold and the voyage calculator.
                </ComingSoon>
              }
            />
            <Route path="crew" element={<ErrorBoundary where="the Crew page"><CrewPage /></ErrorBoundary>} />
            <Route path="dm" element={<ErrorBoundary where="the DM page"><DmPage /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/sheet" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
