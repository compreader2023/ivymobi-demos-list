
CREATE POLICY "files_bucket_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'files');
CREATE POLICY "files_bucket_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'files' AND owner = auth.uid());
CREATE POLICY "files_bucket_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'files' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'superadmin')));
CREATE POLICY "files_bucket_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'files' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'superadmin')));
