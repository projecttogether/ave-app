INSERT INTO "roles" ("id", "description") VALUES
('global_view_only', 'Global View Only')
ON CONFLICT ("id") DO NOTHING;
