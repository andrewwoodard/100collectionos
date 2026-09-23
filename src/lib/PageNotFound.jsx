import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C9A96E] to-[#A68B4B] flex items-center justify-center text-white font-bold text-xl mb-6">
        404
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
      <p className="text-sm text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
      <Link to={createPageUrl("Dashboard")}>
        <Button className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
          <Home className="w-4 h-4 mr-2" /> Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}