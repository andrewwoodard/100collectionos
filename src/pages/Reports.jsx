import React from "react";
import { base44 } from "@/api/base44Client";
import { fetchAllProperties } from "@/lib/fetchAllProperties";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import LoadingGrid from "../components/shared/LoadingGrid";

const COLORS = ["#0F172A", "#C9A96E", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#F59E0B", "#EC4899"];

export default function Reports() {
  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: () => base44.entities.Partner.list("-created_date", 500),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: () => fetchAllProperties(),
  });
  const { data: billing = [] } = useQuery({
    queryKey: ["billing"],
    queryFn: () => base44.entities.BillingRecord.list("-created_date", 500),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 500),
  });

  if (isLoading) return <LoadingGrid count={4} />;

  // Partners by status
  const statusCounts = {};
  partners.forEach(p => { statusCounts[p.status || "unknown"] = (statusCounts[p.status || "unknown"] || 0) + 1; });
  const partnerStatusData = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value
  }));

  // Billing by status
  const billCounts = {};
  billing.forEach(b => { billCounts[b.status || "unknown"] = (billCounts[b.status || "unknown"] || 0) + 1; });
  const billingStatusData = Object.entries(billCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value
  }));

  // Properties by market
  const marketCounts = {};
  properties.forEach(p => { if (p.market) marketCounts[p.market] = (marketCounts[p.market] || 0) + 1; });
  const marketData = Object.entries(marketCounts).map(([name, value]) => ({ name, value }));

  // Tasks by status
  const taskCounts = {};
  tasks.forEach(t => { taskCounts[t.status || "unknown"] = (taskCounts[t.status || "unknown"] || 0) + 1; });
  const taskData = Object.entries(taskCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <h2 className="text-xl font-bold text-gray-900">Reports</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Partners by Status */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Partners by Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={partnerStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Billing Status */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Billing Overview</h3>
          <div className="h-64 flex items-center justify-center">
            {billingStatusData.length === 0 ? (
              <p className="text-sm text-gray-400">No billing data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={billingStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {billingStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Properties by Market */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Properties by Market</h3>
          <div className="h-64">
            {marketData.length === 0 ? (
              <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-400">No market data</p></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#C9A96E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tasks by Status */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Tasks by Status</h3>
          <div className="h-64">
            {taskData.length === 0 ? (
              <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-400">No task data</p></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={taskData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {taskData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}