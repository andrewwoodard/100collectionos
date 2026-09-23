import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RepoSelector from './RepoSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Upload } from 'lucide-react';

export default function GitHubPush({ repos, selectedRepo, onSelectRepo }) {
  const [filePath, setFilePath] = useState('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handlePush = async () => {
    if (!selectedRepo || !filePath || !commitMessage || !content) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await base44.functions.invoke('githubPush', {
        repo: selectedRepo,
        filePath,
        branch,
        commitMessage,
        content,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Push failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <RepoSelector repos={repos} selectedRepo={selectedRepo} onSelectRepo={onSelectRepo} />

      <div className="space-y-1">
        <Label>File Path</Label>
        <Input placeholder="e.g. docs/readme.md" value={filePath} onChange={e => setFilePath(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Branch</Label>
        <Input placeholder="main" value={branch} onChange={e => setBranch(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Commit Message</Label>
        <Input placeholder="Update file" value={commitMessage} onChange={e => setCommitMessage(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>File Content</Label>
        <Textarea
          placeholder="Paste file content here..."
          value={content}
          onChange={e => setContent(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
        />
      </div>

      <Button
        onClick={handlePush}
        disabled={loading || !selectedRepo || !filePath || !commitMessage || !content}
        className="gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Push File
      </Button>

      {result && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          ✓ File pushed successfully.{' '}
          {result.content?.html_url && (
            <a href={result.content.html_url} target="_blank" rel="noreferrer" className="underline">
              View on GitHub
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          Error: {error}
        </div>
      )}
    </div>
  );
}