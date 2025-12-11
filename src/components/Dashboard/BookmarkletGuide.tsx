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
      /* Try to get team name from various places */
      const teamName = document.querySelector('h1')?.textContent?.trim()
        || document.querySelector('[class*="team"]')?.textContent?.trim()
        || document.querySelector('header h1, header h2')?.textContent?.trim()
        || document.title.split('-')[0]?.trim()
        || 'ChatGPT Team';
      
      const members = [];
      
      /* Method 1: Look for email patterns in the page */
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
      const allText = document.body.innerText;
      const foundEmails = [...new Set(allText.match(emailRegex) || [])];
      
      /* Method 2: Find rows/items containing emails */
      const allElements = document.querySelectorAll('tr, [role="row"], [class*="member"], [class*="user"], [class*="row"], li, div[class*="item"]');
      
      allElements.forEach(el => {
        const text = el.innerText || el.textContent || '';
        const emailMatch = text.match(emailRegex);
        if (emailMatch && emailMatch[0]) {
          const email = emailMatch[0];
          /* Get name - usually the text before the email or in a specific element */
          const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
          let name = lines[0] || '';
          if (name.includes('@')) name = email.split('@')[0];
          
          /* Try to find role */
          const lowerText = text.toLowerCase();
          let role = 'member';
          if (lowerText.includes('owner') || lowerText.includes('admin')) role = 'owner';
          else if (lowerText.includes('admin')) role = 'admin';
          
          if (!members.find(m => m.email === email)) {
            members.push({ name: name.substring(0, 100), email, role });
          }
        }
      });
      
      /* Fallback: if no members found via elements, use found emails */
      if (members.length === 0 && foundEmails.length > 0) {
        foundEmails.forEach(email => {
          members.push({ name: email.split('@')[0], email, role: 'member' });
        });
      }
      
      return { teamName, members };
    }
    
    const data = getTeamData();
    
    if (data.members.length === 0) {
      /* Debug mode - show what we can see */
      const debug = 'Page URL: ' + location.href + '\\n\\nVisible emails on page: ' + (document.body.innerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || []).slice(0,5).join(', ');
      alert('No members found.\\n\\n' + debug + '\\n\\nMake sure member emails are visible on the page.');
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
