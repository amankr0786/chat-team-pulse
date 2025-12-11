import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, BookMarked, Zap, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function BookmarkletGuide() {
  const [copied, setCopied] = useState(false);

  const bookmarkletCode = `javascript:(function(){
    const API_URL = '${SUPABASE_URL}/functions/v1/sync-team';
    
    function getTeamData() {
      const teamName = document.querySelector('[data-testid="team-name"]')?.textContent 
        || document.querySelector('.team-name')?.textContent
        || document.querySelector('h1')?.textContent?.trim()
        || 'Unknown Team';
      
      const memberRows = document.querySelectorAll('table tbody tr, [role="row"]');
      const members = [];
      
      memberRows.forEach(row => {
        const cells = row.querySelectorAll('td, [role="cell"]');
        if (cells.length >= 2) {
          const name = cells[0]?.textContent?.trim();
          const email = cells[1]?.textContent?.trim();
          const role = cells[2]?.textContent?.trim() || 'member';
          if (email && email.includes('@')) {
            members.push({ name, email, role: role.toLowerCase() });
          }
        }
      });
      
      return { teamName, members };
    }
    
    const data = getTeamData();
    
    if (data.members.length === 0) {
      alert('No members found on this page. Make sure you are on the ChatGPT Team admin members page.');
      return;
    }
    
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
      if (result.success) {
        alert('✅ Synced ' + data.members.length + ' members from "' + data.teamName + '"');
      } else {
        alert('❌ Sync failed: ' + (result.error || 'Unknown error'));
      }
    })
    .catch(err => alert('❌ Sync failed: ' + err.message));
  })();`;

  const minifiedBookmarklet = bookmarkletCode.replace(/\s+/g, ' ').trim();

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(minifiedBookmarklet);
    setCopied(true);
    toast.success('Bookmarklet copied! Now create a bookmark and paste this as the URL.');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-primary" />
          <CardTitle>Sync Bookmarklet</CardTitle>
          <Badge variant="secondary">Setup Required</Badge>
        </div>
        <CardDescription>
          Use this bookmarklet to capture team data directly from ChatGPT admin pages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="setup">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="usage">How to Use</TabsTrigger>
          </TabsList>
          
          <TabsContent value="setup" className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                <p>Click the button below to copy the bookmarklet code</p>
              </div>
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                <p>Create a new bookmark in your browser (Ctrl/Cmd + D)</p>
              </div>
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                <p>Edit the bookmark and paste the code as the URL</p>
              </div>
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                <p>Name it something like "Sync ChatGPT Team"</p>
              </div>
            </div>
            
            <Button onClick={copyBookmarklet} className="w-full" size="lg">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Bookmarklet Code
                </>
              )}
            </Button>
          </TabsContent>
          
          <TabsContent value="usage" className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <Zap className="h-5 w-5 text-warning shrink-0" />
                <p>Go to your ChatGPT Team admin page and navigate to the <strong>Members</strong> section</p>
              </div>
              <div className="flex gap-3">
                <Zap className="h-5 w-5 text-warning shrink-0" />
                <p>Click the "Sync ChatGPT Team" bookmark in your toolbar</p>
              </div>
              <div className="flex gap-3">
                <Zap className="h-5 w-5 text-warning shrink-0" />
                <p>The bookmarklet will capture member data and sync it to this dashboard</p>
              </div>
              <div className="flex gap-3">
                <Zap className="h-5 w-5 text-warning shrink-0" />
                <p>Repeat for each of your ChatGPT Team workspaces</p>
              </div>
            </div>
            
            <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              <strong>Tip:</strong> The bookmarklet reads the visible member table on the page. Make sure all members are visible (scroll or expand the list if needed).
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
