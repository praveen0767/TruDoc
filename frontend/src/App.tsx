/**
 * TruDoc — Trusted Document Intelligence
 * App Router with Full Navigation Hierarchy
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GlobalErrorBoundary } from './components/common/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentIntakePage } from './pages/DocumentIntakePage';
import { DocumentWorkspacePage } from './pages/DocumentWorkspacePage';
import { CasesPage } from './pages/CasesPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { ReviewWorkspacePage } from './pages/ReviewWorkspacePage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { EvidencePage } from './pages/EvidencePage';
import { RunsPage } from './pages/RunsPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { SystemPage } from './pages/SystemPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <GlobalErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/new" element={<DocumentIntakePage />} />
          <Route path="/documents/:id" element={<DocumentWorkspacePage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/reviews/:id" element={<ReviewWorkspacePage />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
          <Route path="/evidence" element={<EvidencePage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}
