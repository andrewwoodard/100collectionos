import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { GitCommitHorizontal, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import RepoSelector from './RepoSelector';

export default function GitHubCommits({ repos, selectedRepo, onSelectRepo }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedRepo) loadCommits(selectedRepo);
  }, [selectedRepo]);

  const loadCommits = async (repo) => {
    setLoading(true);
    const res = await base44.functions.invoke('githubData', {
      type: 'commits',
      owner: repo.owner.login,
      repo: repo.name,
    });
    setCommits(Array.isArray(res.data.commits) ? res.data.commits : []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <RepoSelector repos={repos} selectedRepo={selectedRepo} onSelect={onSelectRepo} />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : commits.length === 0 ? (
        <p className="text-slate-500 text-sm">No commits found.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {commits.map((commit) => (
            <div key={commit.sha} className="flex items-start gap-3 p-4 hover:bg-slate-50">
              <GitCommitHorizontal className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={commit.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-800 hover:text-slate-600 truncate"
                  >
                    {commit.commit.message.split('\n')[0]}
                  </a>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {commit.author?.login || commit.commit.author?.name} ·{' '}
                  {formatDistanceToNow(new Date(commit.commit.author.date), { addSuffix: true })}
                </div>
              </div>
              <span className="text-xs font-mono text-slate-400 shrink-0">{commit.sha.slice(0, 7)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}