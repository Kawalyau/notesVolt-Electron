// src/components/school-site/manage-news-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { NewsArticle } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trash2, Edit, Plus, CheckCircle, XCircle } from 'lucide-react';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services/schoolService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { orderBy } from 'firebase/firestore';
import { Checkbox } from '@/components/ui/checkbox'; // Correctly import Checkbox

interface ManageNewsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  onUpdate: () => void;
}

export function ManageNewsDialog({ isOpen, onOpenChange, schoolId, onUpdate }: ManageNewsDialogProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const fetchNews = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const data = await getSchoolSubcollectionItems<NewsArticle>(schoolId, 'news', [orderBy('createdAt', 'desc')]);
      setNewsArticles(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load news articles." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchNews();
      resetForm();
    }
  }, [isOpen, fetchNews]);

  const resetForm = () => {
    setEditingArticle(null);
    setTitle('');
    setContent('');
    setIsPublished(true);
  };

  const handleEdit = (article: NewsArticle) => {
    setEditingArticle(article);
    setTitle(article.title);
    setContent(article.content);
    setIsPublished(article.isPublished);
  };

  const handleSave = async () => {
    if (!title || !content || !userProfile) {
      toast({ variant: "destructive", title: "Missing Info", description: "Title and content are required." });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingArticle) {
        // Update existing article
        const updatedData: Partial<NewsArticle> = { title, content, isPublished };
        await updateSchoolSubcollectionItem(schoolId, 'news', editingArticle.id, updatedData);
        toast({ title: "Article Updated" });
      } else {
        // Add new article
        const newArticleData: Omit<NewsArticle, 'id' | 'createdAt' | 'updatedAt'> = {
          title, content, isPublished,
          authorId: userProfile.uid,
          authorName: userProfile.displayName || "Admin",
          publishedAt: isPublished ? new Date().toISOString() : null,
        };
        await addSchoolSubcollectionItem(schoolId, 'news', newArticleData);
        toast({ title: "Article Added" });
      }
      resetForm();
      fetchNews();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (articleId: string) => {
    if (!window.confirm("Are you sure you want to delete this article?")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'news', articleId);
      toast({ title: "Article Deleted" });
      fetchNews();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };
  
  const handleTogglePublish = async (article: NewsArticle) => {
      try {
          await updateSchoolSubcollectionItem(schoolId, 'news', article.id, {
              isPublished: !article.isPublished,
              publishedAt: !article.isPublished ? new Date().toISOString() : null
          });
          toast({title: `Article ${!article.isPublished ? "Published" : "Unpublished"}`});
          fetchNews();
          onUpdate();
      } catch (error: any) {
          toast({variant: "destructive", title: "Update Failed", description: error.message});
      }
  }


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage News Articles</DialogTitle>
          <DialogDescription>Add, edit, or remove news articles for your school's website.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 flex-grow overflow-hidden">
          {/* Form Section */}
          <div className="space-y-4 p-1">
            <h3 className="font-semibold text-lg">{editingArticle ? "Edit Article" : "Add New Article"}</h3>
            <div>
              <Label htmlFor="news-title">Title*</Label>
              <Input id="news-title" value={title} onChange={e => setTitle(e.target.value)} disabled={isSubmitting} />
            </div>
            <div>
              <Label htmlFor="news-content">Content*</Label>
              <Textarea id="news-content" value={content} onChange={e => setContent(e.target.value)} disabled={isSubmitting} rows={10} className="min-h-[200px]" />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="news-published" checked={isPublished} onCheckedChange={checked => setIsPublished(checked as boolean)} disabled={isSubmitting} />
                <Label htmlFor="news-published">Published</Label>
            </div>
             <div className="flex gap-2">
                <Button onClick={handleSave} disabled={isSubmitting || !title || !content}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : (editingArticle ? <Edit className="mr-2 h-4 w-4"/> : <Plus className="mr-2 h-4 w-4"/>)}
                {editingArticle ? 'Update Article' : 'Add Article'}
                </Button>
                {editingArticle && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </div>
          
          {/* Existing Articles List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Existing Articles</h3>
            <ScrollArea className="h-96 border rounded-lg p-2">
              {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin"/></div> : (
                newsArticles.length > 0 ? (
                  <div className="space-y-3">
                    {newsArticles.map(article => (
                      <div key={article.id} className="flex items-start gap-4 p-2 border-b">
                        <div className="flex-grow">
                          <p className="font-semibold">{article.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{article.content}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" title={article.isPublished ? "Unpublish" : "Publish"} onClick={() => handleTogglePublish(article)}>
                                {article.isPublished ? <CheckCircle className="h-5 w-5 text-green-600"/> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                            </Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEdit(article)}><Edit className="h-4 w-4"/></Button>
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(article.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-center p-4">No articles created yet.</p>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
