import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { unzipSync } from "fflate";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileCode2,
  FileImage,
  File as FileIcon,
  Folder as FolderIcon,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ViewToggle, { type ViewMode } from "@/components/ViewToggle";

const PAGE_SIZE = 50;
const DEFAULT_FOLDER = "default";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

interface Folder {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

interface FileRow {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size: number;
  description: string | null;
  created_by: string;
  updated_at: string;
  tags?: string[];
}

interface TagRow {
  id: string;
  name: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(name: string, mime: string | null) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "HTML";
  if (mime?.startsWith("image/")) return "图片";
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(lower)) return "图片";
  return mime || "文件";
}

function isAllowed(name: string) {
  return /\.(html?|png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name);
}

function guessMime(name: string) {
  const l = name.toLowerCase();
  if (l.endsWith(".html") || l.endsWith(".htm")) return "text/html";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  if (l.endsWith(".gif")) return "image/gif";
  if (l.endsWith(".webp")) return "image/webp";
  if (l.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export default function Files() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isSuperadmin = profile?.role === "superadmin";

  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const [scope, setScope] = useState<"all" | "current">("all");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<FileRow | null>(null);

  const [folderDialog, setFolderDialog] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null);

  const [editFile, setEditFile] = useState<FileRow | null>(null);
  const [fileDesc, setFileDesc] = useState("");
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [deleteFile, setDeleteFile] = useState<FileRow | null>(null);
  const [saving, setSaving] = useState(false);

  const inFolder = Boolean(folderId);
  const effectiveScope = inFolder ? scope : "all";
  const filtering = search.trim() !== "" || activeTag !== "all";

  const loadFolders = useCallback(async () => {
    const { data } = await supabase.from("folders").select("*").order("name");
    let list = (data as Folder[]) || [];
    if (user && !list.some((f) => f.name === DEFAULT_FOLDER)) {
      const { data: created } = await supabase
        .from("folders")
        .insert({ name: DEFAULT_FOLDER, created_by: user.id })
        .select()
        .single();
      if (created) list = [created as Folder, ...list];
    }
    setFolders(list);
  }, [user]);

  const loadTags = useCallback(async () => {
    const [{ data: t }, { data: ft }] = await Promise.all([
      supabase.from("tags").select("id, name").order("name"),
      supabase.from("file_tags").select("tag_id"),
    ]);
    setTags((t as TagRow[]) || []);
    const counts: Record<string, number> = {};
    (ft || []).forEach((r: { tag_id: string }) => {
      counts[r.tag_id] = (counts[r.tag_id] || 0) + 1;
    });
    setTagCounts(counts);
  }, []);

  useEffect(() => {
    loadFolders();
    loadTags();
  }, [loadFolders, loadTags]);

  useEffect(() => {
    if (!folderId) {
      setCurrentFolder(null);
      return;
    }
    supabase
      .from("folders")
      .select("*")
      .eq("id", folderId)
      .single()
      .then(({ data }) => setCurrentFolder((data as Folder) || null));
  }, [folderId]);

  const fetchFiles = useCallback(
    async (offset: number, reset = false) => {
      setLoading(true);
      let ids: string[] | null = null;
      if (activeTag !== "all") {
        const { data: ft } = await supabase
          .from("file_tags")
          .select("file_id")
          .eq("tag_id", activeTag);
        ids = (ft || []).map((r: { file_id: string }) => r.file_id);
        if (ids.length === 0) {
          if (reset) setFiles([]);
          setHasMore(false);
          setLoading(false);
          return;
        }
      }

      let query = supabase
        .from("files")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (inFolder && (effectiveScope === "current" || !filtering)) {
        query = query.eq("folder_id", folderId!);
      }
      const term = search.trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (ids) query = query.in("id", ids);

      const { data, error } = await query;
      if (error) {
        toast({ title: "加载失败", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const rows = (data as FileRow[]) || [];

      // tags for these files
      const fileIds = rows.map((r) => r.id);
      let tagMap: Record<string, string[]> = {};
      if (fileIds.length) {
        const { data: links } = await supabase
          .from("file_tags")
          .select("file_id, tag_id")
          .in("file_id", fileIds);
        const nameById = new Map(tags.map((t) => [t.id, t.name]));
        (links || []).forEach((l: { file_id: string; tag_id: string }) => {
          const n = nameById.get(l.tag_id);
          if (!n) return;
          tagMap[l.file_id] = [...(tagMap[l.file_id] || []), n];
        });

        const ownerIds = Array.from(new Set(rows.map((r) => r.created_by)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", ownerIds);
        const names: Record<string, string> = {};
        (profs || []).forEach((p: { user_id: string; name: string }) => {
          names[p.user_id] = p.name;
        });
        setOwnerNames((prev) => ({ ...prev, ...names }));
      }

      const enriched = rows.map((r) => ({ ...r, tags: tagMap[r.id] || [] }));
      setFiles((prev) => (reset ? enriched : [...prev, ...enriched]));
      setHasMore(rows.length >= PAGE_SIZE);
      setLoading(false);
    },
    [activeTag, search, folderId, inFolder, effectiveScope, filtering, tags, toast]
  );

  const showFiles = inFolder || filtering;

  useEffect(() => {
    if (showFiles) fetchFiles(0, true);
    else setFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, search, activeTag, scope, showFiles]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && showFiles) {
          fetchFiles(files.length);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, files.length, showFiles, fetchFiles]);

  const log = async (action: string, targetType: string, targetName: string) => {
    if (!user) return;
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action,
      target_type: targetType,
      target_name: targetName,
    });
  };

  /* ---------------- upload ---------------- */

  const uploadOne = async (name: string, blob: Blob, folder: Folder) => {
    const safe = name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    const path = `${folder.name}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("files").upload(path, blob, {
      contentType: blob.type || guessMime(name),
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { error: dbError } = await supabase.from("files").insert({
      folder_id: folder.id,
      name: safe,
      storage_path: path,
      mime_type: blob.type || guessMime(name),
      size: blob.size,
      created_by: user!.id,
      updated_by: user!.id,
    });
    if (dbError) throw new Error(dbError.message);
    await log("create", "file", safe);
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list || !list.length || !currentFolder || !user) return;
    setUploading(true);
    let ok = 0;
    let skipped = 0;
    try {
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) {
          const buf = new Uint8Array(await f.arrayBuffer());
          const entries = unzipSync(buf);
          for (const [entryName, content] of Object.entries(entries)) {
            const base = entryName.split("/").pop() || entryName;
            if (!base || entryName.endsWith("/")) continue;
            if (!isAllowed(base)) {
              skipped++;
              continue;
            }
            const bytes = content as Uint8Array;
            const part = new Uint8Array(bytes.length);
            part.set(bytes);
            await uploadOne(base, new Blob([part], { type: guessMime(base) }), currentFolder);
            ok++;
          }
        } else if (isAllowed(f.name)) {
          await uploadOne(f.name, f, currentFolder);
          ok++;
        } else {
          skipped++;
        }
      }
      toast({ title: `已上传 ${ok} 个文件`, description: skipped ? `${skipped} 个不支持的文件已跳过` : undefined });
      fetchFiles(0, true);
    } catch (e) {
      toast({ title: "上传失败", description: (e as Error).message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleReplace = async (f: File) => {
    if (!replaceTarget || !user) return;
    setUploading(true);
    const { error } = await supabase.storage
      .from("files")
      .upload(replaceTarget.storage_path, f, { contentType: f.type || guessMime(f.name), upsert: true });
    if (error) {
      toast({ title: "替换失败", description: error.message, variant: "destructive" });
    } else {
      await supabase
        .from("files")
        .update({ size: f.size, mime_type: f.type || guessMime(f.name), updated_by: user.id })
        .eq("id", replaceTarget.id);
      await log("update", "file", replaceTarget.name);
      toast({ title: "文件已替换" });
      fetchFiles(0, true);
    }
    setReplaceTarget(null);
    setUploading(false);
  };

  const getLink = async (f: FileRow) => {
    const { data, error } = await supabase.storage
      .from("files")
      .createSignedUrl(f.storage_path, SIGNED_URL_TTL);
    if (error || !data) {
      toast({ title: "获取链接失败", variant: "destructive" });
      return null;
    }
    return data.signedUrl;
  };

  const copyLink = async (f: FileRow) => {
    const url = await getLink(f);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "链接已复制" });
  };

  const openFile = async (f: FileRow) => {
    const url = await getLink(f);
    if (url) window.open(url, "_blank");
  };

  /* ---------------- file edit ---------------- */

  const openFileEditor = (f: FileRow) => {
    setEditFile(f);
    setFileDesc(f.description || "");
    setFileTags(f.tags || []);
    setNewTag("");
  };

  const saveFile = async () => {
    if (!editFile || !user) return;
    setSaving(true);
    await supabase
      .from("files")
      .update({ description: fileDesc || null, updated_by: user.id })
      .eq("id", editFile.id);

    // resolve tag ids (create missing)
    const ids: string[] = [];
    for (const name of fileTags) {
      let tag = tags.find((t) => t.name === name);
      if (!tag) {
        const { data } = await supabase
          .from("tags")
          .insert({ name, created_by: user.id })
          .select()
          .single();
        if (data) tag = data as TagRow;
      }
      if (tag) ids.push(tag.id);
    }
    await supabase.from("file_tags").delete().eq("file_id", editFile.id);
    if (ids.length) {
      await supabase.from("file_tags").insert(ids.map((tag_id) => ({ file_id: editFile.id, tag_id })));
    }
    await log("update", "file", editFile.name);
    await loadTags();
    setSaving(false);
    setEditFile(null);
    toast({ title: "已保存" });
    fetchFiles(0, true);
  };

  const doDeleteFile = async () => {
    if (!deleteFile) return;
    await supabase.storage.from("files").remove([deleteFile.storage_path]);
    const { error } = await supabase.from("files").delete().eq("id", deleteFile.id);
    if (error) toast({ title: "删除失败", description: error.message, variant: "destructive" });
    else {
      await log("delete", "file", deleteFile.name);
      toast({ title: "文件已删除" });
      fetchFiles(0, true);
    }
    setDeleteFile(null);
  };

  /* ---------------- folders ---------------- */

  const submitFolder = async () => {
    if (!user) return;
    const name = folderName.trim();
    if (!name) return;
    setSaving(true);
    if (editFolder) {
      const { error } = await supabase.from("folders").update({ name }).eq("id", editFolder.id);
      if (error) toast({ title: "重命名失败", description: error.message, variant: "destructive" });
      else {
        await log("update", "folder", name);
        toast({ title: "文件夹已更新" });
      }
    } else {
      const { error } = await supabase.from("folders").insert({ name, created_by: user.id });
      if (error) toast({ title: "创建失败", description: error.message, variant: "destructive" });
      else {
        await log("create", "folder", name);
        toast({ title: "文件夹已创建" });
      }
    }
    setSaving(false);
    setFolderDialog(false);
    setEditFolder(null);
    setFolderName("");
    loadFolders();
  };

  const doDeleteFolder = async () => {
    if (!deleteFolder) return;
    const { data: inner } = await supabase
      .from("files")
      .select("storage_path")
      .eq("folder_id", deleteFolder.id);
    if (inner?.length) {
      await supabase.storage.from("files").remove(inner.map((i: { storage_path: string }) => i.storage_path));
    }
    const { error } = await supabase.from("folders").delete().eq("id", deleteFolder.id);
    if (error) toast({ title: "删除失败", description: error.message, variant: "destructive" });
    else {
      await log("delete", "folder", deleteFolder.name);
      toast({ title: "文件夹已删除" });
      loadFolders();
      if (folderId === deleteFolder.id) navigate("/files");
    }
    setDeleteFolder(null);
  };

  const canManage = (ownerId: string) => isSuperadmin || ownerId === user?.id;

  /* ---------------- render ---------------- */

  const FileCard = ({ f }: { f: FileRow }) => {
    const kind = fileKind(f.name, f.mime_type);
    const Icon = kind === "HTML" ? FileCode2 : kind === "图片" ? FileImage : FileIcon;
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-2">
            <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground break-all">{f.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {kind} · {formatSize(f.size)} · {new Date(f.updated_at).toLocaleString("zh-CN")}
              </p>
              <p className="text-xs text-muted-foreground">上传者：{ownerNames[f.created_by] || "未知"}</p>
            </div>
          </div>
          {f.description && <p className="text-sm text-muted-foreground break-words">{f.description}</p>}
          {!!f.tags?.length && (
            <div className="flex flex-wrap gap-1">
              {f.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => openFile(f)}>
              <ExternalLink className="h-3.5 w-3.5" /> 打开
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => copyLink(f)}>
              <Copy className="h-3.5 w-3.5" /> 复制链接
            </Button>
            {canManage(f.created_by) && (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openFileEditor(f)}>
                  <Pencil className="h-3.5 w-3.5" /> 编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setReplaceTarget(f);
                    setTimeout(() => replaceRef.current?.click(), 0);
                  }}
                >
                  <Upload className="h-3.5 w-3.5" /> 替换
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => setDeleteFile(f)}>
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleReplace(f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {inFolder && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/files")} className="gap-1 shrink-0">
              <ArrowLeft className="h-4 w-4" /> 返回
            </Button>
          )}
          <h1 className="text-xl font-semibold text-foreground truncate">
            {inFolder ? currentFolder?.name || "文件夹" : "文件管理"}
          </h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索文件名或描述..."
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
          {inFolder ? (
            <Button size="sm" className="gap-1 shrink-0" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              上传
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1 shrink-0"
              onClick={() => {
                setEditFolder(null);
                setFolderName("");
                setFolderDialog(true);
              }}
            >
              <FolderPlus className="h-4 w-4" /> 新建文件夹
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2">
        {inFolder && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">范围</span>
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "current")}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有文件夹</SelectItem>
                <SelectItem value="current">当前文件夹</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 w-max pb-1">
            <button
              onClick={() => setActiveTag("all")}
              className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
                activeTag === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              全部标签
            </button>
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTag(t.id)}
                className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
                  activeTag === t.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {t.name} ({tagCounts[t.id] || 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone inside folder */}
      {inFolder && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            拖拽文件到这里，或点击选择。支持 HTML、图片和 ZIP 压缩包（自动解压）
          </p>
        </div>
      )}

      {/* Folder cards */}
      {!showFiles && (
        <div className={viewMode === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid gap-2"}>
          {folders.map((f) => (
            <Card key={f.id} className="overflow-hidden hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <button className="flex items-center gap-3 min-w-0 flex-1 text-left" onClick={() => navigate(`/files/${f.id}`)}>
                  <FolderIcon className="h-6 w-6 text-primary shrink-0" />
                  <span className="font-medium text-foreground truncate">{f.name}</span>
                </button>
                {canManage(f.created_by) && f.name !== DEFAULT_FOLDER && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditFolder(f);
                        setFolderName(f.name);
                        setFolderDialog(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteFolder(f)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Files */}
      {showFiles && (
        <div className={viewMode === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3"}>
          {files.map((f) => (
            <FileCard key={f.id} f={f} />
          ))}
        </div>
      )}

      {showFiles && !loading && files.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">暂无文件</p>
      )}

      <div ref={loaderRef} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      </div>

      {/* Folder dialog */}
      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editFolder ? "重命名文件夹" : "新建文件夹"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>文件夹名称</Label>
            <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="例如：产品手册" />
            <Button className="w-full" onClick={submitFolder} disabled={saving || !folderName.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File edit dialog */}
      <Dialog open={!!editFile} onOpenChange={(o) => !o && setEditFile(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-all">{editFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={fileDesc} onChange={(e) => setFileDesc(e.target.value)} rows={3} placeholder="纯文本描述" />
            </div>
            <div className="space-y-2">
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = fileTags.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setFileTags((prev) =>
                          active ? prev.filter((x) => x !== t.name) : [...prev, t.name]
                        )
                      }
                      className={`px-3 py-1 rounded-full text-sm border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="新建标签"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const n = newTag.trim();
                      if (n && !fileTags.includes(n)) setFileTags([...fileTags, n]);
                      setNewTag("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const n = newTag.trim();
                    if (n && !fileTags.includes(n)) setFileTags([...fileTags, n]);
                    setNewTag("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {!!fileTags.length && (
                <div className="flex flex-wrap gap-1">
                  {fileTags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center gap-1">
                      {t}
                      <button onClick={() => setFileTags(fileTags.filter((x) => x !== t))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button className="w-full" onClick={saveFile} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete file */}
      <AlertDialog open={!!deleteFile} onOpenChange={(o) => !o && setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文件？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteFile?.name}」将被永久删除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteFile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete folder */}
      <AlertDialog open={!!deleteFolder} onOpenChange={(o) => !o && setDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文件夹？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteFolder?.name}」及其中的所有文件将被永久删除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
