import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RepoSelector from './RepoSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react';

export default function GitHubBulkPush({ repos, selectedRepo, onSelectRepo }) {
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleBulkPush = async () => {
    if (!selectedRepo) return;
    setLoading(true);
    setResults(null);
    setError(null);
    try {
      const res = await base44.functions.invoke('githubBulkPush', {
        repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
        branch,
      });
      setResults(res.data);
    } catch (err) {
      setError(err.message || 'Bulk push failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Bulk Push All Data</h2>
        <p className="text-sm text-slate-500 mt-1">
          Exports all app entity data as JSON files into a <code className="bg-slate-100 px-1 rounded">data/</code> folder in your selected repository.
        </p>
      </div>

      <RepoSelector repos={repos} selectedRepo={selectedRepo} onSelectRepo={onSelectRepo} />

      <div className="space-y-1">
        <Label>Branch</Label>
        <Input placeholder="main" value={branch} onChange={e => setBranch(e.target.value)} />
      </div>

      <Button
        onClick={handleBulkPush}
        disabled={loading || !selectedRepo}
        className="gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {loading ? 'Pushing all entities...' : 'Push All Entity Data'}
      </Button>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          Error: {error}
        </div>
      )}

      {results && (
        <div className="space-y-2">
          {results.results?.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Successfully Pushed ({results.results.length})
              </div>
              <div className="divide-y divide-slate-100">
                {results.results.map(r => (
                  <div key={r.entity} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="font-medium text-slate-700">{r.entity}</span>
                    <span className="text-slate-400 ml-auto">{r.count} records</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.errors?.length > 0 && (
            <div className="border border-red-200 rounded-xl overflow-hidden">
              <div className="bg-red-50 px-4 py-2 text-xs font-semibold text-red-500 uppercase tracking-wide">
                Failed ({results.errors.length})
              </div>
              <div className="divide-y divide-red-100">
                {results.errors.map(r => (
                  <div key={r.entity} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="font-medium text-slate-700">{r.entity}</span>
                    <span className="text-red-400 text-xs ml-auto truncate max-w-[200px]">{r.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}