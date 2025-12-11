import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, BookMarked, Zap, ClipboardPaste, Loader2, Chrome, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface TeamMember {
  name: string;
  email: string;
  role: string;
}

interface TeamData {
  teamName: string;
  members: TeamMember[];
}

export function BookmarkletGuide() {
  const [copied, setCopied] = useState(false);
  const [pastedData, setPastedData] = useState('');
  const [importing, setImporting] = useState(false);
  const queryClient = useQueryClient();

  // Bookmarklet that copies data to clipboard (CSP-safe)
  const bookmarkletCode = `javascript:(function(){
    function getTeamData() {
      let teamName = 'ChatGPT Team';
      const h1 = document.querySelector('h1');
      if (h1) teamName = h1.textContent.trim();
      else teamName = document.title.split('-')[0].trim() || 'ChatGPT Team';
      
      const members = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
      
      document.querySelectorAll('tr, [role="row"], div').forEach(el => {
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
      
      return { teamName, members };
    }
    
    const data = getTeamData();
    if (data.members.length === 0) {
      alert('No members found on this page.');
      return;
    }
    
    const json = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      alert('✅ Copied ' + data.members.length + ' members!\\n\\nNow go to your dashboard and paste the data.');
    }).catch(() => {
      prompt('Copy this data manually:', json);
    });
  })();`;

  const minifiedBookmarklet = bookmarkletCode.replace(/\s+/g, ' ').trim();

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(minifiedBookmarklet);
    setCopied(true);
    toast.success('Bookmarklet copied! Create a bookmark and paste this as the URL.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = async () => {
    if (!pastedData.trim()) {
      toast.error('Please paste the copied data first');
      return;
    }

    let data: TeamData;
    try {
      data = JSON.parse(pastedData);
      if (!data.teamName || !Array.isArray(data.members)) {
        throw new Error('Invalid format');
      }
    } catch {
      toast.error('Invalid data format. Make sure you copied from the bookmarklet.');
      return;
    }

    setImporting(true);
    try {
      // Check if team exists
      let { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('name', data.teamName)
        .maybeSingle();

      if (!team) {
        // Create new team
        const { data: newTeam, error: createError } = await supabase
          .from('teams')
          .insert({ name: data.teamName, member_count: data.members.length })
          .select()
          .single();

        if (createError) throw createError;
        team = newTeam;
      }

      // Delete existing members
      await supabase.from('team_members').delete().eq('team_id', team.id);

      // Insert new members
      if (data.members.length > 0) {
        const membersToInsert = data.members.map(m => ({
          team_id: team.id,
          email: m.email,
          name: m.name || null,
          role: m.role || 'member',
        }));

        const { error: insertError } = await supabase
          .from('team_members')
          .insert(membersToInsert);

        if (insertError) throw insertError;
      }

      // Update team
      await supabase
        .from('teams')
        .update({
          member_count: data.members.length,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', team.id);

      // Add to sync history
      await supabase.from('sync_history').insert({
        team_id: team.id,
        member_count: data.members.length,
      });

      toast.success(`Synced ${data.members.length} members from "${data.teamName}"`);
      setPastedData('');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-primary" />
          <CardTitle>Sync Teams</CardTitle>
        </div>
        <CardDescription>
          Choose your preferred method to sync team data from ChatGPT admin pages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="extension">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="extension" className="gap-2">
              <Chrome className="h-4 w-4" />
              Extension
              <Badge variant="secondary" className="text-xs">Recommended</Badge>
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <ClipboardPaste className="h-4 w-4" />
              Manual
            </TabsTrigger>
          </TabsList>
          
          {/* Browser Extension Method */}
          <TabsContent value="extension" className="space-y-4 mt-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <h4 className="font-semibold flex items-center gap-2 mb-2">
                <Chrome className="h-5 w-5" />
                One-Click Sync with Browser Extension
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Install our Chrome extension for seamless syncing. Click once on any ChatGPT admin page to sync members.
              </p>
              
              <div className="space-y-3 text-sm mb-4">
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  <div>
                    <p className="font-medium">Download the extension</p>
                    <p className="text-muted-foreground text-xs">Export project to GitHub, then download the browser-extension folder</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  <div>
                    <p className="font-medium">Load in Chrome</p>
                    <p className="text-muted-foreground text-xs">Go to chrome://extensions → Enable Developer Mode → Load Unpacked</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  <div>
                    <p className="font-medium">Use it!</p>
                    <p className="text-muted-foreground text-xs">Navigate to ChatGPT admin page and click the extension icon</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    window.open('https://github.com', '_blank');
                    toast.info('Export your project to GitHub first, then download the browser-extension folder');
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Get Extension Files
                </Button>
                <Button 
                  variant="ghost"
                  onClick={() => window.open('chrome://extensions', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Extensions
                </Button>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              <strong>Why use the extension?</strong>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>✓ One-click sync directly to dashboard</li>
                <li>✓ No copy-paste needed</li>
                <li>✓ Auto-detects team name and members</li>
                <li>✓ Works on all ChatGPT admin pages</li>
              </ul>
            </div>
          </TabsContent>

          {/* Manual Bookmarklet Method */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <Tabs defaultValue="step1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="step1">1. Setup</TabsTrigger>
                <TabsTrigger value="step2">2. Copy</TabsTrigger>
                <TabsTrigger value="step3">3. Paste</TabsTrigger>
              </TabsList>
              
              <TabsContent value="step1" className="space-y-4">
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
              
              <TabsContent value="step2" className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <Zap className="h-5 w-5 text-warning shrink-0" />
                    <p>Go to your ChatGPT Team admin <strong>Members</strong> page</p>
                  </div>
                  <div className="flex gap-3">
                    <Zap className="h-5 w-5 text-warning shrink-0" />
                    <p>Click the bookmarklet in your browser toolbar</p>
                  </div>
                  <div className="flex gap-3">
                    <Zap className="h-5 w-5 text-warning shrink-0" />
                    <p>It will copy the member data to your clipboard</p>
                  </div>
                </div>
                
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <strong>Note:</strong> Make sure all members are visible on the page before clicking.
                </div>
              </TabsContent>
              
              <TabsContent value="step3" className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Paste the copied data below:</p>
                  <Textarea
                    placeholder='{"teamName": "...", "members": [...]}'
                    value={pastedData}
                    onChange={(e) => setPastedData(e.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                  />
                  <Button 
                    onClick={handleImport} 
                    className="w-full" 
                    size="lg"
                    disabled={importing || !pastedData.trim()}
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <ClipboardPaste className="h-4 w-4 mr-2" />
                        Import Team Data
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}