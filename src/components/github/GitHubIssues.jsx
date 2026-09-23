import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CircleDot, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import RepoSelector from './RepoSelector';

export default function GitHubIssues({ repos, selectedRepo, onSelectRepo }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedRepo) loadIssues(selectedRepo);
  }, [selectedRepo]);

  const loadIssues = async (repo) => {
    setLoading(true);
    const res = await base44.functions.invoke('githubData', {
      type: 'issues',
      owner: repo.owner.login,
      repo: repo.name,
    });
    // Filter out pull requests (GitHub issues API returns both)
    setIssues(Array.isArray(res.data.issues) ? res.data.issues.filter(i => !i.pull_request) : []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <RepoSelector repos={repos} selectedRepo={selectedRepo} onSelect={onSelectRepo} />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : issues.length === 0 ? (
        <p className="text-slate-500 text-sm">No open issues.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-start gap-3 p-4 hover:bg-slate-50">
              <CircleDot className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-800 hover:text-slate-600 truncate"
                  >
                    {issue.title}
                  </a>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  #{issue.number} opened {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })} by {issue.user?.login}
                </div>
                {issue.labels?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {issue.labels.map(label => (
                      <span
                        key={label.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `#${label.color}22`, color: `#${label.color}` }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}