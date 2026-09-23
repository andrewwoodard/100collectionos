/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import Partners from './pages/Partners';
import Properties from './pages/Properties';
import Documents from './pages/Documents.jsx';
import Tasks from './pages/Tasks';
import Billing from './pages/Billing';

import MediaLibrary from './pages/MediaLibrary';
import ActivityFeed from './pages/ActivityFeed';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import PartnerDetail from './pages/PartnerDetail';
import PropertyDetail from './pages/PropertyDetail';
import PartnerFunnelTracker from './pages/PartnerFunnelTracker';
import PartnerReport from './pages/PartnerReport';
import Analytics from './pages/Analytics';
import FinanceAlerts from './pages/FinanceAlerts';
import LeadershipSummary from './pages/LeadershipSummary';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Partners": Partners,
    "Properties": Properties,
    "Documents": Documents,
    "Tasks": Tasks,
    "Billing": Billing,

    "MediaLibrary": MediaLibrary,
    "ActivityFeed": ActivityFeed,
    "Reports": Reports,
    "Settings": Settings,
    "PartnerDetail": PartnerDetail,
    "PropertyDetail": PropertyDetail,
    "PartnerFunnelTracker": PartnerFunnelTracker,
    "PartnerReport": PartnerReport,
    "Analytics": Analytics,
    "FinanceAlerts": FinanceAlerts,
    "LeadershipSummary": LeadershipSummary,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};