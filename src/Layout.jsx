import React, { useState } from "react";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";

const pageTitles = {
  Dashboard: "Dashboard",
  Partners: "Partners",
  Properties: "Properties",
  Onboarding: "Onboarding Pipeline",
  Documents: "Document Center",
  MediaLibrary: "Media Library",
  Billing: "Billing",
  Tasks: "Tasks",
  ActivityFeed: "Activity Feed",
  Reports: "Reports",
  Settings: "Settings",
  PartnerDetail: "Partner Detail",
  PropertyDetail: "Property Detail",
  PartnerFunnelTracker: "Partner Funnel Tracker",
  Destinations: "Destinations",
};

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      <Sidebar
        currentPage={currentPageName}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="lg:ml-[240px] transition-all duration-300">
        <TopBar
          title={pageTitles[currentPageName] || currentPageName}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}