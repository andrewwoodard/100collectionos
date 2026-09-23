import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { GitPullRequest, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import RepoSelector from './RepoSelector';

export default function GitHubPulls({ repos, selectedRepo, onSelectRepo }) {
  const [pulls, setPulls] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedRepo) loadPulls(selectedRepo);
  }, [selectedRepo]);

  const loadPulls = async (repo) => {
    setLoading(true);
    const res = await base44.functions.invoke('githubData', {
      type: 'pulls',
      owner: repo.owner.login,
      repo: repo.name,
    });
    setPulls(Array.isArray(res.data.pulls) ? res.data.pulls : []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <RepoSelector repos={repos} selectedRepo={selectedRepo} onSelect={onSelectRepo} />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : pulls.length === 0 ? (
        <p className="text-slate-500 text-sm">No open pull requests.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {pulls.map((pr) => (
            <div key={pr.id} className="flex items-start gap-3 p-4 hover:bg-slate-50">
              <GitPullRequest className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={pr.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-800 hover:text-slate-600 truncate"
                  >
                    {pr.title}
                  </a>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  #{pr.number} by {pr.user?.login} · opened {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs py-0">{pr.head.ref} → {pr.base.ref}</Badge>
                  {pr.draft && <Badge variant="secondary" className="text-xs py-0">Draft</Badge>}
                </div>
              </div>
              <div className="text-xs text-slate-400 shrink-0">
                +{pr.additions ?? '?'} / -{pr.deletions ?? '?'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}