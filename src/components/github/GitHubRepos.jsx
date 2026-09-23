import React from 'react';
import { Star, GitFork, Circle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export default function GitHubRepos({ repos, onSelectRepo, selectedRepo }) {
  if (!repos || repos.length === 0) {
    return <p className="text-slate-500 text-sm">No repositories found.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {repos.map((repo) => (
        <div
          key={repo.id}
          onClick={() => onSelectRepo(repo)}
          className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${
            selectedRepo?.id === repo.id ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="font-semibold text-slate-800 truncate">{repo.name}</div>
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-slate-400 hover:text-slate-700 shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {repo.description && (
            <p className="text-xs text-slate-500 mb-3 line-clamp-2">{repo.description}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            {repo.language && (
              <span className="flex items-center gap-1">
                <Circle className="w-2.5 h-2.5 fill-current text-blue-500" />
                {repo.language}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              {repo.stargazers_count}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="w-3 h-3" />
              {repo.forks_count}
            </span>
            {repo.private && <Badge variant="outline" className="text-xs py-0">Private</Badge>}
          </div>

          <div className="mt-2 text-xs text-slate-400">
            Updated {formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })}
          </div>
        </div>
      ))}
    </div>
  );
}