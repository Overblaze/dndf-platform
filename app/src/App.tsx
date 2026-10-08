import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './lib/auth';
import { ComingSoon } from './pages/ComingSoon';
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
          <Route path="print/:id" element={<PrintPage />} />
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
            <Route path="library" element={<LibraryPage />} />
            <Route path="library/:id" element={<LibraryPage />} />
            <Route
              path="ship"
              element={
                <ComingSoon title="Ship" phase={8}>
                  The ship sheet: components, crew, upgrades, the hold and the voyage calculator.
                </ComingSoon>
              }
            />
            <Route
              path="crew"
              element={
                <ComingSoon title="Crew" phase={8}>
                  Your crewmates, bounties and wanted posters.
                </ComingSoon>
              }
            />
            <Route path="dm" element={<DmPage />} />
            <Route path="*" element={<Navigate to="/sheet" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
