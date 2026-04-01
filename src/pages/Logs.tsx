import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, LogIn, Plus, Pencil, Trash2 } from "lucide-react";

interface LogEntry {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_name: string | null;
  created_at: string;
  user_name?: string;
}

const PAGE_SIZE = 50;

const actionIcons: Record<string, typeof LogIn> = {
  login: LogIn,
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const actionLabels: Record<string, string> = {
  login: "登录",
  create: "添加",
  update: "修改",
  delete: "删除",
};

const targetLabels: Record<string, string> = {
  project: "项目",
  user: "用户",
  system: "系统",
};

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(
    async (offset: number, reset = false) => {
      setLoading(true);
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      // Fetch user names
      const userIds = new Set<string>();
      data?.forEach((l) => userIds.add(l.user_id));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", Array.from(userIds));
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.name]) || []);

      const enriched = (data || []).map((l) => ({
        ...l,
        user_name: profileMap.get(l.user_id) || "未知",
      }));

      if (reset) {
        setLogs(enriched);
      } else {
        setLogs((prev) => [...prev, ...enriched]);
      }
      setHasMore((data?.length || 0) >= PAGE_SIZE);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchLogs(0, true);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchLogs(logs.length);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, logs.length]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">操作日志</h1>

      <div className="space-y-2">
        {logs.map((log) => {
          const Icon = actionIcons[log.action] || LogIn;
          return (
            <Card key={log.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{log.user_name}</span>
                    {" "}
                    {actionLabels[log.action] || log.action}
                    了{targetLabels[log.target_type] || log.target_type}
                    {log.target_name && log.action !== "login" && (
                      <span className="font-medium">「{log.target_name}」</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("zh-CN")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div ref={loaderRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!hasMore && logs.length > 0 && (
          <p className="text-sm text-muted-foreground">已加载全部日志</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无日志</p>
        )}
      </div>
    </div>
  );
}
