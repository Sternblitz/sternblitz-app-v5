# Sternblitz Vertriebsplattform ⚡

Vertriebs-Dashboard mit Supabase-Auth, Live-Simulator und digitaler Auftragsbestätigung (PDF + Mail). Die Auftragsdaten werden über Supabase persistiert und über streng konfigurierte RLS-Policies gemäß Rolle (ADMIN, TEAM_LEADER, SALES) ausgeliefert.

## Setup & Deploy

### 1. Abhängigkeiten
- Node 20 (siehe `package.json` engines).
- Package-Manager: `npm` (kein Lockfile vorhanden).

```bash
npm install
```

### 2. Umgebungsvariablen
- `.env.example` enthält alle benötigten Schlüssel – eine Kopie als `.env.local` anlegen und Werte füllen.
- Für CI/Vercel identische Variablen hinterlegen (NEXT_PUBLIC\_* muss auch im Frontend verfügbar sein).

### 3. Supabase vorbereiten
1. Supabase-Projekt erstellen oder vorhandenes Projekt verwenden.
2. Migrationen anwenden:
   - `supabase/migrations/20251019160509_orders_rbac.sql` (Tabellen, RLS, Trigger)
   - `supabase/migrations/20251019185009_orders_status_metrics.sql` (Baseline-/Live-Metriken, Update-Policy)
   - Ausführung via Supabase CLI:
     ```bash
     npx supabase db push --file supabase/migrations/20251019160509_orders_rbac.sql
     npx supabase db push --file supabase/migrations/20251019185009_orders_status_metrics.sql
     ```
     oder die SQL-Dateien direkt über das Supabase Dashboard laufen lassen.
3. Bestehende Nutzer (`auth.users`) per `profiles`-Eintrag einer Organisation/Team und Rolle zuordnen:
   ```sql
   insert into public.organizations (id, name) values ('<org-id>', 'Sternblitz') on conflict (id) do nothing;

   insert into public.teams (id, org_id, name)
   values ('<team-id>', '<org-id>', 'Team Nord')
   on conflict (id) do nothing;

   insert into public.profiles (user_id, org_id, team_id, role, full_name)
   values ('<admin-user-id>', '<org-id>', '<team-id>', 'ADMIN', 'Ada Admin')
   on conflict (user_id) do update
     set org_id = excluded.org_id,
         team_id = excluded.team_id,
         role = excluded.role;
   ```

### 4. Lokal entwickeln & testen
```bash
npm run dev      # lokale Entwicklung
npm run build    # muss ohne Fehler durchlaufen
```

### 5. Deployment (Vercel)
1. Supabase-Migrationen in der Produktions-Datenbank anwenden (siehe Schritt 3).
2. Alle ENV-Variablen bei Vercel hinterlegen.
3. Vercel-Build verwendet automatisch `npm run build`.

## Datenmodell (Supabase)

Siehe Snapshot `supabase/SCHEMA.sql`. Kernpunkte:
- `organizations`: Mandanten-Trennung.
- `teams`: gehören zu einer Organisation, optional mit `leader_id`.
- `profiles`: 1:1 zu `auth.users`, enthält `role`, `org_id`, `team_id`.
- `orders`: Aufträge/Leads inkl. PDF-Storage-Pfad, Counts, Rep-Code etc.
  - Baseline: `start_total_reviews`, `start_average_rating`, `start_bad_1..3`
  - Live: `live_total_reviews`, `live_average_rating`, `live_bad_1..3`, `last_refreshed_at`
  - Kontext für Updates: `review_name`, `review_address`
- RLS via `public.can_access_order(org_id, team_id, created_by)`:
  - ADMIN: volle Organisation.
  - TEAM_LEADER: eigenes Team + eigene Aufträge.
  - SALES: nur eigene Aufträge.
- Trigger `orders_set_defaults()` setzt `org_id`, `team_id`, `created_by`, `source_account_id` auf Basis des eingeloggt handelnden Users.

## Rollenprüfung (RBAC-Checkliste)
1. Mindestens drei Test-Accounts anlegen (`auth.users`) und über `profiles` wie folgt zuweisen:
   - ADMIN: `role = 'ADMIN'`, beliebiges Team/Organisation.
   - TEAM_LEADER: `role = 'TEAM_LEADER'`, `team_id` gesetzt.
   - SALES: `role = 'SALES'`, `team_id` passend zum Team-Leader.
2. Mit jedem Account einloggen (`/login`), Auftrag im Dashboard anlegen, Signatur abschließen.
3. Direkt nach Absenden:
   - SALES: Nur eigener Auftrag sichtbar unter `/dashboard/orders`.
   - TEAM_LEADER: eigener Auftrag plus Aufträge aller Mitglieder seines Teams.
   - ADMIN: alle Aufträge der Organisation.
4. Optionaler SQL-Check:
   ```sql
   select id, created_by, team_id, org_id, status
   from public.orders
   order by created_at desc;
   ```
   Verifizieren, dass `created_by` und `team_id` den erwarteten Zuordnungen entsprechen.

## Auftragsstatus & Refresh
- Beim Anlegen eines Auftrags werden die Google-Bewertungsdaten als Baseline gespeichert (`start_*` Felder). Live-Werte spiegeln den zuletzt gemessenen Stand wider.
- Die 🔄-Schaltfläche in `/dashboard/orders` ruft `POST /api/orders/{id}/refresh` auf und nutzt `REVIEW_API` (oder den eingebauten Simulator) für aktuelle Zahlen. Nach dem Update wird `last_refreshed_at` gesetzt und der Fortschritt neu berechnet.
- Supabase Storage: Der Bucket `contracts` muss existieren (öffentlich ausreichend), damit PDFs abgelegt werden können.
- Für verlässliche Live-Daten `REVIEW_API` in `.env`/Vercel konfigurieren; ohne Key greift der Simulator-Fallback.

## Fehlerbehebung & Tipps
- **Kein Profil gefunden:** Der API-Handler liefert 403, wenn kein Eintrag in `public.profiles` existiert – Profil ergänzen und erneut versuchen.
- **Supabase Storage Berechtigungen:** Uploads nutzen den Service-Role-Key (`SUPABASE_SERVICE_ROLE_KEY`). Bucket `contracts` muss existieren und öffentlich sein, wenn auf `pdf_signed_url` direkt zugegriffen werden soll.
- **Review-Simulator:** `REVIEW_API` optional setzen, sonst wird der Demo-Endpunkt verwendet.

## Build Verification
- `npm run build`
- Test-Auftrag erstellen und sicherstellen, dass der neue Datensatz gemäß Rolle sichtbar ist (siehe Checkliste).
- In `/dashboard/orders` den 🔄 Refresh auslösen und prüfen, dass Live-Werte, Fortschritt und Zeitstempel aktualisiert werden.
