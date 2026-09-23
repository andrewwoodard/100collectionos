import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GitHubRepos from '@/components/github/GitHubRepos';
import GitHubIssues from '@/components/github/GitHubIssues';
import GitHubPulls from '@/components/github/GitHubPulls';
import GitHubCommits from '@/components/github/GitHubCommits';
import GitHubPush from '@/components/github/GitHubPush';
import GitHubBulkPush from '@/components/github/GitHubBulkPush';
import { Github, Loader2 } from 'lucide-react';

export default function GitHub() {
  const [githubUser, setGithubUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRes, reposRes] = await Promise.all([
        base44.functions.invoke('githubData', { type: 'user' }),
        base44.functions.invoke('githubData', { type: 'repos' }),
      ]);
      setGithubUser(userRes.data.user);
      const repoList = reposRes.data.repos || [];
      setRepos(repoList);
      if (repoList.length > 0) setSelectedRepo(repoList[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-500">Error: {error}</div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center">
          <Github className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">GitHub</h1>
          {githubUser && (
            <p className="text-sm text-slate-500">
              Connected as <span className="font-medium text-slate-700">@{githubUser.login}</span> · {repos.length} repos
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="repos">
        <TabsList className="mb-4">
          <TabsTrigger value="repos">Repositories</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="pulls">Pull Requests</TabsTrigger>
          <TabsTrigger value="commits">Commits</TabsTrigger>
          <TabsTrigger value="push">Push File</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Push</TabsTrigger>
        </TabsList>

        <TabsContent value="repos">
          <GitHubRepos repos={repos} onSelectRepo={setSelectedRepo} selectedRepo={selectedRepo} />
        </TabsContent>

        <TabsContent value="issues">
          <GitHubIssues repos={repos} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />
        </TabsContent>

        <TabsContent value="pulls">
          <GitHubPulls repos={repos} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />
        </TabsContent>

        <TabsContent value="commits">
          <GitHubCommits repos={repos} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />
        </TabsContent>

        <TabsContent value="push">
          <GitHubPush repos={repos} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />
        </TabsContent>

        <TabsContent value="bulk">
          <GitHubBulkPush repos={repos} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}