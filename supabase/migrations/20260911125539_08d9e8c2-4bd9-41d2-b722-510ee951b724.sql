
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_select" ON public.folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "folders_insert" ON public.folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "folders_update" ON public.folders FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "folders_delete" ON public.folders FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'superadmin'));
CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size bigint NOT NULL DEFAULT 0,
  description text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_folder_idx ON public.files(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_select" ON public.files FOR SELECT TO authenticated USING (true);
CREATE POLICY "files_insert" ON public.files FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "files_update" ON public.files FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "files_delete" ON public.files FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'superadmin'));
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "tags_insert" ON public.tags FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tags_delete" ON public.tags FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

CREATE TABLE public.file_tags (
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_tags TO authenticated;
GRANT ALL ON public.file_tags TO service_role;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "file_tags_select" ON public.file_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "file_tags_insert" ON public.file_tags FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'superadmin'))));
CREATE POLICY "file_tags_delete" ON public.file_tags FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'superadmin'))));

DROP POLICY IF EXISTS "Superadmin and admin can insert profiles" ON public.profiles;
CREATE POLICY "Authenticated users can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
