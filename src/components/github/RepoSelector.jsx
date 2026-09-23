import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function RepoSelector({ repos, selectedRepo, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 shrink-0">Repository:</span>
      <Select
        value={selectedRepo?.full_name || ''}
        onValueChange={(val) => {
          const repo = repos.find(r => r.full_name === val);
          if (repo) onSelect(repo);
        }}
      >
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Select a repository" />
        </SelectTrigger>
        <SelectContent>
          {repos.map(repo => (
            <SelectItem key={repo.id} value={repo.full_name}>
              {repo.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}