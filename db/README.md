# Base de datos - Remesa Blink

## Requisitos

- PostgreSQL instalado y corriendo

## Opción 1: Script Node.js (sin psql)

```bash
# Desde backend/ (o: cd backend && npm run db:schema desde la raíz)
npm run db:schema
```

Usa `DATABASE_URL` de `backend/.env`.

## Opción 2: psql

```bash
# 1. Crear la base de datos
createdb remesa_blink

# 2. Ejecutar el schema
export $(grep -v '^#' backend/.env | grep DATABASE_URL | xargs)
psql "$DATABASE_URL" -f db/schema.sql
```

## Si no tienes psql instalado

```bash
# Ubuntu/Debian
sudo apt install postgresql-client

# O instalar PostgreSQL completo
sudo apt install postgresql postgresql-contrib
```

## Docker (recomendado si no tienes PostgreSQL local)

```bash
# Iniciar PostgreSQL
docker compose up -d

# Esperar ~5 segundos y ejecutar schema
cd backend && npm run db:schema
```

O con docker run:
```bash
docker run -d --name remesa-postgres \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=remesa_blink \
  -p 5432:5432 postgres:16-alpine
cd backend && npm run db:schema
```

## Base de datos en la nube (sin instalar nada)

[Neon](https://neon.tech) o [Supabase](https://supabase.com) ofrecen PostgreSQL gratuito.

**Si usas Supabase y obtienes ENETUNREACH (red sin IPv6, p. ej. WSL):**
- En Supabase Dashboard → Settings → Database, usa la URL del **Connection pooler** (puerto 6543)
- El pooler suele usar `pooler.supabase.com`, que puede tener IPv4
- Formato: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
