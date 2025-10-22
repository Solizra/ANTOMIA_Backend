import os
import sys
import json
import ssl
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Tuple, Optional


# --------------------------- Utilidades de entorno ---------------------------
def load_env_file_if_exists() -> None:
    """Carga variables de .env si existe (igual criterio que backend/DBConfig.js)."""
    possible_paths = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),  # backend/.env
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),  # raíz/.env
        os.path.join(os.getcwd(), ".env"),  # cwd/.env
    ]
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, value = line.split("=", 1)
                        key = key.strip()
                        value = value.strip()
                        # No sobreescribir si ya existe en el entorno
                        if key and key not in os.environ:
                            os.environ[key] = value
            except Exception:
                pass
            break


def get_db_config() -> dict:
    """Lee config de Postgres desde variables de entorno."""
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "database": os.environ.get("DB_DATABASE", "climatetech_db"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", "tu_password"),
        "port": int(os.environ.get("DB_PORT", "5432")),
    }


# ------------------------------- HTTP helpers -------------------------------
def http_get(url: str, headers: Optional[dict] = None, timeout: int = 20) -> bytes:
    # GET simple con headers y timeout
    req = urllib.request.Request(url, headers=headers or {})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


def http_post_json(url: str, body: dict, headers: Optional[dict] = None, timeout: int = None) -> dict:
    # POST JSON y parseo a dict (con timeout configurable y reintentos básicos)
    payload = json.dumps(body).encode("utf-8")
    req_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=payload, headers=req_headers, method="POST")
    ctx = ssl.create_default_context()

    # Timeout configurable por env (BACKEND_TIMEOUT en segundos). Default 120s.
    eff_timeout = timeout
    if eff_timeout is None:
        try:
            eff_timeout = int(os.environ.get("BACKEND_TIMEOUT", "120"))
        except Exception:
            eff_timeout = 120

    # Reintentos simples en caso de timeout/transient errors
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=eff_timeout, context=ctx) as resp:
                data = resp.read()
                try:
                    return json.loads(data.decode("utf-8"))
                except Exception:
                    return {}
        except Exception as e:
            last_err = e
    raise last_err if last_err else RuntimeError("POST failed")


# ------------------------------- RSS/Atom parse ------------------------------
def parse_feed_entries(xml_bytes: bytes) -> List[Tuple[str, str]]:
    """Devuelve [(link, titulo)] del feed RSS/Atom."""
    entries: List[Tuple[str, str]] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return entries

    # Namespaces comunes
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "dc": "http://purl.org/dc/elements/1.1/",
        "content": "http://purl.org/rss/1.0/modules/content/",
    }

    # RSS 2.0 (<channel><item>)
    channel = root.find("channel")
    if channel is not None:
        for item in channel.findall("item"):
            title_el = item.find("title")
            link_el = item.find("link")
            title = (title_el.text or "").strip() if title_el is not None else ""
            link = (link_el.text or "").strip() if link_el is not None else ""
            if link and title:
                entries.append((link, title))
        return entries

    # Atom (<feed><entry>)
    for entry in root.findall("atom:entry", ns):
        title_el = entry.find("atom:title", ns)
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        if link_el is None:
            link_el = entry.find("atom:link", ns)
        title = (title_el.text or "").strip() if title_el is not None else ""
        link = (link_el.get("href") or "").strip() if link_el is not None else ""
        if link and title:
            entries.append((link, title))

    return entries


# ---------------------------- Resumen con el Agente --------------------------
def generar_resumen_via_agente(url_o_texto: str, base_url: str = "http://localhost:3000") -> str:
    """Pide resumen al backend (usa generarResumenIA internamente)."""
    try:
        # Construcción del endpoint
        api_url = urllib.parse.urljoin(base_url.rstrip("/") + "/", "api/Newsletter/analizar")
        resp = http_post_json(api_url, {"input": url_o_texto})
        resumen = resp.get("resumen") or resp.get("Resumen") or ""
        if isinstance(resumen, str) and resumen.strip():
            return resumen.strip()
        # fallback si no vino en la clave esperada
        return ""
    except urllib.error.URLError:
        return ""
    except Exception:
        return ""


# ------------------------------ Acceso a la BDD ------------------------------
def get_psycopg2_conn(db_conf: dict):
    """Crea conexión psycopg2 o devuelve None si falla."""
    try:
        import psycopg2  # type: ignore
        conn = psycopg2.connect(
            host=db_conf["host"],
            dbname=db_conf["database"],
            user=db_conf["user"],
            password=db_conf["password"],
            port=db_conf["port"],
        )
        conn.autocommit = True
        return conn
    except Exception as e:
        print(f"[WARN] No se pudo crear conexión con psycopg2: {e}")
        return None


def newsletter_exists(conn, link: str) -> bool:
    # ¿Ya existe este link en "Newsletter"?
    sql = 'SELECT 1 FROM "Newsletter" WHERE link = %s LIMIT 1'
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (link,))
            return cur.fetchone() is not None
    except Exception as e:
        print(f"[ERROR] Verificando existencia de newsletter: {e}")
        return False


def insert_newsletter(conn, link: str, titulo: str, resumen: str) -> bool:
    # Inserta en "Newsletter" (evitamos duplicar revisando antes por link)
    sql = 'INSERT INTO "Newsletter" (link, "Resumen", titulo) VALUES (%s, %s, %s)'
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (link, resumen, titulo))
        return True
    except Exception as e:
        print(f"[ERROR] Insertando newsletter: {e}")
        return False


# ------------------------------ Dominio permitido -----------------------------
def is_allowed_feed(url: str) -> bool:
    # Solo aceptar el feed indicado por el usuario
    try:
        parsed = urllib.parse.urlparse(url)
        return (parsed.scheme in ("http", "https") and
                parsed.netloc.lower() == "pulsobyantom.substack.com" and
                parsed.path.rstrip("/") == "/feed")
    except Exception:
        return False


def is_allowed_link(url: str) -> bool:
    # Solo aceptar links del mismo dominio del feed
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and parsed.netloc.lower() == "pulsobyantom.substack.com"
    except Exception:
        return False


# ----------------------------------- Main ------------------------------------
def main() -> int:
    load_env_file_if_exists()
    db_conf = get_db_config()

    feed_url = "https://pulsobyantom.substack.com/feed"
    backend_base_url = os.environ.get("BACKEND_BASE_URL", "http://localhost:3000")
    test_mode = ("--test" in sys.argv) or (os.environ.get("SUBSTACK_TEST") == "1")

    # Validación estricta del feed
    if not is_allowed_feed(feed_url):
        print("❌ Feed no permitido. Este script solo acepta https://pulsobyantom.substack.com/feed")
        return 1

    try:
        # User-Agent explícito para evitar bloqueos básicos
        raw_xml = http_get(feed_url, headers={"User-Agent": "Mozilla/5.0"})
    except Exception as e:
        print(f"❌ Error obteniendo feed: {e}")
        return 1

    entries = parse_feed_entries(raw_xml)
    total_detectados = len(entries)
    agregados_nuevos = 0
    ya_registrados = 0

    # Modo prueba rápida: primer item -> pedir import al backend y mostrar respuesta
    if test_mode:
        first = next(((l, t) for (l, t) in entries if is_allowed_link(l)), None)
        if not first:
            print("⚠️ No hay entradas válidas para prueba.")
            return 0
        link, titulo = first
        try:
            api_url = urllib.parse.urljoin(backend_base_url.rstrip("/") + "/", "api/Newsletter/import-fast")
            resp = http_post_json(api_url, {"link": link, "titulo": titulo})
            print("[TEST] Respuesta /api/Newsletter/import:")
            print(json.dumps(resp, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"ERROR backend: {e}")
            print("TIP: asegúrate de tener el backend corriendo en BACKEND_BASE_URL y que /api/Newsletter/import-fast exista")
        return 0

    if total_detectados == 0:
        print("WARN: No se detectaron entradas en el feed.")
        print("Total: 0 | Nuevos: 0 | Ya registrados: 0")
        return 0

    conn = get_psycopg2_conn(db_conf)
    if conn is None:
        print("❌ No hay conexión a la base de datos Postgres. Instala psycopg2 y configura el .env.")
        return 2

    try:
        for link, titulo in entries:
            # Restringir dominio de cada item a pulsobyantom.substack.com
            if not is_allowed_link(link):
                # Saltar cualquier link fuera del dominio esperado
                ya_registrados += 0  # no afecta conteos
                continue
            # Evitar duplicados por link
            if newsletter_exists(conn, link):
                ya_registrados += 1
                continue

            # Llamar al backend para importar+resumir+upsert
            try:
                api_url = urllib.parse.urljoin(backend_base_url.rstrip("/") + "/", "api/Newsletter/import-fast")
                resp = http_post_json(api_url, {"link": link, "titulo": titulo})
                if resp.get("duplicated"):
                    ya_registrados += 1
                else:
                    agregados_nuevos += 1
            except Exception:
                # Fallback: si backend no está, intentar vía conexión directa (resumen vacío)
                ok = insert_newsletter(conn, link, titulo, "")
                if ok:
                    agregados_nuevos += 1
    finally:
        try:
            conn.close()
        except Exception:
            pass

    print(f"Total detectados: {total_detectados}")
    print(f"Nuevos agregados: {agregados_nuevos}")
    print(f"Ya registrados: {ya_registrados}")
    return 0


if __name__ == "__main__":
    sys.exit(main())


