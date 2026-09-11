import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  X,
  ExternalLink,
  Pencil,
  Trash2,
  Monitor,
  Smartphone,
  Loader2,
  Copy,
  Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ViewToggle, { type ViewMode } from "@/components/ViewToggle";

interface Project {
  id: string;
  name: string;
  url: string;
  account: string | null;
  password: string | null;
  platform: string;
  category: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  creator?: { name: string };
  updater?: { name: string };
}

interface Category {
  id: string;
  name: string;
}

const PAGE_SIZE = 20;
const NEW_CATEGORY = "__new__";
const NO_CATEGORY = "__none__";

export default function Projects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const loaderRef = useRef<HTMLDivElement>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formAccount, setFormAccount] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPlatform, setFormPlatform] = useState("PC");
  const [formCategory, setFormCategory] = useState(NO_CATEGORY);
  const [formNewCategory, setFormNewCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("categories").select("id, name").order("name");
    setCategories(data || []);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);


  const fetchProjects = useCallback(
    async (offset: number, searchTerm: string, category: string, reset = false) => {
      setLoading(true);
      let query = supabase
        .from("demo_projects")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }
      if (category === "uncategorized") {
        query = query.is("category", null);
      } else if (category !== "all") {
        query = query.eq("category", category);
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: "加载失败", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Fetch creator/updater names
      const userIds = new Set<string>();
      data?.forEach((p) => {
        userIds.add(p.created_by);
        userIds.add(p.updated_by);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", Array.from(userIds));

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.name]) || []);

      const enriched = (data || []).map((p) => ({
        ...p,
        creator: { name: profileMap.get(p.created_by) || "未知" },
        updater: { name: profileMap.get(p.updated_by) || "未知" },
      }));

      if (reset) {
        setProjects(enriched);
      } else {
        setProjects((prev) => [...prev, ...enriched]);
      }
      setHasMore((data?.length || 0) >= PAGE_SIZE);
      setLoading(false);
    },
    [toast]
  );

  useEffect(() => {
    fetchProjects(0, search, activeCategory, true);
  }, [search, activeCategory]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchProjects(projects.length, search, activeCategory);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, projects.length, search, activeCategory]);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormAccount("");
    setFormPassword("");
    setFormPlatform("PC");
    setFormCategory(NO_CATEGORY);
    setFormNewCategory("");
    setEditProject(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setFormName(p.name);
    setFormUrl(p.url);
    setFormAccount(p.account || "");
    setFormPassword(p.password || "");
    setFormPlatform(p.platform);
    setFormCategory(p.category || NO_CATEGORY);
    setFormNewCategory("");
    setDialogOpen(true);
  };

  const resolveCategory = async (): Promise<string | null> => {
    if (formCategory === NEW_CATEGORY) {
      const name = formNewCategory.trim();
      if (!name) return null;
      if (!categories.some((c) => c.name === name)) {
        await supabase.from("categories").insert({ name, created_by: user?.id ?? null });
        await fetchCategories();
      }
      return name;
    }
    if (formCategory === NO_CATEGORY) return null;
    return formCategory;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (formCategory === NEW_CATEGORY && !formNewCategory.trim()) {
      toast({ title: "请输入新分类名称", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const category = await resolveCategory();

    if (editProject) {
      const { error } = await supabase
        .from("demo_projects")
        .update({
          name: formName,
          url: formUrl,
          account: formAccount || null,
          password: formPassword || null,
          platform: formPlatform,
          category,
          updated_by: user.id,
        })
        .eq("id", editProject.id);

      if (!error) {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "update",
          target_type: "project",
          target_name: formName,
        });
        toast({ title: "项目已更新" });
      } else {
        toast({ title: "更新失败", description: error.message, variant: "destructive" });
      }
    } else {
      const { error } = await supabase.from("demo_projects").insert({
        name: formName,
        url: formUrl,
        account: formAccount || null,
        password: formPassword || null,
        platform: formPlatform,
        category,
        created_by: user.id,
        updated_by: user.id,
      });

      if (!error) {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "create",
          target_type: "project",
          target_name: formName,
        });
        toast({ title: "项目已添加" });
      } else {
        toast({ title: "添加失败", description: error.message, variant: "destructive" });
      }
    }

    setSubmitting(false);
    setDialogOpen(false);
    resetForm();
    fetchProjects(0, search, activeCategory, true);
  };


  const handleDelete = async () => {
    if (!deleteProject || !user) return;
    const { error } = await supabase
      .from("demo_projects")
      .delete()
      .eq("id", deleteProject.id);

    if (!error) {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "delete",
        target_type: "project",
        target_name: deleteProject.name,
      });
      toast({ title: "项目已删除" });
      fetchProjects(0, search, activeCategory, true);
    } else {
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
    }
    setDeleteProject(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "已复制到剪贴板" });
  };

  const PlatformBadge = ({ platform }: { platform: string }) => {
    const cls =
      platform === "PC"
        ? "platform-pc"
        : platform === "Mobile"
        ? "platform-mobile"
        : "platform-both";
    const icon =
      platform === "PC" ? (
        <Monitor className="h-3 w-3" />
      ) : platform === "Mobile" ? (
        <Smartphone className="h-3 w-3" />
      ) : (
        <>
          <Monitor className="h-3 w-3" />
          <Smartphone className="h-3 w-3" />
        </>
      );
    return (
      <span className={`${cls} gap-1`}>
        {icon}
        {platform}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">演示项目列表</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={openAdd} size="sm" className="gap-1 shrink-0">
            <Plus className="h-4 w-4" />
            添加项目
          </Button>
        </div>
      </div>

      {/* Category filter */}
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          {[
            { key: "all", label: "全部" },
            ...categories.map((c) => ({ key: c.name, label: c.name })),
            { key: "uncategorized", label: "未分类" },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors whitespace-nowrap ${
                activeCategory === c.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Project cards */}
      <div className={viewMode === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3"}>
        {projects.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    <PlatformBadge platform={p.platform} />
                    {p.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        {p.category}
                      </span>
                    )}
                  </div>

                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    {p.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {(p.account || p.password) && (
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {p.account && (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                          onClick={() => copyToClipboard(p.account!)}
                        >
                          账号: {p.account}
                          <Copy className="h-3 w-3" />
                        </span>
                      )}
                      {p.password && (
                        <span
                          className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                          onClick={() => copyToClipboard(p.password!)}
                        >
                          密码: {p.password}
                          <Copy className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    <span>添加者: {p.creator?.name}</span>
                    <span>更新者: {p.updater?.name}</span>
                    <span>更新: {new Date(p.updated_at).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Loader */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!hasMore && projects.length > 0 && (
          <p className="text-sm text-muted-foreground">已加载全部项目</p>
        )}
        {!loading && projects.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无项目</p>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editProject ? "编辑项目" : "添加项目"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>项目名称 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="请输入项目名称"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>网址 *</Label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://"
                required
              />
              <p className="text-xs text-muted-foreground">请输入完整网址，以 https:// 开头</p>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>账号</Label>
                  <Input
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    placeholder="选填"
                  />
                </div>
                <div className="space-y-2">
                  <Label>密码</Label>
                  <Input
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="选填"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-600">⚠ 不建议添加超管账号</p>
            </div>
            <div className="space-y-2">
              <Label>支持终端</Label>
              <RadioGroup value={formPlatform} onValueChange={setFormPlatform} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="PC" id="pc" />
                  <Label htmlFor="pc">PC</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Mobile" id="mobile" />
                  <Label htmlFor="mobile">Mobile</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="PC/Mobile" id="both" />
                  <Label htmlFor="both">PC/Mobile</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  <SelectItem value={NO_CATEGORY}>未分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY}>+ 新建分类</SelectItem>
                </SelectContent>
              </Select>
              {formCategory === NEW_CATEGORY && (
                <Input
                  value={formNewCategory}
                  onChange={(e) => setFormNewCategory(e.target.value)}
                  placeholder="请输入新分类名称"
                />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editProject ? "保存修改" : "添加项目"}
            </Button>
            {editProject && (
              <div className="pt-4 border-t mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  onClick={() => { setDialogOpen(false); setDeleteProject(editProject); }}
                >
                  <Trash2 className="h-4 w-4" />
                  删除此项目
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteProject} onOpenChange={(v) => !v && setDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{deleteProject?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
