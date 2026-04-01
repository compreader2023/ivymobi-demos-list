import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Loader2, Shield, ShieldCheck, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

export default function UserManagement() {
  const { user, profile: currentProfile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<string>("user");

  const isSuperadmin = currentProfile?.role === "superadmin";
  const isAdminOrSuper = isSuperadmin || currentProfile?.role === "admin";

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormPassword("");
    setFormRole("user");
    setEditUser(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (u: Profile) => {
    setEditUser(u);
    setFormName(u.name);
    setFormPhone(u.phone);
    setFormPassword("");
    setFormRole(u.role);
    setDialogOpen(true);
  };

  const canEdit = (target: Profile) => {
    if (isSuperadmin) return true;
    if (target.user_id === user?.id) return true;
    if (target.role === "superadmin") return false;
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    if (editUser) {
      // Update user via edge function
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: {
          user_id: editUser.user_id,
          name: formName,
          phone: formPhone,
          password: formPassword || undefined,
          role: isSuperadmin ? formRole : undefined,
        },
      });

      if (error || data?.error) {
        toast({
          title: "更新失败",
          description: data?.error || error?.message,
          variant: "destructive",
        });
      } else {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "update",
          target_type: "user",
          target_name: formName,
        });
        toast({ title: "用户已更新" });
      }
    } else {
      // Create user via edge function
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name: formName,
          phone: formPhone,
          password: formPassword,
          role: formRole,
        },
      });

      if (error || data?.error) {
        toast({
          title: "添加失败",
          description: data?.error || error?.message,
          variant: "destructive",
        });
      } else {
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "create",
          target_type: "user",
          target_name: formName,
        });
        toast({ title: "用户已添加" });
      }
    }

    setSubmitting(false);
    setDialogOpen(false);
    resetForm();
    fetchUsers();
  };

  const handleDelete = async () => {
    if (!deleteUser || !user) return;
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: deleteUser.user_id },
    });

    if (error || data?.error) {
      toast({
        title: "删除失败",
        description: data?.error || error?.message,
        variant: "destructive",
      });
    } else {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "delete",
        target_type: "user",
        target_name: deleteUser.name,
      });
      toast({ title: "用户已删除" });
      fetchUsers();
    }
    setDeleteUser(null);
  };

  const RoleIcon = ({ role }: { role: string }) => {
    if (role === "superadmin") return <ShieldCheck className="h-4 w-4 text-primary" />;
    if (role === "admin") return <Shield className="h-4 w-4 text-primary" />;
    return <User className="h-4 w-4 text-muted-foreground" />;
  };

  const roleLabel = (role: string) =>
    role === "superadmin" ? "超级管理员" : role === "admin" ? "管理员" : "用户";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
        {isAdminOrSuper && (
          <Button onClick={openAdd} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            添加用户
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RoleIcon role={u.role} />
                  <div>
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {u.name}
                      <span className="text-xs text-muted-foreground">
                        ({roleLabel(u.role)})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">{u.phone}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEdit(u) && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {isAdminOrSuper && u.role !== "superadmin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteUser(u)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? "编辑用户" : "添加用户"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>姓名 *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>手机号 *</Label>
              <Input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{editUser ? "新密码（留空则不修改）" : "密码 *"}</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                required={!editUser}
              />
            </div>
            {isSuperadmin && (
              <div className="space-y-2">
                <Label>角色</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">用户</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="superadmin">超级管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editUser ? "保存修改" : "添加用户"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={(v) => !v && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除用户「{deleteUser?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
