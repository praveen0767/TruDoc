import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { StatusBar } from './StatusBar';
import { SearchModal } from '../modals/SearchModal';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-on-surface">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 h-full bg-surface-container-lowest"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Viewport Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <Topbar
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-surface">
          <Outlet />
        </main>

        {/* Persistent Bottom Telemetry Status Bar */}
        <StatusBar />
      </div>

      {/* Global Cmd + K Search Modal */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
