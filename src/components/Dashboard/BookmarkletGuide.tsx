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

  const API_URL = `https://cpmtbnsujfdumwdmsdrc.supabase.co/functions/v1/sync-team`;

  const bookmarkletCode = `javascript:(function(){
    const API_URL = '${API_URL}';
    
    console.log('[TeamSync] Starting sync...');
    console.log('[TeamSync] API URL:', API_URL);
    
    function getTeamData() {
      /* Try to get team name from page title or heading */
      let teamName = 'ChatGPT Team';
      const titleMatch = document.title.match(/Admin|Members/i);
      if (titleMatch) {
        /* Extract workspace name from URL or page */
        const urlMatch = location.pathname.match(/\\/admin/);
        teamName = document.querySelector('h1')?.textContent?.trim() || 
                   document.querySelector('[data-testid]')?.textContent?.trim() ||
                   'ChatGPT Team ' + new Date().toISOString().slice(0,10);
      }
      
      const members = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
      
      /* Scan all text for emails */
      const allText = document.body.innerText;
      const foundEmails = [...new Set(allText.match(emailRegex) || [])];
      
      console.log('[TeamSync] Found emails:', foundEmails);
      
      /* Try to find structured member data */
      document.querySelectorAll('tr, [role="row"], div[class*="member"], div[class*="user"]').forEach(el => {
        const text = el.innerText || '';
        const emailMatch = text.match(emailRegex);
        if (emailMatch) {
          const email = emailMatch[0];
          const lines = text.split('\\n').filter(l => l.trim());
          let name = lines[0] || email.split('@')[0];
          if (name.includes('@')) name = email.split('@')[0];
          
          let role = 'member';
          if (text.toLowerCase().includes('owner')) role = 'owner';
          else if (text.toLowerCase().includes('admin')) role = 'admin';
          
          if (!members.find(m => m.email === email)) {
            members.push({ name: name.substring(0,100), email, role });
          }
        }
      });
      
      /* Fallback to raw emails */
      if (members.length === 0) {
        foundEmails.forEach(email => {
          if (!members.find(m => m.email === email)) {
            members.push({ name: email.split('@')[0], email, role: 'member' });
          }
        });
      }
      
      console.log('[TeamSync] Parsed members:', members);
      return { teamName, members };
    }
    
    const data = getTeamData();
    
    if (data.members.length === 0) {
      const emails = (document.body.innerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || []).slice(0,5);
      alert('No members found.\\n\\nEmails visible: ' + (emails.join(', ') || 'none') + '\\n\\nURL: ' + location.href);
      return;
    }
    
    console.log('[TeamSync] Sending to:', API_URL);
    console.log('[TeamSync] Payload:', JSON.stringify(data));
    
    /* Use XMLHttpRequest as fallback for CSP issues */
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', API_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          console.log('[TeamSync] Response status:', xhr.status);
          console.log('[TeamSync] Response:', xhr.responseText);
          if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
            if (result.success) {
              alert('✅ Synced ' + data.members.length + ' members from "' + data.teamName + '"');
            } else {
              alert('❌ Sync failed: ' + (result.error || 'Unknown error'));
            }
          } else {
            alert('❌ Sync failed (HTTP ' + xhr.status + '): ' + xhr.responseText);
          }
        }
      };
      xhr.onerror = function() {
        console.error('[TeamSync] XHR Error');
        alert('❌ Network error. The site may be blocking external requests.\\n\\nTry opening browser console (F12) for details.');
      };
      xhr.send(JSON.stringify(data));
    } catch(e) {
      console.error('[TeamSync] Error:', e);
      alert('❌ Error: ' + e.message);
    }
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
